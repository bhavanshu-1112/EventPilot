/**
 * Deterministic quote-flag rules.
 * Flags hidden costs, inconsistencies, and risk factors in vendor quotes.
 * Pure function — no I/O.
 */
import type { ExtractedQuote, QuoteFlag, QuoteFlagSeverity, TaxConfig } from '@eventpilot/shared';

let flagCounter = 0;
function nextFlagId(): string {
  flagCounter += 1;
  return `flag-${String(flagCounter)}`;
}

/** Reset flag counter (for testing) */
export function resetFlagCounter(): void {
  flagCounter = 0;
}

export interface FlagContext {
  /** Tax configuration (sample data) */
  readonly taxConfig: TaxConfig;
  /** Expected guest count */
  readonly guestCount: number;
  /** Quote ID for reference */
  readonly quoteId: string;
  /** Current time in milliseconds since epoch (injected clock, no Date.now()) */
  readonly nowMs: number;
}

/**
 * Run all deterministic flag rules against an extracted quote.
 */
export function flagQuote(quote: ExtractedQuote, context: FlagContext): QuoteFlag[] {
  const flags: QuoteFlag[] = [];

  flags.push(...checkTaxExcluded(quote, context));
  flags.push(...checkServiceChargeMissing(quote, context));
  flags.push(...checkSumMismatch(quote, context));
  flags.push(...checkQuantityMismatch(quote, context));
  flags.push(...checkValidityExpired(quote, context));
  flags.push(...checkHighDeposit(quote, context));
  flags.push(...checkNonRefundable(quote, context));
  flags.push(...checkOvertimeAndCorkage(quote, context));
  flags.push(...checkSetupTeardown(quote, context));
  flags.push(...checkTravelStay(quote, context));

  return flags;
}

function createFlag(
  quoteId: string,
  ruleId: string,
  severity: QuoteFlagSeverity,
  message: string,
  explanation: string,
  sourceRef?: string,
): QuoteFlag {
  return {
    id: nextFlagId(),
    quoteId,
    ruleId,
    severity,
    message,
    explanation,
    sourceRef,
    source: 'deterministic',
  };
}

/**
 * Flag line items where tax is excluded.
 */
function checkTaxExcluded(quote: ExtractedQuote, context: FlagContext): QuoteFlag[] {
  const flags: QuoteFlag[] = [];

  for (const item of quote.lineItems) {
    if (!item.taxIncluded) {
      const applicableRates = context.taxConfig.gstRates.filter((r) =>
        r.appliesTo.includes(quote.category),
      );
      const rateStr =
        applicableRates.length > 0
          ? applicableRates.map((r) => `${String(r.rate * 100)}% ${r.name}`).join(', ')
          : 'applicable GST';

      flags.push(
        createFlag(
          context.quoteId,
          'TAX_EXCLUDED',
          'warning',
          `Tax excluded on "${item.description}"`,
          `This line item's price does not include tax. You may need to add ${rateStr}. This could increase the cost by ₹${String(Math.round((item.totalMinor * (applicableRates[0]?.rate ?? 0.18)) / 100))}.`,
          item.sourceRef,
        ),
      );
    }
  }

  return flags;
}

/**
 * Flag when service charge is missing or excluded.
 */
function checkServiceChargeMissing(quote: ExtractedQuote, context: FlagContext): QuoteFlag[] {
  const hasSCFee = quote.fees.some(
    (f) =>
      f.type.toLowerCase().includes('service') &&
      ((f.amountMinor ?? 0) > 0 || (f.percent ?? 0) > 0),
  );
  const hasSCInclusion = quote.inclusions.some((i) => i.toLowerCase().includes('service charge'));

  if (!hasSCFee && !hasSCInclusion && quote.category === 'catering') {
    return [
      createFlag(
        context.quoteId,
        'SERVICE_CHARGE_MISSING',
        'warning',
        'Service charge not mentioned',
        `No service charge is listed in the fees or inclusions. Many caterers add ${String(context.taxConfig.serviceCharge.rate * 100)}% service charge. Clarify with the vendor.`,
      ),
    ];
  }

  return [];
}

/**
 * Flag when computed line item total doesn't match stated total.
 */
function checkSumMismatch(quote: ExtractedQuote, context: FlagContext): QuoteFlag[] {
  if (quote.statedTotalMinor === undefined) return [];

  const computedTotal = quote.lineItems.reduce((acc, item) => acc + item.totalMinor, 0);
  const feesTotal = quote.fees.reduce((acc, fee) => acc + (fee.amountMinor ?? 0), 0);

  const diff = Math.abs(quote.statedTotalMinor - (computedTotal + feesTotal));
  // Allow 1% tolerance for rounding
  const tolerance = Math.max(100, Math.ceil(quote.statedTotalMinor * 0.01));

  if (diff > tolerance) {
    return [
      createFlag(
        context.quoteId,
        'SUM_MISMATCH',
        'critical',
        "Line items don't add up to stated total",
        `Computed total (₹${String(Math.round((computedTotal + feesTotal) / 100))}) differs from stated total (₹${String(Math.round(quote.statedTotalMinor / 100))}) by ₹${String(Math.round(diff / 100))}. There may be hidden charges or errors.`,
      ),
    ];
  }

  return [];
}

/**
 * Flag when item quantities don't match guest count.
 */
function checkQuantityMismatch(quote: ExtractedQuote, context: FlagContext): QuoteFlag[] {
  const flags: QuoteFlag[] = [];
  const perPersonUnits = ['per person', 'per guest', 'per head', 'per plate', 'pax'];

  for (const item of quote.lineItems) {
    const isPerPerson = perPersonUnits.some((u) => item.unit.toLowerCase().includes(u));

    if (isPerPerson && item.quantity < context.guestCount * 0.8) {
      flags.push(
        createFlag(
          context.quoteId,
          'QUANTITY_MISMATCH',
          'warning',
          `Quantity mismatch for "${item.description}"`,
          `Quoted for ${String(item.quantity)} ${item.unit} but expected ~${String(context.guestCount)} guests. You may be under-quoted.`,
          item.sourceRef,
        ),
      );
    }
  }

  return flags;
}

/**
 * Flag when quote validity has expired.
 */
function checkValidityExpired(quote: ExtractedQuote, context: FlagContext): QuoteFlag[] {
  if (!quote.validUntil) return [];

  const validDate = new Date(quote.validUntil);
  const now = new Date(context.nowMs);

  if (validDate < now) {
    return [
      createFlag(
        context.quoteId,
        'VALIDITY_EXPIRED',
        'critical',
        'Quote has expired',
        `This quote was valid until ${quote.validUntil}. Prices may have changed. Request an updated quote.`,
      ),
    ];
  }

  return [];
}

/**
 * Flag high deposit percentage.
 */
function checkHighDeposit(quote: ExtractedQuote, context: FlagContext): QuoteFlag[] {
  const flags: QuoteFlag[] = [];
  const depositThreshold = 0.5; // 50%

  for (const fee of quote.fees) {
    if (fee.type.toLowerCase().includes('deposit') || fee.type.toLowerCase().includes('advance')) {
      if (fee.percent !== undefined && fee.percent > depositThreshold) {
        flags.push(
          createFlag(
            context.quoteId,
            'HIGH_DEPOSIT',
            'warning',
            `High deposit: ${String(Math.round(fee.percent * 100))}%`,
            `A deposit above ${String(depositThreshold * 100)}% is unusual. Negotiate for a lower advance or milestone-based payments.`,
            fee.sourceRef,
          ),
        );
      }
    }
  }

  return flags;
}

/**
 * Flag non-refundable terms.
 */
function checkNonRefundable(quote: ExtractedQuote, context: FlagContext): QuoteFlag[] {
  if (!quote.cancellationTerms) return [];

  const terms = quote.cancellationTerms.toLowerCase();
  if (
    terms.includes('non-refundable') ||
    terms.includes('no refund') ||
    terms.includes('non refundable')
  ) {
    return [
      createFlag(
        context.quoteId,
        'NON_REFUNDABLE',
        'info',
        'Non-refundable terms',
        `The cancellation terms include non-refundable clauses: "${quote.cancellationTerms}". Consider negotiating partial refund terms.`,
      ),
    ];
  }

  return [];
}

/**
 * Flag overtime and corkage charges.
 */
function checkOvertimeAndCorkage(quote: ExtractedQuote, context: FlagContext): QuoteFlag[] {
  const flags: QuoteFlag[] = [];

  for (const fee of quote.fees) {
    const type = fee.type.toLowerCase();
    if (type.includes('overtime') || type.includes('extra hour')) {
      flags.push(
        createFlag(
          context.quoteId,
          'OVERTIME_CHARGE',
          'info',
          `Overtime charge: ${fee.amountMinor ? `₹${String(Math.round(fee.amountMinor / 100))}` : `${String(Math.round((fee.percent ?? 0) * 100))}%`}`,
          `The vendor charges for overtime. Plan your schedule to avoid this, or budget for it.`,
          fee.sourceRef,
        ),
      );
    }

    if (type.includes('corkage')) {
      flags.push(
        createFlag(
          context.quoteId,
          'CORKAGE_CHARGE',
          'info',
          `Corkage charge: ${fee.amountMinor ? `₹${String(Math.round(fee.amountMinor / 100))}` : 'see details'}`,
          `Corkage fee applies if you bring your own beverages. Consider whether venue beverages are more cost-effective.`,
          fee.sourceRef,
        ),
      );
    }
  }

  return flags;
}

/**
 * Flag setup/teardown fees.
 */
function checkSetupTeardown(quote: ExtractedQuote, context: FlagContext): QuoteFlag[] {
  const flags: QuoteFlag[] = [];

  for (const fee of quote.fees) {
    const type = fee.type.toLowerCase();
    if (type.includes('setup') || type.includes('teardown') || type.includes('installation')) {
      flags.push(
        createFlag(
          context.quoteId,
          'SETUP_TEARDOWN_FEE',
          'info',
          `Setup/teardown fee: ₹${String(Math.round((fee.amountMinor ?? 0) / 100))}`,
          `Separate charges for setup and teardown. Check if this can be included in the base price.`,
          fee.sourceRef,
        ),
      );
    }
  }

  return flags;
}

/**
 * Flag travel and stay charges.
 */
function checkTravelStay(quote: ExtractedQuote, context: FlagContext): QuoteFlag[] {
  const flags: QuoteFlag[] = [];

  for (const fee of quote.fees) {
    const type = fee.type.toLowerCase();
    if (
      type.includes('travel') ||
      type.includes('stay') ||
      type.includes('accommodation') ||
      type.includes('transport')
    ) {
      flags.push(
        createFlag(
          context.quoteId,
          'TRAVEL_STAY_CHARGE',
          'info',
          `Travel/stay charge: ₹${String(Math.round((fee.amountMinor ?? 0) / 100))}`,
          `Additional charges for vendor travel and accommodation. Consider local vendors to avoid these.`,
          fee.sourceRef,
        ),
      );
    }
  }

  return flags;
}
