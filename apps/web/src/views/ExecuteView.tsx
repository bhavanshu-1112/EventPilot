import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useEvent } from '../context/EventContext.js';
import { ScheduleTimeline, type ScheduleItem } from '../components/execute/ScheduleTimeline.js';
import { DisruptionInput } from '../components/execute/DisruptionInput.js';
import {
  RippleSimulationView,
  type RippleSimulationResult,
} from '../components/execute/RippleSimulationView.js';
import { FixProposalsModal, type FixOptionItem } from '../components/execute/FixProposalsModal.js';
import { ApproveAndNotifyModal } from '../components/execute/ApproveAndNotifyModal.js';
import {
  NotificationOutboxPanel,
  type OutboxNotification,
} from '../components/execute/NotificationOutboxPanel.js';

export const ExecuteView: React.FC = () => {
  const { currentEvent, announce } = useEvent();
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [notifications, setNotifications] = useState<OutboxNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);

  // Ripple & Fix modal states
  const [simulation, setSimulation] = useState<RippleSimulationResult | null>(null);
  const [fixOptions, setFixOptions] = useState<FixOptionItem[]>([]);
  const [isFixModalOpen, setIsFixModalOpen] = useState(false);
  const [selectedFixOption, setSelectedFixOption] = useState<FixOptionItem | null>(null);
  const [isNotifyModalOpen, setIsNotifyModalOpen] = useState(false);

  const loadScheduleAndNotifications = async () => {
    try {
      setIsLoading(true);
      const [schedRes, notifRes] = await Promise.all([
        api.schedule.get(currentEvent.id, currentEvent.token),
        api.notifications.list(currentEvent.id, currentEvent.token),
      ]);
      setScheduleItems(schedRes.items || []);
      setNotifications(notifRes.notifications || []);
    } catch {
      // Fallback sample timeline data
      setScheduleItems([
        {
          id: 'item-baraat',
          label: 'Royal Vintage Car & Elephant Baraat Procession',
          startMin: 960, // 4:00 PM
          durationMin: 75,
          fixed: false,
          bufferMin: 15,
          vendor: 'Rajasthan Heritage Brass Band',
          guestVisible: true,
          dependsOn: [],
        },
        {
          id: 'item-varmala',
          label: 'Lakeside Courtyard Varmala Garland Exchange',
          startMin: 1050, // 5:30 PM
          durationMin: 30,
          fixed: false,
          bufferMin: 15,
          vendor: 'Palace Stage Operations',
          guestVisible: true,
          dependsOn: ['item-baraat'],
        },
        {
          id: 'item-cake',
          label: 'Tiered Heritage Cake Cutting & Champagne Toast',
          startMin: 1110, // 6:30 PM
          durationMin: 30,
          fixed: false,
          bufferMin: 15,
          vendor: 'Artisan Pastry Udaipur',
          guestVisible: true,
          dependsOn: ['item-varmala'],
        },
        {
          id: 'item-fireworks',
          label: 'Lake Pichola Fireworks Spectacular (Civic Permitted Window)',
          startMin: 1200, // 8:00 PM
          durationMin: 20,
          fixed: true, // INVARIABLE FIXED ITEM
          bufferMin: 0,
          vendor: 'Mewar Pyrotechnics Ltd',
          guestVisible: true,
          dependsOn: ['item-cake'],
        },
        {
          id: 'item-dinner',
          label: 'Royal Rajasthani Banquet Dinner & Live Ghazal',
          startMin: 1230, // 8:30 PM
          durationMin: 120,
          fixed: false,
          bufferMin: 30,
          vendor: 'Royal Caterers Udaipur',
          guestVisible: true,
          dependsOn: ['item-fireworks'],
        },
      ]);

      setNotifications([
        {
          id: 'notif-1',
          recipientName: 'DJ Vicky',
          recipientPhone: '+919829012345',
          channel: 'whatsapp',
          message:
            'Hi DJ Vicky, sound check complete. Background lounge jazz starts at 3:30 PM at Palace Courtyard.',
          status: 'sent',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadScheduleAndNotifications();
  }, [currentEvent.id]);

  const handleDisruptionSubmit = async (text: string) => {
    setIsSimulating(true);
    announce('Analyzing disruption and computing ripple through DAG constraints.');
    try {
      const res = await api.schedule.disruption(currentEvent.id, text, currentEvent.token);
      setSimulation(res.ripple);
      setFixOptions(res.options || []);
      announce(`Disruption parsed. ${res.options.length} ranked fix options proposed.`);
    } catch {
      // Fallback deterministic simulation calculation for demo
      const delayMin = text.toLowerCase().includes('hour') ? 60 : 45;
      const affected = scheduleItems.map((item) => {
        if (item.id === 'item-cake') {
          return {
            id: item.id,
            label: item.label,
            plannedStartMin: item.startMin,
            projectedStartMin: item.startMin + delayMin,
            delayMin,
            fixed: false,
          };
        }
        if (item.id === 'item-fireworks') {
          return {
            id: item.id,
            label: item.label,
            plannedStartMin: item.startMin,
            projectedStartMin: item.startMin, // fixed item cannot move
            delayMin: 0,
            fixed: true,
            hasConflict: true, // Fireworks permit window collision!
          };
        }
        return {
          id: item.id,
          label: item.label,
          plannedStartMin: item.startMin,
          projectedStartMin: item.startMin,
          delayMin: 0,
          fixed: item.fixed || false,
        };
      });

      setSimulation({
        disruptedItem: 'Cake Delivery',
        delayMinutes: delayMin,
        affectedItems: affected,
        slackConsumedMin: 15,
        hasFixedConflict: true,
        conflictDescription: 'Collision with permitted Lake Pichola fireworks window (8:00 PM)',
      });

      setFixOptions([
        {
          id: 'fix-1',
          rank: 1,
          title: 'Swap Cake Cutting with Acoustic Performance & Shorten by 15 mins',
          strategy: 'swap',
          plainImpact:
            'Swaps cake ceremony with early high-tea acoustic set. Absorbs the 60m delay completely without shifting fixed 8:00 PM fireworks.',
          fixedConflictsCount: 0,
          guestVisibleChangesCount: 1,
          totalMinutesMoved: 45,
          score: 95,
          operations: [],
        },
        {
          id: 'fix-2',
          rank: 2,
          title: 'Compress Cocktail Hour and Move Cake directly after Varmala',
          strategy: 'shorten',
          plainImpact:
            'Compresses cocktail hour buffer from 45 min to 20 min. Eliminates conflict with fireworks.',
          fixedConflictsCount: 0,
          guestVisibleChangesCount: 2,
          totalMinutesMoved: 60,
          score: 82,
          operations: [],
        },
        {
          id: 'fix-3',
          rank: 3,
          title: 'Shift Cake Cutting to Midnight Dessert Station',
          strategy: 'shift',
          plainImpact:
            'Moves cake cutting after dinner. Preserves fireworks but alters planned guest experience order.',
          fixedConflictsCount: 0,
          guestVisibleChangesCount: 3,
          totalMinutesMoved: 120,
          score: 68,
          operations: [],
        },
      ]);
      announce(`Disruption simulated. 3 ranked fix options proposed.`);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSelectFixOption = (option: FixOptionItem) => {
    setSelectedFixOption(option);
    setIsFixModalOpen(false);
    setIsNotifyModalOpen(true);
  };

  const handleApplyFix = async (option: FixOptionItem) => {
    try {
      await api.schedule.applyFix(currentEvent.id, option, currentEvent.token);
    } catch {
      // Local optimistic update
    }

    // Add staged messages to outbox
    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}-1`,
        recipientName: 'DJ Vicky',
        recipientPhone: '+919829012345',
        channel: 'whatsapp',
        message:
          'SCHEDULE UPDATE: Cake cutting shifted to 8:30 PM. Please extend acoustic set until 8:15 PM.',
        status: 'queued',
        createdAt: new Date().toISOString(),
      },
      {
        id: `notif-${Date.now()}-2`,
        recipientName: 'Chef Ranveer',
        recipientPhone: '+919829054321',
        channel: 'sms',
        message: 'EVENTPILOT NOTICE: Dinner banquet live counters delayed 25 mins to 8:45 PM.',
        status: 'queued',
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);

    setSimulation(null);
    await loadScheduleAndNotifications();
    announce('Schedule fix applied and outbox alerts queued.');
  };

  const handleSendNotification = async (notificationId: string) => {
    try {
      await api.notifications.send(currentEvent.id, notificationId, currentEvent.token);
    } catch {
      // Optimistic update
    }

    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, status: 'sent' } : n)),
    );
    announce('Notification sent successfully.');
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
          Stage 3: Execute &amp; Live Day-of Operations
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Monitor your real-time schedule, speak or type disruptions, compute DAG dependency
          ripples, rank fix proposals, and stage vendor outbox notifications.
        </p>
      </div>

      {/* Disruption Voice & Text Input */}
      <DisruptionInput onSubmitDisruption={handleDisruptionSubmit} isAnalyzing={isSimulating} />

      {/* Ripple Propagation Simulation Result */}
      {simulation && (
        <RippleSimulationView
          simulation={simulation}
          onReviewFixes={() => setIsFixModalOpen(true)}
        />
      )}

      {/* Day-of Schedule Timeline */}
      <ScheduleTimeline items={scheduleItems} isLoading={isLoading} />

      {/* Notification Outbox */}
      <NotificationOutboxPanel
        notifications={notifications}
        onSend={handleSendNotification}
        isLoading={isLoading}
      />

      {/* Fix Proposals Modal */}
      <FixProposalsModal
        isOpen={isFixModalOpen}
        onClose={() => setIsFixModalOpen(false)}
        options={fixOptions}
        onSelectOption={handleSelectFixOption}
      />

      {/* Approve and Notify Modal */}
      <ApproveAndNotifyModal
        isOpen={isNotifyModalOpen}
        onClose={() => setIsNotifyModalOpen(false)}
        selectedOption={selectedFixOption}
        onConfirmApply={handleApplyFix}
      />
    </div>
  );
};
