/**
 * Event Context
 * Manages active event, budget state, SSE subscriptions, and global rebalance modals.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.js';

export interface EventPreset {
  id: string;
  token: string;
  name: string;
  eventType: 'wedding' | 'birthday' | 'community';
  city: string;
  guestCount: number;
  totalBudgetMinor: number;
  currency: string;
}

export const SEED_PRESETS: EventPreset[] = [
  {
    id: 'evt-wedding-udaipur-01',
    token: 'token-wedding-udaipur-secret-128',
    name: 'Aarav & Ananya Royal Udaipur Wedding',
    eventType: 'wedding',
    city: 'Udaipur, Rajasthan',
    guestCount: 350,
    totalBudgetMinor: 350000000,
    currency: 'INR',
  },
  {
    id: 'evt-birthday-01',
    token: 'token-birthday-kabir-secret-128',
    name: "Kabir's 40th Milestone Rooftop Soiree",
    eventType: 'birthday',
    city: 'Udaipur, Rajasthan',
    guestCount: 85,
    totalBudgetMinor: 40000000,
    currency: 'INR',
  },
  {
    id: 'evt-community-01',
    token: 'token-community-fest-secret-128',
    name: 'Mewar Heritage Youth & Folk Festival 2026',
    eventType: 'community',
    city: 'Udaipur Cultural Grounds',
    guestCount: 1200,
    totalBudgetMinor: 80000000,
    currency: 'INR',
  },
];

export interface BudgetCategoryState {
  categoryId: string;
  label: string;
  allocatedMinor?: number;
  spentMinor?: number;
  locked?: boolean;
  isLocked?: boolean;
}

export interface BudgetState {
  categories: BudgetCategoryState[];
  totalBudgetMinor: number;
  allocatedMinor: number;
  spentMinor: number;
  remainingBudgetMinor: number;
  contingencyMinor: number;
  contingencyFloorPercent: number;
}

export interface RebalanceState {
  isOpen: boolean;
  overrun?: {
    categoryId: string;
    categoryName: string;
    allocatedMinor: number;
    newSpentMinor: number;
    overrunMinor: number;
  };
  proposal?: {
    cuts?: Array<{
      categoryId: string;
      categoryLabel?: string;
      cutMinor: number;
      reason: string;
    }>;
  };
}

interface EventContextValue {
  currentEvent: EventPreset;
  budget: BudgetState | null;
  isLoadingBudget: boolean;
  sseConnected: boolean;
  liveAnnouncement: string;
  rebalanceState: RebalanceState;
  switchEvent: (preset: EventPreset) => void;
  refreshBudget: () => Promise<void>;
  announce: (message: string) => void;
  openRebalance: (overrun: RebalanceState['overrun'], proposal: RebalanceState['proposal']) => void;
  closeRebalance: () => void;
  applyRebalance: (proposal: RebalanceState['proposal']) => Promise<void>;
}

const EventContext = createContext<EventContextValue | null>(null);

export const EventProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentEvent, setCurrentEvent] = useState<EventPreset>(SEED_PRESETS[0] as EventPreset);
  const [budget, setBudget] = useState<BudgetState | null>(null);
  const [isLoadingBudget, setIsLoadingBudget] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [rebalanceState, setRebalanceState] = useState<RebalanceState>({ isOpen: false });

  const announce = useCallback((msg: string) => {
    setLiveAnnouncement(msg);
  }, []);

  const refreshBudget = useCallback(async () => {
    if (!currentEvent.id || !currentEvent.token) return;
    try {
      setIsLoadingBudget(true);
      const data = await api.budget.get(currentEvent.id, currentEvent.token);
      setBudget(data);
    } catch {
      // Fallback optimistic budget if API server not yet running or mock mode
      setBudget({
        categories: [
          {
            categoryId: 'venue',
            label: 'Venue & Spaces',
            allocatedMinor: Math.floor(currentEvent.totalBudgetMinor * 0.28),
            spentMinor: Math.floor(currentEvent.totalBudgetMinor * 0.25),
            isLocked: true,
          },
          {
            categoryId: 'catering',
            label: 'Catering & Food',
            allocatedMinor: Math.floor(currentEvent.totalBudgetMinor * 0.28),
            spentMinor: Math.floor(currentEvent.totalBudgetMinor * 0.2),
            isLocked: false,
          },
          {
            categoryId: 'decor',
            label: 'Decor & Production',
            allocatedMinor: Math.floor(currentEvent.totalBudgetMinor * 0.16),
            spentMinor: Math.floor(currentEvent.totalBudgetMinor * 0.1),
            isLocked: false,
          },
          {
            categoryId: 'photography',
            label: 'Photography & Cinema',
            allocatedMinor: Math.floor(currentEvent.totalBudgetMinor * 0.1),
            spentMinor: 0,
            isLocked: false,
          },
          {
            categoryId: 'contingency',
            label: 'Contingency Floor',
            allocatedMinor: Math.floor(currentEvent.totalBudgetMinor * 0.1),
            spentMinor: 0,
            isLocked: true,
          },
        ],
        totalBudgetMinor: currentEvent.totalBudgetMinor,
        allocatedMinor: Math.floor(currentEvent.totalBudgetMinor * 0.92),
        spentMinor: Math.floor(currentEvent.totalBudgetMinor * 0.55),
        remainingBudgetMinor: Math.floor(currentEvent.totalBudgetMinor * 0.45),
        contingencyMinor: Math.floor(currentEvent.totalBudgetMinor * 0.1),
        contingencyFloorPercent: 10,
      });
    } finally {
      setIsLoadingBudget(false);
    }
  }, [currentEvent.id, currentEvent.token, currentEvent.totalBudgetMinor]);

  const switchEvent = useCallback(
    (preset: EventPreset) => {
      setCurrentEvent(preset);
      announce(`Switched to event: ${preset.name}`);
    },
    [announce],
  );

  useEffect(() => {
    void refreshBudget();
  }, [refreshBudget]);

  // Subscribe to SSE stream
  useEffect(() => {
    if (!currentEvent.id || !currentEvent.token) return;

    let cleanupStream: (() => void) | undefined;
    try {
      cleanupStream = api.sse.createStream(
        currentEvent.id,
        currentEvent.token,
        (evt) => {
          setSseConnected(true);
          if (evt.type === 'budget:rebalanced' || evt.type === 'quote:booked') {
            void refreshBudget();
            announce('Budget updated via live event stream.');
          } else if (evt.type === 'schedule:disruption' || evt.type === 'schedule:fix_applied') {
            announce('Schedule updated via live event stream.');
          }
        },
        () => {
          setSseConnected(false);
        },
      );
      setSseConnected(true);
    } catch {
      setSseConnected(false);
    }

    return () => {
      if (cleanupStream) cleanupStream();
      setSseConnected(false);
    };
  }, [currentEvent.id, currentEvent.token, refreshBudget, announce]);

  const openRebalance = useCallback(
    (overrun: RebalanceState['overrun'], proposal: RebalanceState['proposal']) => {
      setRebalanceState({ isOpen: true, overrun, proposal });
    },
    [],
  );

  const closeRebalance = useCallback(() => {
    setRebalanceState({ isOpen: false });
  }, []);

  const applyRebalance = useCallback(
    async (proposal: RebalanceState['proposal']) => {
      if (!currentEvent.id || !currentEvent.token) return;
      await api.budget.applyRebalance(currentEvent.id, proposal, currentEvent.token);
      await refreshBudget();
      closeRebalance();
      announce('Budget rebalance approved and applied.');
    },
    [currentEvent.id, currentEvent.token, refreshBudget, closeRebalance, announce],
  );

  return (
    <EventContext.Provider
      value={{
        currentEvent,
        budget,
        isLoadingBudget,
        sseConnected,
        liveAnnouncement,
        rebalanceState,
        switchEvent,
        refreshBudget,
        announce,
        openRebalance,
        closeRebalance,
        applyRebalance,
      }}
    >
      {children}
    </EventContext.Provider>
  );
};

export function useEvent() {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEvent must be used within an EventProvider');
  }
  return context;
}
