import type { FastifyReply } from 'fastify';

export type LiveEventType =
  'schedule_updated' | 'disruption_reported' | 'fix_applied' | 'notification_sent' | 'heartbeat';

export interface LiveEventMessage {
  eventId: string;
  type: LiveEventType;
  data: unknown;
  timestamp: string;
}

export class LiveStateService {
  private readonly clients = new Map<string, Set<FastifyReply>>();

  /**
   * Register a new client SSE connection for a specific event.
   */
  registerClient(eventId: string, reply: FastifyReply): () => void {
    const rawResponse = reply.raw;
    rawResponse.setHeader('Content-Type', 'text/event-stream');
    rawResponse.setHeader('Cache-Control', 'no-cache, no-transform');
    rawResponse.setHeader('Connection', 'keep-alive');
    rawResponse.setHeader('X-Accel-Buffering', 'no');

    let eventClients = this.clients.get(eventId);
    if (!eventClients) {
      eventClients = new Set();
      this.clients.set(eventId, eventClients);
    }

    eventClients.add(reply);

    // Initial connection ack
    const initialMsg: LiveEventMessage = {
      eventId,
      type: 'heartbeat',
      data: { connected: true },
      timestamp: new Date().toISOString(),
    };
    rawResponse.write(`event: ${initialMsg.type}\ndata: ${JSON.stringify(initialMsg)}\n\n`);

    const cleanup = (): void => {
      eventClients.delete(reply);
      if (eventClients.size === 0) {
        this.clients.delete(eventId);
      }
    };

    reply.raw.on('close', cleanup);
    return cleanup;
  }

  /**
   * Broadcast an event to all connected SSE clients for a given eventId.
   */
  broadcast(eventId: string, type: LiveEventType, data: unknown): void {
    const eventClients = this.clients.get(eventId);
    if (!eventClients || eventClients.size === 0) return;

    const message: LiveEventMessage = {
      eventId,
      type,
      data,
      timestamp: new Date().toISOString(),
    };

    const sseChunk = `event: ${type}\ndata: ${JSON.stringify(message)}\n\n`;

    for (const client of eventClients) {
      try {
        client.raw.write(sseChunk);
      } catch {
        eventClients.delete(client);
      }
    }
  }

  /**
   * Get active subscriber count for an event (useful for metrics and testing).
   */
  getSubscriberCount(eventId: string): number {
    return this.clients.get(eventId)?.size ?? 0;
  }
}

export const liveStateService = new LiveStateService();
