import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import path from 'node:path';
import { z } from 'zod';
import {
  extractQuoteSchema,
  draftNegotiationSchema,
  type ExtractedQuote,
  type ExtractQuotePayload,
} from '@eventpilot/shared';
import { flagQuote, type FlagContext } from '@eventpilot/engines';
import { QuoteRepository } from '../db/repositories/quote.repository.js';
import { BudgetRepository } from '../db/repositories/budget.repository.js';
import { createAuthHook, getAuthEvent } from '../auth/middleware.js';
import { processUpload } from '../uploads/validator.js';
import { extractTextFromPdf } from '../uploads/pdf-extractor.js';
import { wrapUntrustedData } from '../llm/injection-defense.js';
import { createLlmClient } from '../llm/client-factory.js';
import type { LlmClient } from '../llm/types.js';
import { computeAllInQuoteTotal, loadTaxConfig } from '../services/tax.service.js';
import type { DbClient } from '../db/client.js';

const DraftInputSchema = z.object({
  tone: z.enum(['email', 'whatsapp']).default('email'),
  instructions: z.string().optional(),
});

interface UploadHandlerParams {
  request: FastifyRequest;
  reply: FastifyReply;
  quoteRepo: QuoteRepository;
  llmClient: LlmClient;
  targetDir: string;
}

async function extractAndFlagQuote(
  buffer: Buffer,
  contentHash: string,
  eventId: string,
  guestCount: number,
  llmClient: LlmClient,
) {
  let text = '';
  try {
    const pdfText = await extractTextFromPdf(buffer);
    text = pdfText.text;
  } catch {
    text = buffer.toString('latin1');
  }
  const prompt = wrapUntrustedData(text);

  const llmRes = await llmClient.callTool<ExtractQuotePayload>({
    systemPrompt:
      'You are an expert event planning and catering procurement assistant. Extract all quote line items, inclusions, exclusions, and fees precisely.',
    userPrompt: prompt,
    tool: {
      name: 'extract_quote',
      description: 'Extract quote line items and fees',
      schema: extractQuoteSchema,
    },
    purpose: 'extract_quote',
    eventId,
    contentHash,
  });

  const extracted = llmRes.data;
  const taxConfig = loadTaxConfig();
  const context: FlagContext = {
    taxConfig,
    guestCount,
    quoteId: contentHash.slice(0, 8),
    nowMs: Date.now(),
  };

  const domainQuote: ExtractedQuote = {
    vendorName: extracted.vendorName,
    category: extracted.category,
    currency: extracted.currency,
    lineItems: extracted.lineItems.map((li, idx) => ({
      id: `item-${String(idx + 1)}`,
      description: li.description,
      quantity: li.quantity,
      unit: li.unit,
      unitPriceMinor: li.unitPriceMinor,
      totalMinor: li.totalMinor,
      taxIncluded: li.taxIncluded,
      notes: li.notes,
      sourceRef: li.sourceRef,
    })),
    inclusions: extracted.inclusions,
    exclusions: extracted.exclusions,
    fees: extracted.fees,
    validUntil: extracted.validUntil,
    paymentTerms: extracted.paymentTerms,
    cancellationTerms: extracted.cancellationTerms,
    statedTotalMinor: extracted.statedTotalMinor,
    confidence: extracted.confidence,
  };

  const flags = flagQuote(domainQuote, context);
  return { extracted, flags };
}

async function handleQuoteUpload(params: UploadHandlerParams): Promise<void> {
  const { request, reply, quoteRepo, llmClient, targetDir } = params;
  const { eventId, event } = getAuthEvent(request);

  if (!request.isMultipart()) {
    return reply.status(400).send({
      error: {
        code: 'BAD_REQUEST',
        message: 'Request must be multipart/form-data with a file',
        requestId: request.id,
      },
    });
  }

  const data = await request.file();
  if (!data) {
    return reply.status(400).send({
      error: { code: 'VALIDATION_ERROR', message: 'No file uploaded', requestId: request.id },
    });
  }

  try {
    const buffer = await data.toBuffer();
    const verified = await processUpload({
      originalFilename: data.filename,
      buffer,
      targetDir,
      category: 'document',
    });

    const { extracted, flags } = await extractAndFlagQuote(
      buffer,
      verified.contentHash,
      eventId,
      event.guest_count,
      llmClient,
    );

    const quote = await quoteRepo.create(eventId, {
      vendorName: extracted.vendorName,
      category: extracted.category,
      currency: extracted.currency,
      statedTotalMinor: extracted.statedTotalMinor,
      status: 'extracted',
      validUntil: extracted.validUntil,
      paymentTerms: extracted.paymentTerms,
      cancellationTerms: extracted.cancellationTerms,
      confidence: extracted.confidence,
      rawStoragePath: verified.storagePath,
      contentHash: verified.contentHash,
      lineItems: extracted.lineItems,
      flags: flags.map((f) => ({
        ruleId: f.ruleId,
        severity: f.severity,
        message: f.message,
        explanation: f.explanation,
        sourceRef: f.sourceRef,
        source: f.source,
      })),
    });

    return reply.status(201).send({
      quote: {
        id: quote.id,
        vendorName: quote.vendor_name,
        category: quote.category,
        currency: quote.currency,
        statedTotalMinor: quote.stated_total_minor ? Number(quote.stated_total_minor) : null,
        status: quote.status,
        confidence: quote.confidence,
        contentHash: quote.content_hash,
        lineItemsCount: quote.line_items.length,
        flagsCount: quote.flags.length,
      },
      lineItems: quote.line_items,
      flags: quote.flags,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload processing failed';
    return reply.status(400).send({
      error: { code: 'UPLOAD_REJECTED', message, requestId: request.id },
    });
  }
}

async function handleCompare(
  request: FastifyRequest,
  reply: FastifyReply,
  quoteRepo: QuoteRepository,
) {
  const query = request.query as { category?: string } | undefined;
  const { eventId } = getAuthEvent(request);
  const quotes = await quoteRepo.getQuotes(eventId, query?.category);

  let cheapestQuoteId: string | null = null;
  let lowestAllIn = Infinity;
  let highestConfidenceQuoteId: string | null = null;
  let highestConfidence = -1;

  const comparison = quotes.map((q) => {
    const calculation = computeAllInQuoteTotal(q.category, q.line_items, q.flags);
    if (calculation.allInTotalMinor < lowestAllIn) {
      lowestAllIn = calculation.allInTotalMinor;
      cheapestQuoteId = q.id;
    }
    if (q.confidence > highestConfidence) {
      highestConfidence = q.confidence;
      highestConfidenceQuoteId = q.id;
    }

    return {
      id: q.id,
      vendorName: q.vendor_name,
      category: q.category,
      currency: q.currency,
      statedTotalMinor: q.stated_total_minor ? Number(q.stated_total_minor) : null,
      baseSubtotalMinor: calculation.baseSubtotalMinor,
      estimatedGstMinor: calculation.estimatedGstMinor,
      estimatedServiceChargeMinor: calculation.estimatedServiceChargeMinor,
      allInTotalMinor: calculation.allInTotalMinor,
      assumptions: calculation.assumptions,
      status: q.status,
      confidence: q.confidence,
      flagsCount: q.flags.length,
      flags: q.flags,
      lineItems: q.line_items,
    };
  });

  return reply.send({
    category: query?.category ?? 'all',
    quotesCount: comparison.length,
    cheapestQuoteId,
    highestConfidenceQuoteId,
    quotes: comparison,
  });
}

async function handleNegotiation(
  request: FastifyRequest,
  reply: FastifyReply,
  quoteRepo: QuoteRepository,
  llmClient: LlmClient,
) {
  const { eventId } = getAuthEvent(request);
  const { quoteId } = request.params as { quoteId: string };
  const quote = await quoteRepo.getById(eventId, quoteId);
  if (!quote) {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Quote not found for this event.',
        requestId: request.id,
      },
    });
  }

  const parsed = DraftInputSchema.safeParse(request.body ?? {});
  const tone = parsed.success ? parsed.data.tone : 'email';

  const userPrompt = `
Generate a ${tone} negotiation draft for vendor: ${quote.vendor_name}.
Line items: ${quote.line_items.map((li) => `${li.description} (${String(li.quantity)} ${li.unit}): ${String(li.total_minor)}`).join('; ')}
Flags: ${quote.flags.map((f) => `${f.rule_id}: ${f.message}`).join('; ')}
Instructions: ${parsed.success && parsed.data.instructions ? parsed.data.instructions : 'Ask for an all-inclusive package rate.'}
  `.trim();

  const llmRes = await llmClient.callTool({
    systemPrompt:
      'You draft concise, respectful negotiation correspondence for celebration catering and event services.',
    userPrompt,
    tool: {
      name: 'draft_negotiation',
      description: 'Draft a polite negotiation message',
      schema: draftNegotiationSchema,
    },
    purpose: 'draft_negotiation',
    eventId,
  });

  return reply.send({
    quoteId,
    tone,
    draft: llmRes.data,
  });
}

async function handleBook(
  request: FastifyRequest,
  reply: FastifyReply,
  quoteRepo: QuoteRepository,
  budgetRepo: BudgetRepository,
) {
  const { eventId } = getAuthEvent(request);
  const { quoteId } = request.params as { quoteId: string };
  const quote = await quoteRepo.getById(eventId, quoteId);
  if (!quote) {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Quote not found for this event.',
        requestId: request.id,
      },
    });
  }

  const categories = await budgetRepo.getCategories(eventId);
  const category = categories.find((c) => c.category_id === quote.category);
  const quoteTotalMinor = Number(
    quote.stated_total_minor ?? quote.line_items.reduce((s, li) => s + Number(li.total_minor), 0),
  );
  const allocatedMinor = category ? Number(category.allocated_minor) : 0;

  if (quoteTotalMinor > allocatedMinor) {
    const overrunMinor = quoteTotalMinor - allocatedMinor;
    return reply.send({
      booked: false,
      needsRebalance: true,
      overrunMinor,
      categoryId: quote.category,
      allocatedMinor,
      quoteTotalMinor,
      quoteId,
    });
  }

  await quoteRepo.updateStatus(eventId, quoteId, 'booked');
  return reply.send({
    booked: true,
    needsRebalance: false,
    quoteId,
    quoteTotalMinor,
  });
}

export function createQuotesRoutes(
  db: DbClient,
  customLlmClient?: LlmClient,
  uploadDir?: string,
): FastifyPluginAsync {
  const quoteRepo = new QuoteRepository(db);
  const budgetRepo = new BudgetRepository(db);
  const requireAuth = createAuthHook(db);
  const llmClient = customLlmClient ?? createLlmClient({ db });
  const targetDir = uploadDir ?? path.resolve(process.cwd(), 'uploads', 'quotes');

  return async function (app: FastifyInstance): Promise<void> {
    app.post('/api/v1/events/:id/quotes', { preHandler: [requireAuth] }, async (req, rep) =>
      handleQuoteUpload({ request: req, reply: rep, quoteRepo, llmClient, targetDir }),
    );

    app.get('/api/v1/events/:id/quotes/compare', { preHandler: [requireAuth] }, async (req, rep) =>
      handleCompare(req, rep, quoteRepo),
    );

    app.post(
      '/api/v1/events/:id/quotes/:quoteId/negotiation-draft',
      { preHandler: [requireAuth] },
      async (req, rep) => handleNegotiation(req, rep, quoteRepo, llmClient),
    );

    app.post(
      '/api/v1/events/:id/quotes/:quoteId/book',
      { preHandler: [requireAuth] },
      async (req, rep) => handleBook(req, rep, quoteRepo, budgetRepo),
    );
  };
}
