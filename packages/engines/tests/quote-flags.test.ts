import { flagQuote, resetFlagCounter, type FlagContext } from '../src/quote-flags/rules.js';
import type { ExtractedQuote, TaxConfig } from '@eventpilot/shared';

// ── Helpers ────────────────────────────────────────────────────────────

const sampleTaxConfig: TaxConfig = {
  _note: 'SAMPLE DATA — not real tax rates',
  gstRates: [
    {
      id: 'gst-18',
      name: 'GST',
      rate: 0.18,
      appliesTo: ['venue', 'catering', 'decor', 'photography', 'entertainment'],
      note: 'Standard GST rate',
    },
    {
      id: 'gst-5',
      name: 'GST (reduced)',
      rate: 0.05,
      appliesTo: ['logistics'],
      note: 'Reduced GST',
    },
  ],
  serviceCharge: { rate: 0.1, note: 'Standard service charge for catering' },
};

function makeContext(overrides?: Partial<FlagContext>): FlagContext {
  return {
    taxConfig: sampleTaxConfig,
    guestCount: 300,
    quoteId: 'test-quote-1',
    nowMs: Date.now(),
    ...overrides,
  };
}

function makeQuote(overrides?: Partial<ExtractedQuote>): ExtractedQuote {
  return {
    vendorName: 'Test Vendor',
    category: 'catering',
    currency: 'INR',
    lineItems: [
      {
        id: 'item-1',
        description: 'Main Course',
        quantity: 300,
        unit: 'per person',
        unitPriceMinor: 50000,
        totalMinor: 15_000_000,
        taxIncluded: true,
        sourceRef: 'Page 1',
      },
    ],
    inclusions: ['Service charge included'],
    exclusions: [],
    fees: [],
    confidence: 0.9,
    ...overrides,
  };
}

beforeEach(() => {
  resetFlagCounter();
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('flagQuote', () => {
  it('returns no flags for a clean quote', () => {
    const quote = makeQuote();
    const flags = flagQuote(quote, makeContext());
    expect(flags).toHaveLength(0);
  });

  it('generates unique flag IDs', () => {
    const quote = makeQuote({
      lineItems: [
        {
          id: 'item-1',
          description: 'A',
          quantity: 300,
          unit: 'per person',
          unitPriceMinor: 1000,
          totalMinor: 300_000,
          taxIncluded: false,
          sourceRef: 'p1',
        },
        {
          id: 'item-2',
          description: 'B',
          quantity: 300,
          unit: 'per person',
          unitPriceMinor: 2000,
          totalMinor: 600_000,
          taxIncluded: false,
          sourceRef: 'p2',
        },
      ],
    });
    const flags = flagQuote(quote, makeContext());
    const ids = flags.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all flags have source="deterministic"', () => {
    const quote = makeQuote({
      lineItems: [
        {
          id: 'item-1',
          description: 'A',
          quantity: 300,
          unit: 'per person',
          unitPriceMinor: 1000,
          totalMinor: 300_000,
          taxIncluded: false,
        },
      ],
    });
    const flags = flagQuote(quote, makeContext());
    for (const flag of flags) {
      expect(flag.source).toBe('deterministic');
    }
  });
});

describe('TAX_EXCLUDED rule', () => {
  it('flags line items where tax is not included', () => {
    const quote = makeQuote({
      lineItems: [
        {
          id: 'item-1',
          description: 'Main Course',
          quantity: 300,
          unit: 'per person',
          unitPriceMinor: 50000,
          totalMinor: 15_000_000,
          taxIncluded: false,
          sourceRef: 'Page 1',
        },
      ],
    });
    const flags = flagQuote(quote, makeContext());
    const taxFlags = flags.filter((f) => f.ruleId === 'TAX_EXCLUDED');
    expect(taxFlags).toHaveLength(1);
    expect(taxFlags[0]!.severity).toBe('warning');
    expect(taxFlags[0]!.sourceRef).toBe('Page 1');
  });

  it('does not flag when tax is included', () => {
    const quote = makeQuote();
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'TAX_EXCLUDED')).toHaveLength(0);
  });

  it('flags multiple items with excluded tax', () => {
    const quote = makeQuote({
      lineItems: [
        {
          id: 'item-1',
          description: 'A',
          quantity: 300,
          unit: 'plate',
          unitPriceMinor: 1000,
          totalMinor: 300_000,
          taxIncluded: false,
        },
        {
          id: 'item-2',
          description: 'B',
          quantity: 300,
          unit: 'plate',
          unitPriceMinor: 2000,
          totalMinor: 600_000,
          taxIncluded: false,
        },
      ],
    });
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'TAX_EXCLUDED')).toHaveLength(2);
  });
});

describe('SERVICE_CHARGE_MISSING rule', () => {
  it('flags catering quote without service charge', () => {
    const quote = makeQuote({
      category: 'catering',
      inclusions: [], // No service charge mentioned
    });
    const flags = flagQuote(quote, makeContext());
    const scFlags = flags.filter((f) => f.ruleId === 'SERVICE_CHARGE_MISSING');
    expect(scFlags).toHaveLength(1);
    expect(scFlags[0]!.severity).toBe('warning');
  });

  it('does not flag when service charge is in inclusions', () => {
    const quote = makeQuote({
      category: 'catering',
      inclusions: ['Service charge included'],
    });
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'SERVICE_CHARGE_MISSING')).toHaveLength(0);
  });

  it('does not flag when service charge is in fees', () => {
    const quote = makeQuote({
      category: 'catering',
      inclusions: [],
      fees: [{ type: 'Service Charge', percent: 0.1, basis: 'total' }],
    });
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'SERVICE_CHARGE_MISSING')).toHaveLength(0);
  });

  it('does not flag non-catering categories', () => {
    const quote = makeQuote({
      category: 'photography',
      inclusions: [],
    });
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'SERVICE_CHARGE_MISSING')).toHaveLength(0);
  });
});

describe('SUM_MISMATCH rule', () => {
  it('flags when computed total differs from stated total', () => {
    const quote = makeQuote({
      statedTotalMinor: 20_000_000, // Says ₹2,00,000 but items add to ₹1,50,000
      lineItems: [
        {
          id: 'item-1',
          description: 'A',
          quantity: 300,
          unit: 'plate',
          unitPriceMinor: 50000,
          totalMinor: 15_000_000,
          taxIncluded: true,
        },
      ],
    });
    const flags = flagQuote(quote, makeContext());
    const mismatchFlags = flags.filter((f) => f.ruleId === 'SUM_MISMATCH');
    expect(mismatchFlags).toHaveLength(1);
    expect(mismatchFlags[0]!.severity).toBe('critical');
  });

  it('does not flag when stated total is absent', () => {
    const quote = makeQuote();
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'SUM_MISMATCH')).toHaveLength(0);
  });

  it('does not flag when totals match within tolerance', () => {
    const quote = makeQuote({
      statedTotalMinor: 15_000_050, // Tiny difference
      lineItems: [
        {
          id: 'item-1',
          description: 'A',
          quantity: 300,
          unit: 'plate',
          unitPriceMinor: 50000,
          totalMinor: 15_000_000,
          taxIncluded: true,
        },
      ],
    });
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'SUM_MISMATCH')).toHaveLength(0);
  });
});

describe('QUANTITY_MISMATCH rule', () => {
  it('flags per-person items under guest count', () => {
    const quote = makeQuote({
      lineItems: [
        {
          id: 'item-1',
          description: 'Main Course',
          quantity: 200,
          unit: 'per person',
          unitPriceMinor: 50000,
          totalMinor: 10_000_000,
          taxIncluded: true,
        },
      ],
    });
    const flags = flagQuote(quote, makeContext({ guestCount: 300 }));
    const qFlags = flags.filter((f) => f.ruleId === 'QUANTITY_MISMATCH');
    expect(qFlags).toHaveLength(1);
    expect(qFlags[0]!.severity).toBe('warning');
  });

  it('does not flag when quantity matches guest count', () => {
    const quote = makeQuote({
      lineItems: [
        {
          id: 'item-1',
          description: 'Main Course',
          quantity: 300,
          unit: 'per person',
          unitPriceMinor: 50000,
          totalMinor: 15_000_000,
          taxIncluded: true,
        },
      ],
    });
    const flags = flagQuote(quote, makeContext({ guestCount: 300 }));
    expect(flags.filter((f) => f.ruleId === 'QUANTITY_MISMATCH')).toHaveLength(0);
  });

  it('does not flag non-per-person units', () => {
    const quote = makeQuote({
      lineItems: [
        {
          id: 'item-1',
          description: 'Tables',
          quantity: 10,
          unit: 'piece',
          unitPriceMinor: 100000,
          totalMinor: 1_000_000,
          taxIncluded: true,
        },
      ],
    });
    const flags = flagQuote(quote, makeContext({ guestCount: 300 }));
    expect(flags.filter((f) => f.ruleId === 'QUANTITY_MISMATCH')).toHaveLength(0);
  });

  it('recognizes various per-person unit names', () => {
    const units = ['per person', 'per guest', 'per head', 'per plate', 'pax'];
    for (const unit of units) {
      resetFlagCounter();
      const quote = makeQuote({
        lineItems: [
          {
            id: 'item-1',
            description: 'Item',
            quantity: 100,
            unit,
            unitPriceMinor: 1000,
            totalMinor: 100_000,
            taxIncluded: true,
          },
        ],
      });
      const flags = flagQuote(quote, makeContext({ guestCount: 300 }));
      expect(flags.filter((f) => f.ruleId === 'QUANTITY_MISMATCH').length).toBe(1);
    }
  });
});

describe('VALIDITY_EXPIRED rule', () => {
  it('flags expired quotes', () => {
    const quote = makeQuote({
      validUntil: '2020-01-01',
    });
    const flags = flagQuote(quote, makeContext());
    const vFlags = flags.filter((f) => f.ruleId === 'VALIDITY_EXPIRED');
    expect(vFlags).toHaveLength(1);
    expect(vFlags[0]!.severity).toBe('critical');
  });

  it('does not flag future validity', () => {
    const quote = makeQuote({
      validUntil: '2099-12-31',
    });
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'VALIDITY_EXPIRED')).toHaveLength(0);
  });

  it('does not flag when validity is absent', () => {
    const quote = makeQuote();
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'VALIDITY_EXPIRED')).toHaveLength(0);
  });
});

describe('HIGH_DEPOSIT rule', () => {
  it('flags deposits above 50%', () => {
    const quote = makeQuote({
      fees: [{ type: 'Advance Deposit', percent: 0.75, basis: 'total' }],
    });
    const flags = flagQuote(quote, makeContext());
    const dFlags = flags.filter((f) => f.ruleId === 'HIGH_DEPOSIT');
    expect(dFlags).toHaveLength(1);
    expect(dFlags[0]!.severity).toBe('warning');
  });

  it('does not flag deposits at or below 50%', () => {
    const quote = makeQuote({
      fees: [{ type: 'Advance Deposit', percent: 0.4, basis: 'total' }],
    });
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'HIGH_DEPOSIT')).toHaveLength(0);
  });
});

describe('NON_REFUNDABLE rule', () => {
  it('flags non-refundable cancellation terms', () => {
    const quote = makeQuote({
      cancellationTerms: 'All payments are non-refundable once confirmed.',
    });
    const flags = flagQuote(quote, makeContext());
    const nrFlags = flags.filter((f) => f.ruleId === 'NON_REFUNDABLE');
    expect(nrFlags).toHaveLength(1);
    expect(nrFlags[0]!.severity).toBe('info');
  });

  it('does not flag refundable terms', () => {
    const quote = makeQuote({
      cancellationTerms: '50% refund if cancelled 30 days before event.',
    });
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'NON_REFUNDABLE')).toHaveLength(0);
  });

  it('does not flag absent cancellation terms', () => {
    const quote = makeQuote();
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'NON_REFUNDABLE')).toHaveLength(0);
  });
});

describe('OVERTIME_CHARGE rule', () => {
  it('flags overtime fees', () => {
    const quote = makeQuote({
      fees: [{ type: 'Overtime charge per hour', amountMinor: 500000 }],
    });
    const flags = flagQuote(quote, makeContext());
    const otFlags = flags.filter((f) => f.ruleId === 'OVERTIME_CHARGE');
    expect(otFlags).toHaveLength(1);
    expect(otFlags[0]!.severity).toBe('info');
  });

  it('flags extra hour fees', () => {
    const quote = makeQuote({
      fees: [{ type: 'Extra hour rate', amountMinor: 300000 }],
    });
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'OVERTIME_CHARGE')).toHaveLength(1);
  });
});

describe('CORKAGE_CHARGE rule', () => {
  it('flags corkage fees', () => {
    const quote = makeQuote({
      fees: [{ type: 'Corkage fee', amountMinor: 200000 }],
    });
    const flags = flagQuote(quote, makeContext());
    const cFlags = flags.filter((f) => f.ruleId === 'CORKAGE_CHARGE');
    expect(cFlags).toHaveLength(1);
    expect(cFlags[0]!.severity).toBe('info');
  });
});

describe('SETUP_TEARDOWN_FEE rule', () => {
  it('flags setup fees', () => {
    const quote = makeQuote({
      fees: [{ type: 'Setup and installation', amountMinor: 100000 }],
    });
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'SETUP_TEARDOWN_FEE')).toHaveLength(1);
  });

  it('flags teardown fees', () => {
    const quote = makeQuote({
      fees: [{ type: 'Teardown charges', amountMinor: 50000 }],
    });
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'SETUP_TEARDOWN_FEE')).toHaveLength(1);
  });
});

describe('TRAVEL_STAY_CHARGE rule', () => {
  it('flags travel charges', () => {
    const quote = makeQuote({
      fees: [{ type: 'Travel expenses', amountMinor: 150000 }],
    });
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'TRAVEL_STAY_CHARGE')).toHaveLength(1);
  });

  it('flags accommodation charges', () => {
    const quote = makeQuote({
      fees: [{ type: 'Accommodation for crew', amountMinor: 200000 }],
    });
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'TRAVEL_STAY_CHARGE')).toHaveLength(1);
  });

  it('flags transport charges', () => {
    const quote = makeQuote({
      fees: [{ type: 'Transport logistics', amountMinor: 80000 }],
    });
    const flags = flagQuote(quote, makeContext());
    expect(flags.filter((f) => f.ruleId === 'TRAVEL_STAY_CHARGE')).toHaveLength(1);
  });
});

describe('combined flags', () => {
  it('detects multiple issues in a messy quote', () => {
    const quote = makeQuote({
      category: 'catering',
      inclusions: [], // No service charge
      statedTotalMinor: 25_000_000,
      validUntil: '2020-06-15',
      cancellationTerms: 'No refund under any circumstances',
      lineItems: [
        {
          id: 'item-1',
          description: 'Dinner Buffet',
          quantity: 200,
          unit: 'per person',
          unitPriceMinor: 80000,
          totalMinor: 16_000_000,
          taxIncluded: false,
          sourceRef: 'p1, para 3',
        },
      ],
      fees: [
        { type: 'Overtime per hour', amountMinor: 500000, sourceRef: 'p3, fine print' },
        { type: 'Setup charges', amountMinor: 200000 },
        { type: 'Advance deposit', percent: 0.6, basis: 'total' },
        { type: 'Travel and stay for chef', amountMinor: 300000 },
      ],
    });
    const flags = flagQuote(quote, makeContext({ guestCount: 300 }));

    // Should trigger: TAX_EXCLUDED, SERVICE_CHARGE_MISSING, SUM_MISMATCH,
    // QUANTITY_MISMATCH, VALIDITY_EXPIRED, NON_REFUNDABLE, OVERTIME_CHARGE,
    // SETUP_TEARDOWN_FEE, HIGH_DEPOSIT, TRAVEL_STAY_CHARGE
    const ruleIds = flags.map((f) => f.ruleId);
    expect(ruleIds).toContain('TAX_EXCLUDED');
    expect(ruleIds).toContain('SERVICE_CHARGE_MISSING');
    expect(ruleIds).toContain('QUANTITY_MISMATCH');
    expect(ruleIds).toContain('VALIDITY_EXPIRED');
    expect(ruleIds).toContain('NON_REFUNDABLE');
    expect(ruleIds).toContain('OVERTIME_CHARGE');
    expect(ruleIds).toContain('SETUP_TEARDOWN_FEE');
    expect(ruleIds).toContain('HIGH_DEPOSIT');
    expect(ruleIds).toContain('TRAVEL_STAY_CHARGE');

    // All flags should have the correct quoteId
    for (const flag of flags) {
      expect(flag.quoteId).toBe('test-quote-1');
    }
  });
});
