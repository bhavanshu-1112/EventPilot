import React from 'react';
import { Lock, Unlock, PieChart, Shield } from 'lucide-react';
import { formatMoney, type CurrencyCode } from '@eventpilot/shared';
import { useEvent } from '../../context/EventContext.js';
import { api } from '../../api/client.js';

function getBarColor(spent: number, allocated: number, pct: number): string {
  if (spent > allocated) return 'bg-red-500';
  if (pct > 80) return 'bg-amber-500';
  return 'bg-brand-500';
}

interface LockButtonProps {
  isLocked: boolean;
  label: string;
  onToggle: () => void;
}

const LockButton: React.FC<LockButtonProps> = ({ isLocked, label, onToggle }) => {
  const style = isLocked
    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300'
    : 'bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400';
  const title = isLocked ? 'Unlock category' : 'Lock category';
  const ariaLabel = `${title} ${label}`;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`p-1.5 rounded-lg border transition ${style}`}
      title={title}
      aria-label={ariaLabel}
    >
      {isLocked ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}
    </button>
  );
};

interface CategoryCardProps {
  category: {
    categoryId: string;
    label: string;
    allocatedMinor?: number;
    spentMinor?: number;
    locked?: boolean;
    isLocked?: boolean;
  };
  currency: string;
  onToggleLock: (id: string, current: boolean) => void;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ category, currency, onToggleLock }) => {
  const isContingency = category.categoryId === 'contingency';
  const isLocked = Boolean(category.isLocked ?? category.locked);
  const spent = category.spentMinor ?? 0;
  const allocated = category.allocatedMinor ?? 0;
  const pct = allocated > 0 ? Math.min(100, Math.round((spent / allocated) * 100)) : 0;
  const curr = currency as CurrencyCode;
  const barColor = getBarColor(spent, allocated, pct);

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        isLocked
          ? 'bg-slate-50/80 dark:bg-slate-800/60 border-indigo-200 dark:border-indigo-900/60'
          : 'bg-white dark:bg-slate-800/30 border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
          {category.label}
        </span>

        {isContingency ? (
          <span
            className="p-1 text-amber-600 dark:text-amber-400"
            title="Contingency floor is locked by policy"
          >
            <Lock size={14} aria-hidden="true" />
          </span>
        ) : (
          <LockButton
            isLocked={isLocked}
            label={category.label}
            onToggle={() => onToggleLock(category.categoryId, isLocked)}
          />
        )}
      </div>

      <div className="flex justify-between items-baseline mb-2">
        <div>
          <span className="text-[10px] text-slate-500 uppercase block">Allocated</span>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {formatMoney(allocated, curr)}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-500 uppercase block">Spent ({pct}%)</span>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            {formatMoney(spent, curr)}
          </span>
        </div>
      </div>

      <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div style={{ width: `${pct}%` }} className={`h-full ${barColor}`} />
      </div>
    </div>
  );
};

export const BudgetAllocationCard: React.FC = () => {
  const { currentEvent, budget, refreshBudget, announce } = useEvent();

  if (!budget) return null;

  const handleToggleLock = async (categoryId: string, currentLocked: boolean) => {
    try {
      await api.budget.toggleLock(currentEvent.id, categoryId, !currentLocked, currentEvent.token);
      await refreshBudget();
      announce(`Category ${categoryId} is now ${!currentLocked ? 'locked' : 'unlocked'}.`);
    } catch {
      announce(`Failed to update lock on ${categoryId}`);
    }
  };

  return (
    <div className="glass-card p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <PieChart size={18} aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Budget Categories &amp; Lock Controls
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Locked categories will never be trimmed during automated rebalancing
            </p>
          </div>
        </div>

        <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold flex items-center space-x-1">
          <Shield size={12} aria-hidden="true" />
          <span>Contingency Floor: {budget.contingencyFloorPercent || 10}%</span>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {budget.categories.map((cat) => (
          <CategoryCard
            key={cat.categoryId}
            category={cat}
            currency={currentEvent.currency}
            onToggleLock={handleToggleLock}
          />
        ))}
      </div>
    </div>
  );
};
