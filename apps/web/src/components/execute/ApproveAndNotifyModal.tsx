import React, { useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { AccessibleModal } from '../common/AccessibleModal.js';
import { useEvent } from '../../context/EventContext.js';
import type { FixOptionItem } from './FixProposalsModal.js';

export interface StagedMessageDraft {
  recipientName: string;
  role: string;
  channel: 'sms' | 'whatsapp';
  phone: string;
  message: string;
}

interface ApproveAndNotifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOption: FixOptionItem | null;
  onConfirmApply: (option: FixOptionItem) => Promise<void>;
}

export const ApproveAndNotifyModal: React.FC<ApproveAndNotifyModalProps> = ({
  isOpen,
  onClose,
  selectedOption,
  onConfirmApply,
}) => {
  const { announce } = useEvent();
  const [isApplying, setIsApplying] = useState(false);

  if (!selectedOption) return null;

  const mockDrafts: StagedMessageDraft[] = [
    {
      recipientName: 'DJ Vicky',
      role: 'Entertainment Lead',
      channel: 'whatsapp',
      phone: '+919829012345',
      message:
        'Hi DJ Vicky 🙏 Update on evening schedule: Cake cutting is shifted by 30 mins to 8:30 PM. Please extend ambient acoustic lounge set until 8:15 PM.',
    },
    {
      recipientName: 'Chef Ranveer',
      role: 'Royal Mewari Banquet Catering',
      channel: 'sms',
      phone: '+919829054321',
      message:
        'URGENT EVENTPILOT UPDATE: Banquet dinner service delayed by 25 mins. Please hold main course live stations warm until 8:45 PM.',
    },
    {
      recipientName: 'Aarav (Groom Lead)',
      role: 'Family Lead',
      channel: 'whatsapp',
      phone: '+919829099999',
      message:
        'Aarav, cake delivery delayed by traffic. Fix applied: shortened photo session by 15 mins. Entire evening remains on schedule without missing lakeside fireworks.',
    },
  ];

  const handleApply = async () => {
    setIsApplying(true);
    try {
      await onConfirmApply(selectedOption);
      announce('Schedule updated atomically and vendor notifications staged to outbox.');
      onClose();
    } catch {
      announce('Failed to apply schedule fix.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Approve Fix &amp; Stage Vendor Notifications"
      description="Applying this fix updates schedule times atomically and queues vendor SMS & WhatsApp alerts."
      maxWidth="2xl"
    >
      <div className="space-y-4">
        {/* Selected Fix Summary Banner */}
        <div className="p-3.5 rounded-xl bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 text-xs">
          <span className="font-bold text-brand-900 dark:text-brand-200 block mb-0.5">
            Active Proposal: {selectedOption.title}
          </span>
          <p className="text-brand-800 dark:text-brand-300">{selectedOption.plainImpact}</p>
        </div>

        {/* Message Drafts */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Automated Vendor Message Drafts (Outbox Queue):
          </h4>
          <div className="space-y-2.5">
            {mockDrafts.map((draft, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {draft.recipientName}
                    </span>
                    <span className="text-[10px] text-slate-400">({draft.role})</span>
                  </div>
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                    {draft.channel.toUpperCase()} &bull; {draft.phone}
                  </span>
                </div>
                <p className="font-mono text-slate-700 dark:text-slate-300 italic p-2 rounded bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                  "{draft.message}"
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Back to Options
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={isApplying}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
          >
            {isApplying ? (
              <>
                <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                <span>Applying Schedule Fix...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={14} aria-hidden="true" />
                <span>Confirm Fix &amp; Dispatch Alerts</span>
              </>
            )}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};
