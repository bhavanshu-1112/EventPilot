import React, { useState, useEffect, useRef } from 'react';
import { Sliders, HelpCircle } from 'lucide-react';
import { formatMoney, type CurrencyCode } from '@eventpilot/shared';
import { useEvent } from '../../context/EventContext.js';
import { AccessibleModal } from '../common/AccessibleModal.js';

interface SplurgeSaveSliderProps {
  currentTierValue: number; // 0 = Save, 1 = Standard, 2 = Splurge
  onTierChange: (val: number) => void;
  computedTotalMinor: number;
}

const TIER_DESCRIPTIONS = [
  {
    name: 'Save Tier',
    valueText: 'Save: about 20% below standard using smart seasonal materials',
    tradeOff:
      'Uses locally sourced seasonal flowers, fabric draped mandaps, and ambient candlelight rather than imported exotics or custom fabricated metal arches.',
    multiplier: '0.8x',
  },
  {
    name: 'Standard Tier',
    valueText: 'Standard: balanced catalog price with premium local finishes',
    tradeOff:
      'High-quality regional florals (roses, marigolds, mogra), wooden hand-carved furniture, fairy light tunnels, and standard sound setups.',
    multiplier: '1.0x',
  },
  {
    name: 'Splurge Tier',
    valueText: 'Splurge: about 30% above standard with bespoke luxury items',
    tradeOff:
      'Imported Dutch carnations, custom acrylic floating mandap over lake waters, crystal chandeliers, truss lighting, and designer lounge suites.',
    multiplier: '1.3x',
  },
];

export const SplurgeSaveSlider: React.FC<SplurgeSaveSliderProps> = ({
  currentTierValue,
  onTierChange,
  computedTotalMinor,
}) => {
  const { currentEvent, announce } = useEvent();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const fallbackTier = TIER_DESCRIPTIONS[1] as (typeof TIER_DESCRIPTIONS)[0];
  const activeTier = TIER_DESCRIPTIONS[currentTierValue] ?? fallbackTier;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = parseInt(e.target.value, 10);
    onTierChange(newVal);

    // Debounced aria-live announcement
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const tier = TIER_DESCRIPTIONS[newVal];
      if (tier) {
        announce(
          `${tier.name} selected. New decor total: ${formatMoney(
            computedTotalMinor,
            currentEvent.currency as CurrencyCode,
          )}.`,
        );
      }
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return (
    <div className="glass-card p-6 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-950 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <Sliders size={18} aria-hidden="true" />
          </div>
          <div>
            <label
              htmlFor="splurge-save-slider"
              className="text-base font-bold text-slate-900 dark:text-slate-100 block"
            >
              Splurge / Save Budget Dial
            </label>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Instant client-side re-pricing across all Bill of Materials tiers
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center space-x-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
        >
          <HelpCircle size={14} aria-hidden="true" />
          <span>Explain Trade-offs</span>
        </button>
      </div>

      {/* Slider Controls */}
      <div className="space-y-4">
        <div className="relative pt-2">
          <input
            id="splurge-save-slider"
            type="range"
            min={0}
            max={2}
            step={1}
            value={currentTierValue}
            onChange={handleSliderChange}
            aria-valuemin={0}
            aria-valuemax={2}
            aria-valuenow={currentTierValue}
            aria-valuetext={activeTier.valueText}
            className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />

          {/* Stepped Labels */}
          <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400 mt-2 px-1">
            <button
              type="button"
              onClick={() => onTierChange(0)}
              className={`hover:text-brand-600 transition ${
                currentTierValue === 0 ? 'font-bold text-brand-600 dark:text-brand-400' : ''
              }`}
            >
              🌱 Save (-20%)
            </button>
            <button
              type="button"
              onClick={() => onTierChange(1)}
              className={`hover:text-brand-600 transition ${
                currentTierValue === 1 ? 'font-bold text-brand-600 dark:text-brand-400' : ''
              }`}
            >
              ⚖️ Standard (1.0x)
            </button>
            <button
              type="button"
              onClick={() => onTierChange(2)}
              className={`hover:text-brand-600 transition ${
                currentTierValue === 2 ? 'font-bold text-brand-600 dark:text-brand-400' : ''
              }`}
            >
              ✨ Splurge (+30%)
            </button>
          </div>
        </div>

        {/* Dynamic Tier Summary Card */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300">
                {activeTier.name}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {activeTier.multiplier} price multiplier
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">{activeTier.tradeOff}</p>
          </div>

          <div className="sm:text-right shrink-0">
            <span className="text-xs text-slate-500 dark:text-slate-400 block">
              Estimated Total
            </span>
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {formatMoney(computedTotalMinor, currentEvent.currency as CurrencyCode)}
            </span>
          </div>
        </div>
      </div>

      {/* Trade-off Explanation Modal */}
      <AccessibleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Material & Execution Trade-offs"
        description="Understanding how your tier choice influences sourcing, craftsmanship, and aesthetic impact."
      >
        <div className="space-y-4">
          {TIER_DESCRIPTIONS.map((tier, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-xl border transition ${
                idx === currentTierValue
                  ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/40'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                  <span>{tier.name}</span>
                  {idx === currentTierValue && (
                    <span className="text-xs px-2 py-0.5 bg-brand-600 text-white rounded-full font-normal">
                      Active
                    </span>
                  )}
                </span>
                <span className="text-xs font-semibold text-slate-500">{tier.multiplier}</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {tier.tradeOff}
              </p>
            </div>
          ))}

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
            <span className="font-semibold block mb-0.5">Deterministic Arithmetic:</span>
            Moving this slider recomputes all item tiers locally and instantly without calling
            external APIs.
          </div>
        </div>
      </AccessibleModal>
    </div>
  );
};
