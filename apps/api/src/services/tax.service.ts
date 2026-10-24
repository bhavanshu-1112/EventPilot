import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TaxConfig } from '@eventpilot/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TAX_RULES_PATH = path.resolve(__dirname, '../../../../samples/tax-rules.json');

export function loadTaxConfig(): TaxConfig {
  try {
    if (fs.existsSync(TAX_RULES_PATH)) {
      return JSON.parse(fs.readFileSync(TAX_RULES_PATH, 'utf-8')) as TaxConfig;
    }
  } catch {
    // Fallback if read fails
  }
  return {
    _note: 'SAMPLE DATA, not real market prices or formal tax advice.',
    gstRates: [
      {
        id: 'gst-catering',
        name: 'Catering GST',
        rate: 0.05,
        appliesTo: ['catering'],
        note: '5% GST',
      },
      {
        id: 'gst-standard',
        name: 'Standard GST',
        rate: 0.18,
        appliesTo: ['venue', 'decor', 'photography'],
        note: '18% GST',
      },
    ],
    serviceCharge: { rate: 0.1, note: '10% discretionary hospitality service charge' },
  };
}

export interface AllInCalculationResult {
  baseSubtotalMinor: number;
  estimatedGstMinor: number;
  estimatedServiceChargeMinor: number;
  allInTotalMinor: number;
  assumptions: {
    gstRateApplied: number;
    serviceChargeRateApplied: number;
    isEstimate: boolean;
    note: string;
  };
}

export function computeAllInQuoteTotal(
  category: string,
  lineItems: Array<{ total_minor: number | string; tax_included: boolean }>,
  flags: Array<{ rule_id: string }>,
  taxConfig: TaxConfig = loadTaxConfig(),
): AllInCalculationResult {
  const baseSubtotalMinor = lineItems.reduce((sum, item) => sum + Number(item.total_minor), 0);

  // Check if any line item has tax excluded or has TAX_EXCLUDED flag
  const hasTaxExcluded =
    lineItems.some((li) => !li.tax_included) || flags.some((f) => f.rule_id === 'TAX_EXCLUDED');
  const defaultGst = taxConfig.gstRates[0] ?? {
    id: 'gst-default',
    name: 'Default GST',
    rate: 0.18,
    appliesTo: [],
    note: 'Default',
  };
  const matchedGst = taxConfig.gstRates.find((r) => r.appliesTo.includes(category)) ?? defaultGst;
  const gstRateApplied = hasTaxExcluded ? matchedGst.rate : 0;
  const estimatedGstMinor = Math.round(baseSubtotalMinor * gstRateApplied);

  // Check if service charge is missing
  const hasServiceChargeMissing = flags.some((f) => f.rule_id === 'SERVICE_CHARGE_MISSING');
  const serviceChargeRateApplied = hasServiceChargeMissing ? taxConfig.serviceCharge.rate : 0;
  const estimatedServiceChargeMinor = Math.round(baseSubtotalMinor * serviceChargeRateApplied);

  const allInTotalMinor = baseSubtotalMinor + estimatedGstMinor + estimatedServiceChargeMinor;

  return {
    baseSubtotalMinor,
    estimatedGstMinor,
    estimatedServiceChargeMinor,
    allInTotalMinor,
    assumptions: {
      gstRateApplied,
      serviceChargeRateApplied,
      isEstimate: hasTaxExcluded || hasServiceChargeMissing,
      note: 'Estimated all-in total based on standard hospitality tax rules.',
    },
  };
}
