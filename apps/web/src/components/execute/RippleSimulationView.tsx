import { GitBranch } from 'lucide-react';
import { Badge } from '../common/Badge.js';

export interface RippleAffectedItem {
  id: string;
  label: string;
  plannedStartMin: number;
  projectedStartMin: number;
  delayMin: number;
  fixed: boolean;
  hasConflict?: boolean;
}

export interface RippleSimulationResult {
  disruptedItem: string;
  delayMinutes: number;
  affectedItems: RippleAffectedItem[];
  slackConsumedMin: number;
  hasFixedConflict: boolean;
  conflictDescription?: string;
}

interface RippleSimulationViewProps {
  simulation: RippleSimulationResult;
  onReviewFixes: () => void;
}

function formatMinutesToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export const RippleSimulationView: React.FC<RippleSimulationViewProps> = ({
  simulation,
  onReviewFixes,
}) => {
  return (
    <div className="glass-card p-6 mb-8 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <GitBranch size={18} aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              DAG Ripple Propagation Simulation
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Downstream milestone shifts computed using topological dependency constraints
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onReviewFixes}
          className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 transition shadow-xs"
        >
          <span>Review 3 Ranked Fix Options &rarr;</span>
        </button>
      </div>

      {/* Ripple Impact Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <span className="text-[10px] text-slate-500 uppercase block mb-0.5">
            Initial Disruption
          </span>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
            +{simulation.delayMinutes} min delay
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <span className="text-[10px] text-slate-500 uppercase block mb-0.5">Slack Consumed</span>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {simulation.slackConsumedMin} minutes
          </span>
        </div>

        <div
          className={`p-3 rounded-xl border ${
            simulation.hasFixedConflict
              ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
          }`}
        >
          <span className="text-[10px] uppercase block mb-0.5">Fixed Milestone Conflict</span>
          <span className="text-sm font-bold">
            {simulation.hasFixedConflict
              ? '🚨 Conflict with Fixed Item'
              : '✅ No Inflexible Conflicts'}
          </span>
        </div>
      </div>

      {/* Affected Milestones Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <caption className="sr-only">
            Ripple propagation showing planned versus projected times for affected schedule items
          </caption>
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Milestone Item
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Planned Start
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Projected Start
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Total Delay
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {simulation.affectedItems.map((item) => (
              <tr
                key={item.id}
                className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 ${
                  item.hasConflict ? 'bg-red-50/40 dark:bg-red-950/20' : ''
                }`}
              >
                <th
                  scope="row"
                  className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100"
                >
                  {item.label}
                  {item.fixed && (
                    <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      Fixed Locked
                    </span>
                  )}
                </th>

                <td className="px-4 py-3 text-slate-500">
                  {formatMinutesToTime(item.plannedStartMin)}
                </td>

                <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                  {formatMinutesToTime(item.projectedStartMin)}
                </td>

                <td className="px-4 py-3 font-semibold text-amber-600 dark:text-amber-400">
                  +{item.delayMin} min
                </td>

                <td className="px-4 py-3">
                  {item.hasConflict ? (
                    <Badge variant="danger" size="sm">
                      Fixed Collision
                    </Badge>
                  ) : item.delayMin > 0 ? (
                    <Badge variant="warning" size="sm">
                      Shifted
                    </Badge>
                  ) : (
                    <Badge variant="success" size="sm">
                      On Time
                    </Badge>
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
