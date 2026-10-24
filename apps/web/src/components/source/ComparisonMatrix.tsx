import React from 'react';
import { formatMoney, type CurrencyCode } from '@eventpilot/shared';
import { useEvent } from '../../context/EventContext.js';
import { Badge } from '../common/Badge.js';
import { MessageSquare, CheckCircle } from 'lucide-react';

export interface ComparisonQuote {
  id: string;
  vendorName: string;
  category: string;
  totalMinor: number;
  computedAllInMinor: number;
  taxAssumptions?: string;
  flagsCount: number;
  highSeverityCount: number;
  lineItemsCount: number;
  status: 'pending' | 'booked';
  flags?: Array<{
    ruleCode: string;
    severity: 'high' | 'medium' | 'low';
    title?: string;
    explanation: string;
    sourceQuote?: string;
    sourcePage?: number;
  }>;
}

interface ComparisonMatrixProps {
  quotes: ComparisonQuote[];
  category: string;
  onNegotiate: (quoteId: string, vendorName: string) => void;
  onBook: (quoteId: string) => void;
  isLoading?: boolean;
}

export const ComparisonMatrix: React.FC<ComparisonMatrixProps> = ({
  quotes,
  category,
  onNegotiate,
  onBook,
  isLoading,
}) => {
  const { currentEvent } = useEvent();

  if (isLoading) {
    return (
      <div className="glass-card p-8 text-center text-sm text-slate-500">
        Comparing vendor quotes across {category}...
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-slate-500 dark:text-slate-400 mb-8">
        <p className="text-sm font-medium mb-1">No quotes uploaded for {category} yet.</p>
        <p className="text-xs">
          Upload 2 or more vendor quote PDFs above to view side-by-side hidden costs, tax
          assumptions, and normalized all-in totals.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Side-by-Side Vendor Comparison Matrix ({category.toUpperCase()})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            All-in totals normalized with standardized GST and service fee assumptions
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 font-semibold">
          {quotes.length} Quotes Audited
        </span>
      </div>

      <div
        role="region"
        aria-label="Vendor Comparison Matrix"
        className="overflow-x-auto focus:outline-none"
      >
        <table className="w-full text-left border-collapse text-xs">
          <caption className="sr-only">
            Vendor Comparison Matrix comparing stated base total, tax assumptions, normalized all-in
            total, hidden cost flags, and booking actions
          </caption>
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
              <th scope="col" className="px-6 py-3 font-semibold">
                Vendor Name
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Stated Base Quote
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Tax &amp; Service Assumptions
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                All-in Estimated Total
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Hidden Cost Flags
              </th>
              <th scope="col" className="px-6 py-3 font-semibold text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {quotes.map((q) => {
              const isBooked = q.status === 'booked';
              return (
                <tr
                  key={q.id}
                  className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors ${
                    isBooked ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : ''
                  }`}
                >
                  <th
                    scope="row"
                    className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100"
                  >
                    <span className="block text-sm font-bold">{q.vendorName}</span>
                    <span className="text-[11px] text-slate-400">
                      {q.lineItemsCount} line items extracted
                    </span>
                  </th>

                  <td className="px-4 py-4 text-slate-600 dark:text-slate-300 font-semibold">
                    {formatMoney(q.totalMinor, currentEvent.currency as CurrencyCode)}
                  </td>

                  <td className="px-4 py-4 text-slate-500 dark:text-slate-400 max-w-xs">
                    <span className="p-1 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono">
                      {q.taxAssumptions || '+18% GST standard assumption applied'}
                    </span>
                  </td>

                  <td className="px-4 py-4 font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {formatMoney(q.computedAllInMinor, currentEvent.currency as CurrencyCode)}
                  </td>

                  <td className="px-4 py-4">
                    {q.flagsCount > 0 ? (
                      <div className="flex items-center space-x-1.5">
                        {q.highSeverityCount > 0 ? (
                          <Badge variant="danger" size="sm">
                            {q.highSeverityCount} High Risk
                          </Badge>
                        ) : (
                          <Badge variant="warning" size="sm">
                            {q.flagsCount} Warnings
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <Badge variant="success" size="sm">
                        0 Flags
                      </Badge>
                    )}
                  </td>

                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => onNegotiate(q.id, q.vendorName)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                      title={`Draft negotiation for ${q.vendorName}`}
                    >
                      <MessageSquare size={13} aria-hidden="true" />
                      <span>Negotiate</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onBook(q.id)}
                      disabled={isBooked}
                      className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        isBooked
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 cursor-default'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                      }`}
                    >
                      <CheckCircle size={13} aria-hidden="true" />
                      <span>{isBooked ? 'Booked' : 'Book Vendor'}</span>
                    </button>
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
