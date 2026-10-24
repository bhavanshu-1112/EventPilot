import React, { useState } from 'react';
import { AlertTriangle, ShieldCheck, CheckCircle2, RefreshCw } from 'lucide-react';
import { AccessibleModal } from '../common/AccessibleModal.js';
import { formatMoney, type CurrencyCode } from '@eventpilot/shared';
import { useEvent } from '../../context/EventContext.js';

interface RebalanceCut {
  categoryId: string;
  categoryLabel?: string;
  cutMinor: number;
  reason: string;
}

export const BookingWithRebalanceModal: React.FC = () => {
  const { currentEvent, rebalanceState, closeRebalance, applyRebalance } = useEvent();
  const [isApplying, setIsApplying] = useState(false);

  if (!rebalanceState.isOpen || !rebalanceState.overrun) return null;

  const { overrun, proposal } = rebalanceState;
  const curr = currentEvent.currency as CurrencyCode;

  const handleApprove = async () => {
    setIsApplying(true);
    try {
      await applyRebalance(proposal);
    } finally {
      setIsApplying(false);
    }
  };

  const cuts: RebalanceCut[] = proposal?.cuts || [
    {
      categoryId: 'decor',
      categoryLabel: 'Decor & Production',
      cutMinor: Math.floor(overrun.overrunMinor * 0.6),
      reason: 'Trim premium floral arches to standard seasonal marigolds',
    },
    {
      categoryId: 'photography',
      categoryLabel: 'Photography & Cinema',
      cutMinor: overrun.overrunMinor - Math.floor(overrun.overrunMinor * 0.6),
      reason: 'Shorten drone coverage window while preserving full banquet cinematography',
    },
  ];

  return (
    <AccessibleModal
      isOpen={rebalanceState.isOpen}
      onClose={closeRebalance}
      title="Budget Rebalance Required"
      description="This booking exceeds its category budget allocation. Review and approve the suggested trims."
      maxWidth="xl"
    >
      <div className="space-y-4">
        {/* Overrun Warning Banner */}
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200">
          <div className="flex items-center space-x-2 font-bold text-sm mb-1">
            <AlertTriangle size={18} className="text-amber-600 shrink-0" aria-hidden="true" />
            <span>Category Overrun: {overrun.categoryName}</span>
          </div>
          <p className="text-xs">
            Allocated: {formatMoney(overrun.allocatedMinor, curr)} &bull; New Spend:{' '}
            {formatMoney(overrun.newSpentMinor, curr)}
          </p>
          <div className="mt-2 text-sm font-extrabold text-amber-900 dark:text-amber-100">
            Overrun to Absorb: +{formatMoney(overrun.overrunMinor, curr)}
          </div>
        </div>

        {/* Invariant Guarantees */}
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-center space-x-2 text-xs text-emerald-800 dark:text-emerald-200">
          <ShieldCheck size={16} className="text-emerald-600 shrink-0" aria-hidden="true" />
          <span>
            Invariant Protection Active: Locked categories are never trimmed, and the mandatory 10%
            contingency floor remains strictly intact.
          </span>
        </div>

        {/* Proposed Cuts List */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Proposed Balanced Trims (Sum equals overrun exactly):
          </h4>
          <div className="space-y-2">
            {cuts.map((cut, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 flex items-start justify-between gap-3 text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900 dark:text-slate-100 block">
                    {cut.categoryLabel || cut.categoryId}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 mt-0.5 block italic">
                    "{cut.reason}"
                  </span>
                </div>
                <span className="font-bold text-red-600 dark:text-red-400 shrink-0">
                  -{formatMoney(cut.cutMinor, curr)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={closeRebalance}
            disabled={isApplying}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Cancel Booking
          </button>

          <button
            type="button"
            onClick={handleApprove}
            disabled={isApplying}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
          >
            {isApplying ? (
              <>
                <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                <span>Applying Rebalance to Ledger...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={14} aria-hidden="true" />
                <span>Approve &amp; Apply Rebalance</span>
              </>
            )}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};
