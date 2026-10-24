import React from 'react';
import { Clock, Users } from 'lucide-react';
import { Badge } from '../common/Badge.js';

export interface ScheduleItem {
  id: string;
  label: string;
  startMin: number;
  durationMin: number;
  fixed?: boolean;
  bufferMin?: number;
  vendor?: string | null;
  guestVisible?: boolean;
  priority?: number;
  dependsOn?: string[];
}

interface ScheduleTimelineProps {
  items: ScheduleItem[];
  isLoading?: boolean;
}

function formatMinutesToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export const ScheduleTimeline: React.FC<ScheduleTimelineProps> = ({ items, isLoading }) => {
  if (isLoading) {
    return (
      <div className="glass-card p-8 text-center text-xs text-slate-500">
        Loading day-of schedule run sheet...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-xs text-slate-500 mb-8">
        No schedule milestones found.
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Day-of Run Sheet &amp; Live Timeline
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ordered by schedule time with dependency buffers and locked milestone tags
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
          {items.length} Milestones
        </span>
      </div>

      <div
        role="region"
        aria-label="Day-of Schedule Run Sheet"
        className="overflow-x-auto focus:outline-none"
      >
        <table className="w-full text-left border-collapse text-xs">
          <caption className="sr-only">
            Day-of timeline milestones detailing start time, duration, fixed status, vendor, and
            dependencies
          </caption>
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
              <th scope="col" className="px-6 py-3 font-semibold">
                Scheduled Time
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Milestone &amp; Sub-event
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Duration &amp; Buffer
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Vendor / Contact
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">
                Constraints
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {items.map((item) => (
              <tr
                key={item.id}
                className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <th
                  scope="row"
                  className="px-6 py-3.5 font-bold text-sm text-slate-900 dark:text-slate-100 whitespace-nowrap"
                >
                  <div className="flex items-center space-x-1.5">
                    <Clock size={14} className="text-slate-400" aria-hidden="true" />
                    <span>{formatMinutesToTime(item.startMin)}</span>
                  </div>
                </th>

                <td className="px-4 py-3.5">
                  <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                    {item.label}
                  </span>
                  {item.dependsOn && item.dependsOn.length > 0 && (
                    <span className="text-[11px] text-slate-400">
                      Depends on: {item.dependsOn.join(', ')}
                    </span>
                  )}
                </td>

                <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                  {item.durationMin} mins
                  {item.bufferMin ? (
                    <span className="text-[11px] text-slate-400 ml-1">
                      (+{item.bufferMin}m buffer)
                    </span>
                  ) : null}
                </td>

                <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                  {item.vendor || <span className="text-slate-400 italic">Self-managed</span>}
                </td>

                <td className="px-4 py-3.5 text-right space-x-1.5">
                  {item.fixed ? (
                    <Badge variant="locked" size="sm">
                      Fixed (Inflexible)
                    </Badge>
                  ) : (
                    <Badge variant="unlocked" size="sm">
                      Flexible
                    </Badge>
                  )}
                  {item.guestVisible && (
                    <span
                      className="inline-flex items-center text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-medium"
                      title="Visible on guest schedule"
                    >
                      <Users size={11} className="mr-1" aria-hidden="true" />
                      Guest Facing
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
