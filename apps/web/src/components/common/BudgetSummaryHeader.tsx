import React from 'react';
import { ShieldCheck, AlertTriangle, TrendingUp, PiggyBank, CreditCard } from 'lucide-react';
import { formatMoney, type CurrencyCode } from '@eventpilot/shared';
import { useEvent } from '../../context/EventContext.js';

export const BudgetSummaryHeader: React.FC = () => {
  const { currentEvent, budget } = useEvent();

  if (!budget) return null;

  const currency = currentEvent.currency as CurrencyCode;
  const total = budget.totalBudgetMinor;
  const spent = budget.spentMinor;
  const allocated = budget.allocatedMinor;
  const remaining = budget.remainingBudgetMinor;
  const contingency = budget.contingencyMinor;
  const contingencyFloorPercent = budget.contingencyFloorPercent || 10;

  const spentPercent = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0;
  const allocatedPercent = total > 0 ? Math.min(100, Math.round((allocated / total) * 100)) : 0;
  const isOverBudget = spent > total;

  return (
    <section
      aria-label="Event Budget Summary"
      className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xs px-4 sm:px-6 lg:px-8 py-3"
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Main Key Figures */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
            {/* Total Budget */}
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                <PiggyBank size={20} aria-hidden="true" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Total Budget
                </span>
                <span className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                  {formatMoney(total, currency)}
                </span>
              </div>
            </div>

            {/* Spent (Booked) */}
            <div className="flex items-center space-x-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isOverBudget
                    ? 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400'
                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                }`}
              >
                <CreditCard size={20} aria-hidden="true" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Spent ({spentPercent}%)
                </span>
                <span
                  className={`text-lg sm:text-xl font-bold ${
                    isOverBudget
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {formatMoney(spent, currency)}
                </span>
              </div>
            </div>

            {/* Remaining Unspent */}
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <TrendingUp size={20} aria-hidden="true" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Remaining
                </span>
                <span className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                  {formatMoney(remaining, currency)}
                </span>
              </div>
            </div>

            {/* Contingency Floor Protected */}
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <ShieldCheck size={20} aria-hidden="true" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Contingency ({contingencyFloorPercent}%)
                </span>
                <span className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                  {formatMoney(contingency, currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Overrun Warning Pill */}
          {isOverBudget && (
            <div
              role="alert"
              className="flex items-center space-x-2 px-3 py-1.5 bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-800 rounded-lg text-xs font-semibold animate-pulse"
            >
              <AlertTriangle size={16} aria-hidden="true" />
              <span>Overrun detected! Rebalance required.</span>
            </div>
          )}
        </div>

        {/* Visual Budget Allocation Track */}
        <div className="mt-3">
          <div
            className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex"
            role="progressbar"
            aria-valuenow={spentPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Budget usage: ${spentPercent}% spent, ${allocatedPercent}% allocated`}
          >
            {/* Spent */}
            <div
              style={{ width: `${spentPercent}%` }}
              className={`h-full transition-all duration-300 ${
                isOverBudget ? 'bg-red-500' : 'bg-emerald-500'
              }`}
            />
            {/* Allocated unspent */}
            <div
              style={{ width: `${Math.max(0, allocatedPercent - spentPercent)}%` }}
              className="h-full bg-brand-400/80 transition-all duration-300"
            />
            {/* Unallocated buffer */}
            <div
              style={{ width: `${Math.max(0, 100 - allocatedPercent)}%` }}
              className="h-full bg-amber-400/60 transition-all duration-300"
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            <span>● Spent: {formatMoney(spent, currency)}</span>
            <span>● Allocated: {formatMoney(allocated, currency)}</span>
            <span>● Contingency Protected: {contingencyFloorPercent}%</span>
          </div>
        </div>
      </div>
    </section>
  );
};
