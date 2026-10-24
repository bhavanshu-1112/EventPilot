import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InspirationBomItemPayload } from '@eventpilot/shared';
import type {
  CreateBomItemInput,
  CreateBomTierInput,
  BomItemWithTiers,
} from '../db/repositories/bom.repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLES_DIR = path.resolve(__dirname, '../../../../samples');

interface PriceCatalogItem {
  catalogKey: string;
  name: string;
  category: string;
  unit: string;
  tiers: {
    save: { name: string; priceMinor: number; description: string };
    standard: { name: string; priceMinor: number; description: string };
    splurge: { name: string; priceMinor: number; description: string };
  };
}

interface PriceCatalogFile {
  _note: string;
  location: string;
  currency: string;
  items: PriceCatalogItem[];
}

export function loadPriceCatalog(city?: string): PriceCatalogFile {
  const normalizedCity = (city ?? 'udaipur').toLowerCase();
  let filename = `price-table.${normalizedCity}.json`;
  let filePath = path.join(SAMPLES_DIR, filename);

  if (!fs.existsSync(filePath)) {
    filename = 'price-table.udaipur.json';
    filePath = path.join(SAMPLES_DIR, filename);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PriceCatalogFile;
}

export function priceBomItem(
  item: InspirationBomItemPayload,
  catalog: PriceCatalogFile,
): CreateBomItemInput {
  const match = catalog.items.find((ci) => ci.catalogKey === item.catalogKey);
  const quantity = Math.max(1, item.quantity);

  if (match) {
    const tiers: CreateBomTierInput[] = [
      {
        tier: 'save',
        name: match.tiers.save.name,
        priceMinor: match.tiers.save.priceMinor * quantity,
        description: match.tiers.save.description,
      },
      {
        tier: 'standard',
        name: match.tiers.standard.name,
        priceMinor: match.tiers.standard.priceMinor * quantity,
        description: match.tiers.standard.description,
      },
      {
        tier: 'splurge',
        name: match.tiers.splurge.name,
        priceMinor: match.tiers.splurge.priceMinor * quantity,
        description: match.tiers.splurge.description,
      },
    ];

    return {
      catalogKey: item.catalogKey,
      category: item.category,
      label: item.label,
      quantity,
      unit: match.unit,
      selectedTier: 'standard',
      tiers,
    };
  }

  // Fallback if catalogKey not in sample price table
  const baseEstimate = 5000000 * quantity;
  const tiers: CreateBomTierInput[] = [
    {
      tier: 'save',
      name: `Essential ${item.label}`,
      priceMinor: Math.round(baseEstimate * 0.7),
      description: 'Budget tier alternative (estimated)',
    },
    {
      tier: 'standard',
      name: `Standard ${item.label}`,
      priceMinor: baseEstimate,
      description: 'Baseline concept tier (estimated)',
    },
    {
      tier: 'splurge',
      name: `Premium ${item.label}`,
      priceMinor: Math.round(baseEstimate * 1.5),
      description: 'Luxury grade alternative (estimated)',
    },
  ];

  return {
    catalogKey: item.catalogKey,
    category: item.category,
    label: item.label,
    quantity,
    unit: 'package',
    selectedTier: 'standard',
    tiers,
  };
}

export function computeBomTotalMinor(bomItems: BomItemWithTiers[]): number {
  let total = 0;
  for (const item of bomItems) {
    const selectedTier = item.tiers.find((t) => t.tier === item.selected_tier);
    if (selectedTier) {
      total += Number(selectedTier.price_minor);
    }
  }
  return total;
}
