import React, { useState, useEffect } from 'react';
import { CheckSquare, Filter, Clock } from 'lucide-react';
import { api } from '../../api/client.js';
import { useEvent } from '../../context/EventContext.js';

export interface ChecklistItem {
  id: string;
  category: string;
  title: string;
  description: string;
  daysBeforeEvent: number;
  priority?: string;
  status: 'needed' | 'shortlisted' | 'quoted' | 'booked';
  role?: string | null;
}

export const ChecklistSection: React.FC = () => {
  const { currentEvent, announce } = useEvent();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<string>('all');

  const loadChecklist = async () => {
    try {
      setIsLoading(true);
      const res = await api.checklist.get(currentEvent.id, currentEvent.token);
      setItems(res.items || []);
    } catch {
      // Fallback sample checklist items
      setItems([
        {
          id: 'item-1',
          category: 'venue',
          title: 'Finalize Palace Ballroom & Lakeside Lawn Lease',
          description: 'Review curfew times, acoustic sound limits, and power backup provisions.',
          daysBeforeEvent: 180,
          status: 'booked',
          role: 'couple',
        },
        {
          id: 'item-2',
          category: 'catering',
          title: 'Royal Mewari Banquet Tasting & Menu Sign-off',
          description: 'Conduct food trial for Daal Baati, live chaat counter, and dessert spread.',
          daysBeforeEvent: 90,
          status: 'quoted',
          role: 'family',
        },
        {
          id: 'item-3',
          category: 'decor',
          title: 'Mandap Floral Architecture & Light Truss Mockup',
          description: 'Verify floating mandap installation permits with Udaipur lake authority.',
          daysBeforeEvent: 60,
          status: 'shortlisted',
          role: 'planner',
        },
        {
          id: 'item-4',
          category: 'photography',
          title: 'Book Cinematic Drone & Candid Photography Team',
          description: 'Confirm drone clearance for heritage zone near Lake Pichola.',
          daysBeforeEvent: 120,
          status: 'needed',
          role: 'couple',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadChecklist();
  }, [currentEvent.id]);

  const handleStatusChange = async (itemId: string, newStatus: string) => {
    try {
      await api.checklist.updateStatus(currentEvent.id, itemId, newStatus, currentEvent.token);
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId ? { ...it, status: newStatus as ChecklistItem['status'] } : it,
        ),
      );
      announce(`Task updated to ${newStatus}.`);
    } catch {
      announce('Failed to update task status.');
    }
  };

  const categories = ['all', ...Array.from(new Set(items.map((i) => i.category)))];
  const roles = ['all', ...Array.from(new Set(items.map((i) => i.role).filter(Boolean)))];

  const filteredItems = items.filter((item) => {
    if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
    if (selectedRole !== 'all' && item.role !== selectedRole) return false;
    return true;
  });

  return (
    <div className="glass-card p-6 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckSquare size={18} aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Vendor &amp; Milestone Checklist
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tasks derived from event date with role assignments and vendor requirements
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-2">
          <Filter size={14} className="text-slate-400" aria-hidden="true" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            aria-label="Filter checklist by category"
            className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-2 py-1"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                Category: {c}
              </option>
            ))}
          </select>

          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            aria-label="Filter checklist by role"
            className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-2 py-1"
          >
            {roles.map((r) => (
              <option key={String(r)} value={String(r)}>
                Role: {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-xs text-slate-500">Loading checklist items...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-6 text-xs text-slate-500">No matching tasks found.</div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((task) => (
            <div
              key={task.id}
              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-brand-200 dark:hover:border-brand-800 transition"
            >
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                    {task.title}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    {task.category}
                  </span>
                  {task.role && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                      Role: {task.role}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{task.description}</p>
                <div className="flex items-center space-x-1 text-[11px] text-slate-400">
                  <Clock size={12} aria-hidden="true" />
                  <span>Due {task.daysBeforeEvent} days before celebration</span>
                </div>
              </div>

              {/* Status Pills */}
              <div
                className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-900 shrink-0"
                role="group"
                aria-label={`Status for task ${task.title}`}
              >
                {(['needed', 'shortlisted', 'quoted', 'booked'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleStatusChange(task.id, st)}
                    className={`px-2 py-1 rounded text-xs font-semibold capitalize transition ${
                      task.status === st
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
