import React from 'react';
import { formatMoney, type CurrencyCode } from '@eventpilot/shared';
import { useEvent } from '../../context/EventContext.js';
import { Badge } from '../common/Badge.js';

export interface BomItemDisplay {
  id: string;
  category: string;
  item: string;
  quantity: number;
  unit: string;
  catalogKey?: string;
  selectedTier: 'save' | 'standard' | 'splurge';
  tiers: {
    save: { unitPriceMinor: number; totalMinor: number; description: string };
    standard: { unitPriceMinor: number; totalMinor: number; description: string };
    splurge: { unitPriceMinor: number; totalMinor: number; description: string };
  };
}

interface BomTableProps {
  items: BomItemDisplay[];
  onTierChange: (itemId: string, tier: 'save' | 'standard' | 'splurge') => void;
  isLoading?: boolean;
}

export const BomTable: React.FC<BomTableProps> = ({ items, onTierChange, isLoading }) => {
  const { currentEvent } = useEvent();

  if (isLoading) {
    return (
      <div className="glass-card p-8 text-center text-sm text-slate-500">
        Loading Bill of Materials...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-slate-500 dark:text-slate-400">
        <p className="text-sm font-medium mb-1">No Bill of Materials items yet.</p>
        <p className="text-xs">
          Upload an inspiration moodboard photo above to automatically extract and catalog-price
          items.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Bill of Materials (BOM) &amp; Catalog Pricing
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Priced against Udaipur local vendor catalog with 3 cost tiers
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
          {items.length} items
        </span>
      </div>

      {/* Accessible Table in scrollable container */}
      <div
        role="region"
        aria-label="Bill of Materials Table"
        className="overflow-x-auto focus:outline-none"
      >
        <table className="w-full text-left border-collapse text-xs">
          <caption className="sr-only">
            Bill of Materials detailing item name, category, quantity, selected tier, and price
            estimate
          </caption>
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
              <th scope="col" className="px-6 py-3 font-semibold">
                Item &amp; Category
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Quantity
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Tier Selection
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Material Description
              </th>
              <th scope="col" className="px-6 py-3 font-semibold text-right">
                Estimated Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {items.map((item) => {
              const activeTierData = item.tiers[item.selectedTier];
              const totalMinor = activeTierData?.totalMinor ?? 0;

              return (
                <tr
                  key={item.id}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <th
                    scope="row"
                    className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100"
                  >
                    <span className="block text-sm font-semibold">{item.item}</span>
                    <Badge variant="neutral" size="sm" className="mt-1">
                      {item.category}
                    </Badge>
                  </th>

                  <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                    {item.quantity} {item.unit}
                  </td>

                  <td className="px-4 py-4">
                    <div
                      className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-900"
                      role="radiogroup"
                      aria-label={`Tier for ${item.item}`}
                    >
                      {(['save', 'standard', 'splurge'] as const).map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          role="radio"
                          aria-checked={item.selectedTier === tier}
                          onClick={() => onTierChange(item.id, tier)}
                          className={`px-2 py-1 rounded text-[11px] font-semibold transition capitalize ${
                            item.selectedTier === tier
                              ? 'bg-brand-600 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                          }`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                  </td>

                  <td className="px-4 py-4 text-slate-500 dark:text-slate-400 max-w-xs">
                    {activeTierData?.description || 'Catalog standard finish'}
                  </td>

                  <td className="px-6 py-4 text-right">
                    <span className="block font-bold text-slate-900 dark:text-slate-100">
                      {formatMoney(totalMinor, currentEvent.currency as CurrencyCode)}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                      (estimate)
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
