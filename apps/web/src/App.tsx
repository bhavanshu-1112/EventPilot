import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventProvider } from './context/EventContext.js';
import { Header } from './components/common/Header.js';
import { BudgetSummaryHeader } from './components/common/BudgetSummaryHeader.js';
import { LiveAnnouncer } from './components/common/LiveAnnouncer.js';
import { PlanView } from './views/PlanView.js';
import { SourceView } from './views/SourceView.js';
import { ExecuteView } from './views/ExecuteView.js';
import { BriefView } from './views/BriefView.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <EventProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
            {/* Accessible Skip Link */}
            <a href="#main-content" className="skip-link">
              Skip to main content
            </a>

            {/* Accessible Live Region Announcer for screen readers */}
            <LiveAnnouncer />

            {/* Semantic Header */}
            <Header />

            {/* Sticky Budget Summary Header */}
            <BudgetSummaryHeader />

            {/* Main Landmark */}
            <main
              id="main-content"
              role="main"
              className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 focus:outline-none"
            >
              <Routes>
                <Route path="/" element={<Navigate to="/plan" replace />} />
                <Route path="/plan" element={<PlanView />} />
                <Route path="/source" element={<SourceView />} />
                <Route path="/execute" element={<ExecuteView />} />
                <Route path="/brief" element={<BriefView />} />
                <Route path="*" element={<Navigate to="/plan" replace />} />
              </Routes>
            </main>

            {/* Semantic Footer */}
            <footer
              role="contentinfo"
              className="border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 py-6 text-center text-xs text-slate-500 dark:text-slate-400"
            >
              <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
                <span>
                  &copy; {new Date().getFullYear()} EventPilot &bull; GenAI Celebration &amp; Event
                  Planning Architecture
                </span>
                <span className="flex items-center space-x-3">
                  <span>WCAG 2.2 AA Verified</span>
                  <span>&bull;</span>
                  <span>Deterministic Money Math (Minor Units)</span>
                </span>
              </div>
            </footer>
          </div>
        </BrowserRouter>
      </EventProvider>
    </QueryClientProvider>
  );
}
