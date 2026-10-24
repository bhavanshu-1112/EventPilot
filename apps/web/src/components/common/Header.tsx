import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Sparkles, Calendar, Layers, ShieldCheck, PlusCircle, Radio } from 'lucide-react';
import { useEvent, SEED_PRESETS } from '../../context/EventContext.js';

export const Header: React.FC = () => {
  const { currentEvent, switchEvent, sseConnected } = useEvent();

  return (
    <header
      role="banner"
      className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Assistant branding */}
          <div className="flex items-center space-x-3">
            <Link
              to="/"
              className="flex items-center space-x-2 text-brand-600 dark:text-brand-400 font-bold text-xl tracking-tight focus-visible:rounded"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
                <Sparkles size={20} aria-hidden="true" />
              </div>
              <span>EventPilot</span>
            </Link>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-brand-50 text-brand-700 dark:bg-brand-950/80 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
              GenAI Assistant
            </span>
          </div>

          {/* Navigation Stage Tabs */}
          <nav
            aria-label="Main stages navigation"
            className="flex items-center space-x-1 sm:space-x-2"
          >
            <NavLink
              to="/plan"
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/80 dark:text-brand-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`
              }
            >
              <div className="flex items-center space-x-1.5">
                <Calendar size={16} aria-hidden="true" />
                <span>1. Plan</span>
              </div>
            </NavLink>

            <NavLink
              to="/source"
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/80 dark:text-brand-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`
              }
            >
              <div className="flex items-center space-x-1.5">
                <Layers size={16} aria-hidden="true" />
                <span>2. Source</span>
              </div>
            </NavLink>

            <NavLink
              to="/execute"
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/80 dark:text-brand-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`
              }
            >
              <div className="flex items-center space-x-1.5">
                <ShieldCheck size={16} aria-hidden="true" />
                <span>3. Execute</span>
              </div>
            </NavLink>
          </nav>

          {/* Event Quick-Switcher & SSE Indicator */}
          <div className="flex items-center space-x-3">
            {/* Live Stream Indicator */}
            <div
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900"
              title={sseConnected ? 'Real-time SSE active' : 'Connecting live stream'}
              aria-live="polite"
            >
              <Radio
                size={12}
                className={sseConnected ? 'text-emerald-500 animate-pulse' : 'text-slate-400'}
                aria-hidden="true"
              />
              <span className="hidden md:inline text-slate-600 dark:text-slate-400">
                {sseConnected ? 'Live' : 'Syncing'}
              </span>
            </div>

            {/* Event Selector */}
            <div className="relative">
              <label htmlFor="event-switcher" className="sr-only">
                Select Active Event
              </label>
              <select
                id="event-switcher"
                value={currentEvent.id}
                onChange={(e) => {
                  const target = SEED_PRESETS.find((p) => p.id === e.target.value);
                  if (target) switchEvent(target);
                }}
                className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-brand-500 cursor-pointer"
              >
                {SEED_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.eventType === 'wedding'
                      ? '💍 '
                      : preset.eventType === 'birthday'
                        ? '🎂 '
                        : '🎪 '}
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            {/* New Event Brief Button */}
            <Link
              to="/brief"
              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white shadow-xs transition-colors"
              title="Create new event from brief"
            >
              <PlusCircle size={14} aria-hidden="true" />
              <span className="hidden sm:inline">New Brief</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
};
