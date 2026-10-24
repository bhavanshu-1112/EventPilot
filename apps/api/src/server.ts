import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { parseEnv, type Env } from './config/env.js';
import { registerHealthRoutes } from './routes/health.js';
import { createEventsRoutes } from './routes/events.js';
import { createBudgetRoutes } from './routes/budget.js';
import { createScheduleRoutes } from './routes/schedule.js';
import { createChecklistRoutes } from './routes/checklist.js';
import { createQuotesRoutes } from './routes/quotes.js';
import { createInspirationRoutes } from './routes/inspiration.js';
import { createNotificationsRoutes } from './routes/notifications.js';
import { createIdeasRoutes } from './routes/ideas.js';
import { createDbClient, type DbClient } from './db/client.js';
import { createLlmClient } from './llm/client-factory.js';
import type { LlmClient } from './llm/types.js';

export interface BuildAppOptions {
  rawEnv?: Record<string, string | undefined>;
  db?: DbClient;
  uploadDir?: string;
  llmClient?: LlmClient;
}

/**
 * Build and configure the Fastify application.
 * Separated from listen() for testability.
 */
export async function buildApp(
  options: BuildAppOptions | Record<string, string | undefined> = {},
): Promise<FastifyInstance> {
  const isEnvObject = 'DATABASE_URL' in options;
  const rawEnv = isEnvObject
    ? (options as Record<string, string | undefined>)
    : ((options as BuildAppOptions).rawEnv ?? process.env);
  const dbClient = !isEnvObject ? (options as BuildAppOptions).db : undefined;
  const uploadDir = !isEnvObject ? (options as BuildAppOptions).uploadDir : undefined;
  const customLlm = !isEnvObject ? (options as BuildAppOptions).llmClient : undefined;
  const env = parseEnv(rawEnv);

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          '*.password',
          '*.token',
          '*.apiKey',
          '*.phone',
          '*.email',
        ],
        censor: '[REDACTED]',
      },
    },
    genReqId: () => crypto.randomUUID(),
  });

  // ── Security plugins ────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB limit
      files: 5,
    },
  });

  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        const params = new URLSearchParams(typeof body === 'string' ? body : String(body));
        const result: Record<string, string> = {};
        for (const [key, value] of params.entries()) {
          result[key] = value;
        }
        done(null, result);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // ── Database client ─────────────────────────────────────────────────
  const db = dbClient ?? createDbClient({ connectionString: env.DATABASE_URL });
  app.decorate('db', db);
  app.decorate('env', env);

  // ── Error handler ───────────────────────────────────────────────────
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = request.id;

    if (error.name === 'AppError' && 'code' in error && 'httpStatus' in error) {
      const appErr = error as unknown as {
        code: string;
        httpStatus: number;
        safeMessage: string;
      };
      request.log.warn({ err: error, requestId }, 'Application error');
      return reply.status(appErr.httpStatus).send({
        error: {
          code: appErr.code,
          message: appErr.safeMessage,
          requestId,
        },
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          requestId,
        },
      });
    }

    request.log.error({ err: error, requestId }, 'Unhandled error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please try again.',
        requestId,
      },
    });
  });

  // ── Register Routes ──────────────────────────────────────────────────
  const llmClient =
    customLlm ??
    createLlmClient({
      db,
      mode: (env.LLM_MODE as 'live' | 'fixture' | 'null') || 'fixture',
    });

  await registerHealthRoutes(app);
  await app.register(createEventsRoutes(db, llmClient));
  await app.register(createBudgetRoutes(db, llmClient));
  await app.register(createScheduleRoutes(db, llmClient));
  await app.register(createChecklistRoutes(db));
  await app.register(createQuotesRoutes(db, llmClient, uploadDir));
  await app.register(createInspirationRoutes(db, llmClient, uploadDir));
  await app.register(createIdeasRoutes(db, llmClient));
  await app.register(createNotificationsRoutes(db, env));

  return app;
}

/**
 * Start the server. Only called from the CLI entry point, never in tests.
 */
async function start(): Promise<void> {
  try {
    const envCandidates = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '../../.env'),
    ];
    for (const envPath of envCandidates) {
      if (fs.existsSync(envPath)) {
        try {
          process.loadEnvFile(envPath);
          break;
        } catch {
          // ignore
        }
      }
    }

    const app = await buildApp();
    const env = app.env;

    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`EventPilot API running on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isMain) {
  start();
}

declare module 'fastify' {
  interface FastifyInstance {
    env: Env;
    db: DbClient;
  }
}
