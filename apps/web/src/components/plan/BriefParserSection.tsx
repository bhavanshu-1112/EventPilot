import React, { useState } from 'react';
import { Sparkles, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { api } from '../../api/client.js';
import { useEvent } from '../../context/EventContext.js';
import { formatMoney, type CurrencyCode } from '@eventpilot/shared';

const SAMPLES = [
  {
    label: '💍 Udaipur Royal Wedding',
    text: '3-day royal destination wedding in Udaipur with 350 guests and 3.5 Crore INR budget. Mehendi, Sangeet and Reception.',
  },
  {
    label: '🎂 Kabir 40th Birthday',
    text: 'Milestone 40th rooftop birthday celebration in Udaipur for 85 guests with a 40 Lakh INR budget.',
  },
  {
    label: '🎪 Folk & Youth Festival',
    text: 'Full-day Mewar youth and folk cultural festival for 1200 people with an 80 Lakh INR budget. Folk troupes, civic permits, and community langar.',
  },
];

interface ParsedBrief {
  eventType: 'wedding' | 'birthday' | 'community';
  city?: string;
  guestCount: number;
  budgetMinor: number;
  currency?: string;
  ceremonies?: Array<{ name: string }>;
  [key: string]: unknown;
}

interface ParsedSummaryCardProps {
  parsedResult: ParsedBrief;
  isCreating: boolean;
  onCreateEvent: () => void;
}

const ParsedSummaryCard: React.FC<ParsedSummaryCardProps> = ({
  parsedResult,
  isCreating,
  onCreateEvent,
}) => {
  const currency = (parsedResult.currency as CurrencyCode) || 'INR';

  return (
    <div className="mt-6 p-4 rounded-xl bg-brand-50/50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800/60 animate-fadeIn">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-brand-900 dark:text-brand-200 flex items-center space-x-1.5">
          <CheckCircle2 size={16} className="text-emerald-500" aria-hidden="true" />
          <span>Structured Parameters Confirmed</span>
        </h3>
        <span className="text-xs px-2 py-0.5 rounded bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 font-medium uppercase tracking-wider">
          {parsedResult.eventType}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
        <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
          <span className="text-slate-400 block mb-0.5">City</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {parsedResult.city || 'Udaipur'}
          </span>
        </div>
        <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
          <span className="text-slate-400 block mb-0.5">Guest Count</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {parsedResult.guestCount} guests
          </span>
        </div>
        <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
          <span className="text-slate-400 block mb-0.5">Total Budget</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {formatMoney(parsedResult.budgetMinor, currency)}
          </span>
        </div>
        <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
          <span className="text-slate-400 block mb-0.5">Sub-events / Ceremonies</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {parsedResult.ceremonies?.length || 1} sub-events
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onCreateEvent}
        disabled={isCreating}
        className="w-full inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
      >
        {isCreating ? (
          <>
            <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
            <span>Initializing Budget &amp; Checklists...</span>
          </>
        ) : (
          <>
            <span>Initialize Event Plan &amp; Activate</span>
            <ArrowRight size={16} aria-hidden="true" />
          </>
        )}
      </button>
    </div>
  );
};

export const BriefParserSection: React.FC = () => {
  const { switchEvent, announce } = useEvent();
  const [briefText, setBriefText] = useState(SAMPLES[0]?.text ?? '');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedBrief | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!briefText.trim()) return;
    setIsParsing(true);
    setError(null);
    try {
      const res = await api.events.parseBrief(briefText);
      setParsedResult(res.brief as ParsedBrief);
      announce('Brief parsed successfully into structured parameters.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse brief';
      setError(msg);
    } finally {
      setIsParsing(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!parsedResult) return;
    setIsCreating(true);
    setError(null);
    try {
      const res = await api.events.create(parsedResult);
      switchEvent({
        id: res.event.id,
        token: res.token,
        name: res.event.name,
        eventType: res.event.eventType,
        city: res.event.location || parsedResult.city || 'Udaipur',
        guestCount: res.event.guestCount,
        totalBudgetMinor: res.event.totalBudgetMinor,
        currency: res.event.currency || 'INR',
      });
      announce(`Event created successfully: ${res.event.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create event';
      setError(msg);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="glass-card p-6 mb-8">
      <div className="flex items-center space-x-2 text-brand-600 dark:text-brand-400 font-semibold text-sm mb-2">
        <Sparkles size={18} aria-hidden="true" />
        <span>AI Brief Parser &amp; Plan Generator</span>
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
        Start with your vision in plain English
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        Describe your celebration in free text. Our AI planner extracts key parameters, sets up
        ceremonies, seeds budget weights, and schedules task deadlines.
      </p>

      {/* Quick Prompts */}
      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Sample briefs">
        {SAMPLES.map((sample, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setBriefText(sample.text)}
            className="text-xs px-2.5 py-1 rounded-full bg-slate-100 hover:bg-brand-50 text-slate-700 hover:text-brand-700 dark:bg-slate-800 dark:hover:bg-brand-950 dark:text-slate-300 dark:hover:text-brand-300 border border-slate-200 dark:border-slate-700 transition-colors"
          >
            {sample.label}
          </button>
        ))}
      </div>

      {/* Free-text input box */}
      <div className="mb-4">
        <label htmlFor="brief-input" className="sr-only">
          Event Brief
        </label>
        <textarea
          id="brief-input"
          rows={3}
          value={briefText}
          onChange={(e) => setBriefText(e.target.value)}
          placeholder="Describe your event (e.g. 3-day royal destination wedding in Udaipur with 350 guests and ₹3.5 Cr budget)..."
          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleParse}
          disabled={isParsing || !briefText.trim()}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 transition shadow-sm"
        >
          {isParsing ? (
            <>
              <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
              <span>Parsing Brief with AI...</span>
            </>
          ) : (
            <>
              <Sparkles size={16} aria-hidden="true" />
              <span>Parse Brief</span>
            </>
          )}
        </button>

        {error && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400 font-medium">
            {error}
          </p>
        )}
      </div>

      {/* Confirmation of parsed fields */}
      {parsedResult && (
        <ParsedSummaryCard
          parsedResult={parsedResult}
          isCreating={isCreating}
          onCreateEvent={handleCreateEvent}
        />
      )}
    </div>
  );
};
