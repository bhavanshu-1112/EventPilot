import React from 'react';
import { ShieldAlert, Quote } from 'lucide-react';
import { Badge, type BadgeVariant } from '../common/Badge.js';

export interface HiddenCostFlagItem {
  id: string;
  vendorName: string;
  category: string;
  ruleCode: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  explanation: string;
  sourceQuote: string;
  sourcePage?: number;
}

interface HiddenCostFlagsProps {
  flags: HiddenCostFlagItem[];
}

export const HiddenCostFlags: React.FC<HiddenCostFlagsProps> = ({ flags }) => {
  if (flags.length === 0) {
    return (
      <div className="glass-card p-6 mb-8 text-center text-xs text-slate-500">
        No hidden cost flags detected in the current quotes.
      </div>
    );
  }

  return (
    <div className="glass-card p-6 mb-8">
      <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400 font-semibold text-sm mb-2">
        <ShieldAlert size={18} aria-hidden="true" />
        <span>Hidden-Cost &amp; Contractual Risk Audit</span>
      </div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
        Flagged Clauses with Verifiable Source Citations
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Every risk is backed by an exact quote and page reference from the vendor's PDF. Verify
        before signing.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {flags.map((flag) => {
          const badgeVariant: BadgeVariant =
            flag.severity === 'high' ? 'danger' : flag.severity === 'medium' ? 'warning' : 'info';

          return (
            <div
              key={flag.id}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100 block">
                      {flag.title}
                    </span>
                    <span className="text-[11px] text-slate-500">{flag.vendorName}</span>
                  </div>
                  <Badge variant={badgeVariant} size="sm">
                    {flag.severity.toUpperCase()} RISK
                  </Badge>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">
                  {flag.explanation}
                </p>

                {/* Verifiable Source Citation Quote Box */}
                <div className="p-2.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 mb-2">
                  <div className="flex items-center space-x-1 text-[10px] font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider mb-1">
                    <Quote size={11} aria-hidden="true" />
                    <span>
                      Exact Vendor Citation {flag.sourcePage ? `(Page ${flag.sourcePage})` : ''}:
                    </span>
                  </div>
                  <p className="text-xs font-mono text-amber-900 dark:text-amber-100 italic">
                    "{flag.sourceQuote}"
                  </p>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 uppercase tracking-wider pt-2 border-t border-slate-100 dark:border-slate-800">
                Rule ID: {flag.ruleCode}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
