/**
 * Event authentication and IDOR protection middleware.
 * Verifies Bearer access token against stored SHA-256 hash
 * and enforces strict event scoping across all routes.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { hashEventToken } from './tokens.js';
import { EventRepository } from '../db/repositories/event.repository.js';
import type { EventRow } from '../db/schema.js';
import type { DbClient } from '../db/client.js';

declare module 'fastify' {
  interface FastifyRequest {
    event?: EventRow;
    eventId?: string;
  }
}

export function createAuthHook(db: DbClient) {
  const eventRepo = new EventRepository(db);

  return async function requireEventAuth(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid Authorization header. Expected Bearer token.',
          requestId: request.id,
        },
      });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Empty access token.',
          requestId: request.id,
        },
      });
    }

    const tokenHash = hashEventToken(token);
    const event = await eventRepo.findByTokenHash(tokenHash);

    if (!event) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or revoked event access token.',
          requestId: request.id,
        },
      });
    }

    // IDOR Protection: If route has an :id param, it MUST match the authenticated event ID
    const params = request.params as { id?: string } | undefined;
    if (params?.id && params.id !== event.id) {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: Token does not belong to the requested event resource.',
          requestId: request.id,
        },
      });
    }

    request.event = event;
    request.eventId = event.id;
  };
}

export function getAuthEvent(request: FastifyRequest): { event: EventRow; eventId: string } {
  if (!request.event || !request.eventId) {
    throw new Error('Unauthenticated event request');
  }
  return { event: request.event, eventId: request.eventId };
}

export async function authenticateToken(
  db: DbClient,
  token: string,
): Promise<EventRow | undefined> {
  const eventRepo = new EventRepository(db);
  const tokenHash = hashEventToken(token);
  return eventRepo.findByTokenHash(tokenHash);
}
