import React from 'react';
import { BriefParserSection } from '../components/plan/BriefParserSection.js';
import { Sparkles, Heart, Cake, Users } from 'lucide-react';
import { useEvent, SEED_PRESETS } from '../context/EventContext.js';
import { Link } from 'react-router-dom';

export const BriefView: React.FC = () => {
  const { switchEvent } = useEvent();

  const weddingPreset = SEED_PRESETS[0];
  const birthdayPreset = SEED_PRESETS[1];
  const communityPreset = SEED_PRESETS[2];

  return (
    <div className="space-y-8 max-w-4xl mx-auto py-4">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200 dark:border-brand-800 text-xs font-semibold">
          <Sparkles size={14} aria-hidden="true" />
          <span>GenAI Celebration &amp; Event Planner</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
          Plan Weddings, Birthdays &amp; Community Festivals
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          From free-text ideas to deterministic budgets, catalog-priced bills of materials, quote
          comparisons, and live schedule ripple management.
        </p>
      </div>

      {/* Brief Parser Section */}
      <BriefParserSection />

      {/* Pre-seeded Quick Launch Presets */}
      <div className="glass-card p-6">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
          Or explore pre-configured celebration seeds
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Instantly jump into any of our three fully modeled celebration archetypes:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Wedding */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:border-brand-300 transition flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400 flex items-center justify-center mb-3">
                <Heart size={20} aria-hidden="true" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-1">
                Royal Udaipur Wedding
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                3-day lakeside palace celebration with 350 guests and ₹3.5 Crore budget. Multiple
                ceremonies (Mehendi, Sangeet, Banquet).
              </p>
            </div>
            {weddingPreset && (
              <Link
                to="/plan"
                onClick={() => switchEvent(weddingPreset)}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                Open Wedding Plan &rarr;
              </Link>
            )}
          </div>

          {/* Birthday */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:border-brand-300 transition flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400 flex items-center justify-center mb-3">
                <Cake size={20} aria-hidden="true" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-1">
                Kabir's 40th Birthday
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Sophisticated rooftop cocktail lounge party for 85 guests with molecular mixology
                and nostalgic surprises. ₹40 Lakhs.
              </p>
            </div>
            {birthdayPreset && (
              <Link
                to="/plan"
                onClick={() => switchEvent(birthdayPreset)}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                Open Birthday Plan &rarr;
              </Link>
            )}
          </div>

          {/* Community */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:border-brand-300 transition flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex items-center justify-center mb-3">
                <Users size={20} aria-hidden="true" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-1">
                Mewar Folk Festival
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Full-day public youth and cultural festival for 1,200 attendees. Civic permits,
                security clearance, and community langar. ₹80 Lakhs.
              </p>
            </div>
            {communityPreset && (
              <Link
                to="/plan"
                onClick={() => switchEvent(communityPreset)}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                Open Community Plan &rarr;
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
