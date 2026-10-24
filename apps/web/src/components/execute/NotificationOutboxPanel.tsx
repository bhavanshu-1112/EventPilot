import { Send } from 'lucide-react';
import { Badge } from '../common/Badge.js';
import { useEvent } from '../../context/EventContext.js';

export interface OutboxNotification {
  id: string;
  recipientName: string;
  recipientPhone?: string | null;
  channel: 'sms' | 'whatsapp';
  message: string;
  status: 'queued' | 'sent' | 'failed';
  idempotencyKey?: string;
  createdAt: string;
}

interface NotificationOutboxPanelProps {
  notifications: OutboxNotification[];
  onSend: (id: string) => Promise<void>;
  isLoading?: boolean;
}

export const NotificationOutboxPanel: React.FC<NotificationOutboxPanelProps> = ({
  notifications,
  onSend,
  isLoading,
}) => {
  const { announce } = useEvent();

  const handleManualSend = async (id: string) => {
    try {
      await onSend(id);
      announce('Notification dispatched.');
    } catch {
      announce('Failed to dispatch notification.');
    }
  };

  return (
    <div className="glass-card p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Send size={18} aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Live Notification Outbox
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dry-run simulator mode active (Twilio SMS/WhatsApp allowlist ready)
            </p>
          </div>
        </div>

        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
          {notifications.length} Messages
        </span>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-xs text-slate-500">Loading outbox...</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-6 text-xs text-slate-500">
          No notifications staged yet. When you absorb a disruption and approve a fix, vendor alerts
          queue here.
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => {
            const isSent = notif.status === 'sent';
            return (
              <div
                key={notif.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  isSent
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-800/40'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                      {notif.recipientName}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      ({notif.recipientPhone || 'Dry-run Mode'})
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      {notif.channel}
                    </span>
                    {isSent ? (
                      <Badge variant="success" size="sm">
                        Delivered
                      </Badge>
                    ) : (
                      <Badge variant="warning" size="sm">
                        Queued
                      </Badge>
                    )}
                  </div>
                </div>

                <p className="text-xs font-mono text-slate-700 dark:text-slate-300 p-2 rounded bg-slate-100/60 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 italic mb-2">
                  "{notif.message}"
                </p>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Queued: {new Date(notif.createdAt).toLocaleTimeString()}</span>

                  {!isSent && (
                    <button
                      type="button"
                      onClick={() => handleManualSend(notif.id)}
                      className="inline-flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-xs"
                    >
                      <Send size={12} aria-hidden="true" />
                      <span>Dispatch Now</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
