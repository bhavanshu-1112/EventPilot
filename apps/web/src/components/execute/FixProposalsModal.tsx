import React from 'react';
import { ArrowRight } from 'lucide-react';
import { AccessibleModal } from '../common/AccessibleModal.js';
import { Badge } from '../common/Badge.js';

export interface FixOptionItem {
  id: string;
  rank: number;
  title: string;
  strategy: 'shift' | 'swap' | 'shorten' | 'extend_filler' | 'cancel_optional';
  plainImpact: string;
  fixedConflictsCount: number;
  guestVisibleChangesCount: number;
  totalMinutesMoved: number;
  score: number;
  operations: unknown[];
}

interface FixProposalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  options: FixOptionItem[];
  onSelectOption: (option: FixOptionItem) => void;
}

export const FixProposalsModal: React.FC<FixProposalsModalProps> = ({
  isOpen,
  onClose,
  options,
  onSelectOption,
}) => {
  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Ranked Schedule Fix Proposals"
      description="Scored deterministically: zero fixed-item conflicts, fewest guest shifts, least total delay."
      maxWidth="2xl"
    >
      <div className="space-y-4">
        {options.map((opt, index) => {
          const isTopRanked = opt.rank === 1 || index === 0;

          return (
            <div
              key={opt.id}
              className={`p-4 rounded-xl border transition-all ${
                isTopRanked
                  ? 'border-brand-500 bg-brand-50/40 dark:bg-brand-950/30 ring-1 ring-brand-500'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center space-x-2">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      isTopRanked
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    #{opt.rank}
                  </span>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {opt.title}
                  </h4>
                </div>

                {isTopRanked && (
                  <Badge variant="success" size="sm">
                    Recommended Fix
                  </Badge>
                )}
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">
                {opt.plainImpact}
              </p>

              {/* Deterministic Scoring Badges */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] mb-3">
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                  Strategy: {opt.strategy.replace('_', ' ')}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                  Guest-visible shifts: {opt.guestVisibleChangesCount}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                  Total time shifted: {opt.totalMinutesMoved} min
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                  Fixed item conflicts: {opt.fixedConflictsCount}
                </span>
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onSelectOption(opt)}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-xs transition"
                >
                  <span>Select &amp; Draft Vendor Notifications</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </AccessibleModal>
  );
};
