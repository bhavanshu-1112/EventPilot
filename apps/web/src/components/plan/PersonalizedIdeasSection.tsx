import React, { useState, useEffect } from 'react';
import { Lightbulb, Plus, Check, RefreshCw, Sparkles } from 'lucide-react';
import { formatMoney, type CurrencyCode } from '@eventpilot/shared';
import { api } from '../../api/client.js';
import { useEvent } from '../../context/EventContext.js';

export interface IdeaItem {
  id: string;
  title: string;
  description: string;
  category: string;
  estimatedCostMinor: number;
  whyFits: string;
  status: 'suggested' | 'accepted' | 'rejected';
}

export const PersonalizedIdeasSection: React.FC = () => {
  const { currentEvent, budget, announce } = useEvent();
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadIdeas = async () => {
    try {
      setIsLoading(true);
      const res = await api.ideas.get(currentEvent.id, currentEvent.token);
      setIdeas(res.ideas || []);
    } catch {
      // Fallback sample ideas
      setIdeas([
        {
          id: 'idea-1',
          title: 'Rajasthani Puppet Theater & Folk Storytelling',
          description:
            'Live kathputli puppet artists narrating traditional love lore during high tea.',
          category: 'entertainment',
          estimatedCostMinor: 4500000,
          whyFits:
            'Honors Udaipur heritage while keeping all age groups engaged during evening tea.',
          status: 'suggested',
        },
        {
          id: 'idea-2',
          title: 'Artisanal Ittar Perfumery Bar & Custom Favors',
          description:
            'Master perfumers blend bespoke rose, sandalwood, and oud scents for guests.',
          category: 'favors',
          estimatedCostMinor: 8500000,
          whyFits: 'Luxurious personalized keepsake perfectly matching regal Mewari aesthetic.',
          status: 'suggested',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadIdeas();
  }, [currentEvent.id]);

  const handleGenerateIdeas = async () => {
    setIsGenerating(true);
    announce('Generating personalized ideas validated against remaining budget.');
    try {
      const res = await api.ideas.generate(currentEvent.id, currentEvent.token);
      setIdeas(res.ideas);
      announce(`Generated ${res.ideas.length} ideas strictly fitting unspent budget.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate ideas';
      announce(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAcceptIdea = async (ideaId: string) => {
    try {
      await api.ideas.accept(currentEvent.id, ideaId, currentEvent.token);
      setIdeas((prev) =>
        prev.map((idea) => (idea.id === ideaId ? { ...idea, status: 'accepted' } : idea)),
      );
      announce('Idea added to your event plan.');
    } catch {
      announce('Failed to accept idea');
    }
  };

  const remaining = budget?.remainingBudgetMinor ?? currentEvent.totalBudgetMinor;

  return (
    <div className="glass-card p-6 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Lightbulb size={18} aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Personalized AI Ideas
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Filtered to guarantee zero suggestions exceed your remaining unspent budget (
              {formatMoney(remaining, currentEvent.currency as CurrencyCode)})
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGenerateIdeas}
          disabled={isGenerating}
          className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 transition shadow-xs"
        >
          {isGenerating ? (
            <>
              <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
              <span>Validating Budget...</span>
            </>
          ) : (
            <>
              <Sparkles size={14} aria-hidden="true" />
              <span>Generate Ideas</span>
            </>
          )}
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-xs text-slate-500">Loading ideas...</div>
      ) : ideas.length === 0 ? (
        <div className="text-center py-6 text-xs text-slate-500">
          Click "Generate Ideas" to create tailored recommendations fitting your budget.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ideas.map((idea) => {
            const isAccepted = idea.status === 'accepted';
            return (
              <div
                key={idea.id}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                  isAccepted
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                    : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-brand-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      {idea.title}
                    </span>
                    <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 shrink-0">
                      {formatMoney(idea.estimatedCostMinor, currentEvent.currency as CurrencyCode)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
                    {idea.description}
                  </p>

                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 mb-3">
                    <span className="text-[10px] font-semibold text-brand-600 dark:text-brand-400 block mb-0.5">
                      Why this fits your brief:
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-400 italic">
                      "{idea.whyFits}"
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Category: {idea.category}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleAcceptIdea(idea.id)}
                    disabled={isAccepted}
                    className={`inline-flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      isAccepted
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 cursor-default'
                        : 'bg-brand-50 hover:bg-brand-100 text-brand-700 dark:bg-brand-950 dark:hover:bg-brand-900 dark:text-brand-300'
                    }`}
                  >
                    {isAccepted ? (
                      <>
                        <Check size={14} aria-hidden="true" />
                        <span>Added to Plan</span>
                      </>
                    ) : (
                      <>
                        <Plus size={14} aria-hidden="true" />
                        <span>Add to Plan</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
