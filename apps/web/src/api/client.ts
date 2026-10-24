/**
 * Type-safe API Client for EventPilot Frontend
 * Communicates with backend endpoints with automatic token injection and error handling.
 */

export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: unknown;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(res: ApiErrorResponse) {
    super(res.message || 'An unexpected API error occurred');
    this.name = 'ApiError';
    this.statusCode = res.statusCode;
    this.code = res.code;
    this.details = res.details;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export function buildApiUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  return `${API_BASE_URL}${endpoint}`;
}

async function request<T>(endpoint: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('x-event-token', token);
  }

  // Set json content type unless FormData
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(buildApiUrl(endpoint), {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorPayload: ApiErrorResponse;
    try {
      errorPayload = (await response.json()) as ApiErrorResponse;
    } catch {
      errorPayload = {
        statusCode: response.status,
        error: response.statusText,
        message: `HTTP error ${response.status}`,
      };
    }
    throw new ApiError(errorPayload);
  }

  return response.json() as Promise<T>;
}

export const api = {
  events: {
    parseBrief: (brief: string) =>
      request<{ brief: Record<string, unknown> }>('/api/v1/events/parse-brief', {
        method: 'POST',
        body: JSON.stringify({ brief }),
      }),

    create: (data: Record<string, unknown>) =>
      request<{
        event: {
          id: string;
          name: string;
          eventType: 'wedding' | 'birthday' | 'community';
          location: string;
          eventDate: string;
          guestCount: number;
          totalBudgetMinor: number;
          currency: string;
        };
        token: string;
      }>('/api/v1/events', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    get: (id: string, token: string) =>
      request<{
        event: {
          id: string;
          name: string;
          eventType: 'wedding' | 'birthday' | 'community';
          location: string;
          guestCount: number;
          totalBudgetMinor: number;
          currency: string;
        };
        budgetCategories: Array<{
          categoryId: string;
          label: string;
          allocatedMinor: number;
          spentMinor: number;
          isLocked: boolean;
        }>;
        ceremonies: Array<{ id: string; name: string }>;
        checklistSummary: Record<string, unknown>;
        bomSummary: Record<string, unknown>;
      }>(`/api/v1/events/${id}`, { method: 'GET' }, token),
  },

  budget: {
    get: (id: string, token: string) =>
      request<{
        categories: Array<{
          categoryId: string;
          label: string;
          allocatedMinor: number;
          spentMinor: number;
          isLocked: boolean;
        }>;
        totalBudgetMinor: number;
        allocatedMinor: number;
        spentMinor: number;
        remainingBudgetMinor: number;
        contingencyMinor: number;
        contingencyFloorPercent: number;
      }>(`/api/v1/events/${id}/budget`, { method: 'GET' }, token),

    toggleLock: (id: string, categoryId: string, locked: boolean, token: string) =>
      request<{ categoryId: string; locked: boolean }>(
        `/api/v1/events/${id}/budget/categories/${categoryId}/lock`,
        {
          method: 'POST',
          body: JSON.stringify({ locked }),
        },
        token,
      ),

    proposeRebalance: (id: string, payload: unknown, token: string) =>
      request<unknown>(
        `/api/v1/events/${id}/budget/rebalance/propose`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        token,
      ),

    applyRebalance: (id: string, proposal: unknown, token: string) =>
      request<unknown>(
        `/api/v1/events/${id}/budget/rebalance/apply`,
        {
          method: 'POST',
          body: JSON.stringify(proposal),
        },
        token,
      ),

    getLedger: (id: string, token: string) =>
      request<{ entries: Array<Record<string, unknown>> }>(
        `/api/v1/events/${id}/budget/ledger`,
        { method: 'GET' },
        token,
      ),
  },

  inspiration: {
    upload: (id: string, file: File, description: string, token: string) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('description', description);
      return request<{
        inspiration: { decorStyle?: string; palette?: string[] };
        bom: { items: Array<Record<string, unknown>>; totalMinor: number; currency: string };
      }>(`/api/v1/events/${id}/inspiration`, { method: 'POST', body: formData }, token);
    },
  },

  bom: {
    get: (id: string, token: string) =>
      request<{
        items: Array<{
          id: string;
          category: string;
          item: string;
          quantity: number;
          unit: string;
          catalogKey?: string;
          selectedTier: 'save' | 'standard' | 'splurge';
          tiers: {
            save: { unitPriceMinor: number; totalMinor: number; description: string };
            standard: { unitPriceMinor: number; totalMinor: number; description: string };
            splurge: { unitPriceMinor: number; totalMinor: number; description: string };
          };
        }>;
        totalMinor: number;
        currency: string;
      }>(`/api/v1/events/${id}/bom`, { method: 'GET' }, token),

    updateTier: (
      id: string,
      itemId: string,
      selectedTier: 'save' | 'standard' | 'splurge',
      token: string,
    ) =>
      request<{ item: Record<string, unknown>; totalMinor: number }>(
        `/api/v1/events/${id}/bom/${itemId}/tier`,
        {
          method: 'PATCH',
          body: JSON.stringify({ selectedTier }),
        },
        token,
      ),
  },

  checklist: {
    get: (id: string, token: string) =>
      request<{
        items: Array<{
          id: string;
          category: string;
          title: string;
          description: string;
          daysBeforeEvent: number;
          priority?: string;
          status: 'needed' | 'shortlisted' | 'quoted' | 'booked';
          role?: string | null;
        }>;
      }>(`/api/v1/events/${id}/checklist`, { method: 'GET' }, token),

    updateStatus: (id: string, itemId: string, status: string, token: string) =>
      request<unknown>(
        `/api/v1/events/${id}/checklist/${itemId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        },
        token,
      ),
  },

  ideas: {
    generate: (id: string, token: string) =>
      request<{
        ideas: Array<{
          id: string;
          title: string;
          description: string;
          category: string;
          estimatedCostMinor: number;
          whyFits: string;
          status: 'suggested' | 'accepted' | 'rejected';
        }>;
        remainingBudgetMinor: number;
        count: number;
      }>(`/api/v1/events/${id}/ideas`, { method: 'POST' }, token),

    get: (id: string, token: string) =>
      request<{
        ideas: Array<{
          id: string;
          title: string;
          description: string;
          category: string;
          estimatedCostMinor: number;
          whyFits: string;
          status: 'suggested' | 'accepted' | 'rejected';
        }>;
      }>(`/api/v1/events/${id}/ideas`, { method: 'GET' }, token),

    accept: (id: string, ideaId: string, token: string) =>
      request<{ idea: Record<string, unknown> }>(
        `/api/v1/events/${id}/ideas/${ideaId}/accept`,
        { method: 'POST' },
        token,
      ),
  },

  quotes: {
    upload: (id: string, category: string, file: File, token: string) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      return request<{
        quote: Record<string, unknown>;
        flags: unknown[];
        lineItems: unknown[];
      }>(`/api/v1/events/${id}/quotes`, { method: 'POST', body: formData }, token);
    },

    list: (id: string, token: string) =>
      request<{ quotes: Array<Record<string, unknown>> }>(
        `/api/v1/events/${id}/quotes`,
        { method: 'GET' },
        token,
      ),

    compare: (id: string, category: string, token: string) =>
      request<{
        quotes: Array<{
          id: string;
          vendorName: string;
          category: string;
          totalMinor: number;
          computedAllInMinor: number;
          taxAssumptions?: string;
          flagsCount: number;
          highSeverityCount: number;
          lineItemsCount: number;
          status: 'pending' | 'booked';
          flags?: Array<{
            ruleCode: string;
            severity: 'high' | 'medium' | 'low';
            title?: string;
            explanation: string;
            sourceQuote?: string;
            sourcePage?: number;
          }>;
        }>;
        category: string;
        taxRules: unknown;
      }>(
        `/api/v1/events/${id}/quotes/compare?category=${encodeURIComponent(category)}`,
        { method: 'GET' },
        token,
      ),

    negotiate: (id: string, quoteId: string, tone: 'email' | 'whatsapp', token: string) =>
      request<{ draft: string; tone: string; citedFlags: string[] }>(
        `/api/v1/events/${id}/quotes/${quoteId}/negotiate`,
        {
          method: 'POST',
          body: JSON.stringify({ tone }),
        },
        token,
      ),

    book: (id: string, quoteId: string, token: string) =>
      request<{
        booked: boolean;
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
        quote?: unknown;
      }>(
        `/api/v1/events/${id}/quotes/${quoteId}/book`,
        {
          method: 'POST',
        },
        token,
      ),
  },

  schedule: {
    get: (id: string, token: string) =>
      request<{
        items: Array<{
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
        }>;
      }>(`/api/v1/events/${id}/schedule`, { method: 'GET' }, token),

    disruption: (id: string, text: string, token: string) =>
      request<{
        disruption: Record<string, unknown>;
        ripple: {
          disruptedItem: string;
          delayMinutes: number;
          affectedItems: Array<{
            id: string;
            label: string;
            plannedStartMin: number;
            projectedStartMin: number;
            delayMin: number;
            fixed: boolean;
            hasConflict?: boolean;
          }>;
          slackConsumedMin: number;
          hasFixedConflict: boolean;
          conflictDescription?: string;
        };
        options: Array<{
          id: string;
          rank: number;
          title: string;
          strategy: 'shift' | 'swap' | 'shorten' | 'extend_filler' | 'cancel_optional';
          plainImpact: string;
          fixedConflictsCount: number;
          guestVisibleChangesCount: number;
          totalMinutesMoved: number;
          score: number;
          operations: unknown[];
        }>;
        clarifyingQuestion?: string;
      }>(
        `/api/v1/events/${id}/schedule/disruptions`,
        {
          method: 'POST',
          body: JSON.stringify({ text }),
        },
        token,
      ),

    applyFix: (id: string, fixOption: unknown, token: string) =>
      request<{
        applied: boolean;
        updatedSchedule: Array<Record<string, unknown>>;
        stagedNotifications: Array<Record<string, unknown>>;
      }>(
        `/api/v1/events/${id}/schedule/fix/apply`,
        {
          method: 'POST',
          body: JSON.stringify({ fixOption }),
        },
        token,
      ),
  },

  notifications: {
    list: (id: string, token: string) =>
      request<{
        notifications: Array<{
          id: string;
          recipientName: string;
          recipientPhone?: string | null;
          channel: 'sms' | 'whatsapp';
          message: string;
          status: 'queued' | 'sent' | 'failed';
          idempotencyKey?: string;
          createdAt: string;
        }>;
      }>(`/api/v1/events/${id}/notifications`, { method: 'GET' }, token),

    send: (id: string, notificationId: string, token: string) =>
      request<{ notification: Record<string, unknown> }>(
        `/api/v1/events/${id}/notifications/send`,
        {
          method: 'POST',
          body: JSON.stringify({ notificationId }),
        },
        token,
      ),
  },

  sse: {
    createStream: (
      eventId: string,
      token: string,
      onEvent: (event: { type: string; payload: unknown; timestamp: string }) => void,
      onError?: (err: Event) => void,
    ) => {
      const url = buildApiUrl(
        `/api/v1/events/${eventId}/stream?token=${encodeURIComponent(token)}`,
      );
      const eventSource = new EventSource(url);

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as {
            type: string;
            payload: unknown;
            timestamp: string;
          };
          onEvent(data);
        } catch {
          // Ignore heartbeats or non-JSON comments
        }
      };

      if (onError) {
        eventSource.onerror = onError;
      }

      return () => {
        eventSource.close();
      };
    },
  },
};
