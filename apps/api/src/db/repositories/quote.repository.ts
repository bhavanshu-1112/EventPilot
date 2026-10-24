import type { DbClient } from '../client.js';
import type { QuoteRow, QuoteLineItemRow, QuoteFlagRow, QuoteStatus } from '../schema.js';

export interface CreateQuoteInput {
  id?: string;
  vendorId?: string | null;
  vendorName: string;
  category: string;
  currency?: string;
  statedTotalMinor?: number | null;
  status?: QuoteStatus;
  validUntil?: string | null;
  paymentTerms?: string | null;
  cancellationTerms?: string | null;
  confidence?: number;
  rawStoragePath?: string | null;
  contentHash?: string | null;
  lineItems?: Array<{
    id?: string;
    description: string;
    quantity: number;
    unit: string;
    unitPriceMinor: number;
    totalMinor: number;
    taxIncluded: boolean;
    notes?: string | null;
    sourceRef?: string | null;
  }>;
  flags?: Array<{
    id?: string;
    ruleId: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    explanation: string;
    sourceRef?: string | null;
    source?: 'deterministic' | 'llm';
  }>;
}

export interface QuoteWithDetails extends QuoteRow {
  line_items: QuoteLineItemRow[];
  flags: QuoteFlagRow[];
}

async function insertLineItems(
  trx: DbClient,
  quoteId: string,
  items?: CreateQuoteInput['lineItems'],
): Promise<QuoteLineItemRow[]> {
  if (!items || items.length === 0) return [];
  return trx
    .insertInto('quote_line_items')
    .values(
      items.map((li) => ({
        id: li.id ?? crypto.randomUUID(),
        quote_id: quoteId,
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        unit_price_minor: li.unitPriceMinor,
        total_minor: li.totalMinor,
        tax_included: li.taxIncluded,
        notes: li.notes ?? null,
        source_ref: li.sourceRef ?? null,
      })),
    )
    .returningAll()
    .execute();
}

async function insertFlags(
  trx: DbClient,
  quoteId: string,
  flags?: CreateQuoteInput['flags'],
): Promise<QuoteFlagRow[]> {
  if (!flags || flags.length === 0) return [];
  return trx
    .insertInto('quote_flags')
    .values(
      flags.map((fl) => ({
        id: fl.id ?? crypto.randomUUID(),
        quote_id: quoteId,
        rule_id: fl.ruleId,
        severity: fl.severity,
        message: fl.message,
        explanation: fl.explanation,
        source_ref: fl.sourceRef ?? null,
        source: fl.source ?? 'deterministic',
      })),
    )
    .returningAll()
    .execute();
}

function buildQuoteRow(eventId: string, quoteId: string, input: CreateQuoteInput) {
  const merged = {
    vendorId: null as string | null,
    currency: 'INR',
    statedTotalMinor: null as number | null,
    status: 'extracted' as QuoteStatus,
    validUntil: null as string | null,
    paymentTerms: null as string | null,
    cancellationTerms: null as string | null,
    confidence: 1.0,
    rawStoragePath: null as string | null,
    contentHash: null as string | null,
    ...input,
  };

  return {
    id: quoteId,
    event_id: eventId,
    vendor_id: merged.vendorId,
    vendor_name: input.vendorName,
    category: input.category,
    currency: merged.currency,
    stated_total_minor: merged.statedTotalMinor,
    status: merged.status,
    valid_until: merged.validUntil,
    payment_terms: merged.paymentTerms,
    cancellation_terms: merged.cancellationTerms,
    confidence: merged.confidence,
    raw_storage_path: merged.rawStoragePath,
    content_hash: merged.contentHash,
  };
}

export class QuoteRepository {
  constructor(private readonly db: DbClient) {}

  async create(eventId: string, input: CreateQuoteInput): Promise<QuoteWithDetails> {
    return this.db.transaction().execute(async (trx) => {
      const quoteId = input.id ? input.id : crypto.randomUUID();
      const row = buildQuoteRow(eventId, quoteId, input);

      const quote = await trx
        .insertInto('quotes')
        .values(row)
        .returningAll()
        .executeTakeFirstOrThrow();

      const lineItems = await insertLineItems(trx as unknown as DbClient, quoteId, input.lineItems);
      const flags = await insertFlags(trx as unknown as DbClient, quoteId, input.flags);

      return {
        ...quote,
        line_items: lineItems,
        flags,
      };
    });
  }

  async getQuotes(eventId: string, category?: string): Promise<QuoteWithDetails[]> {
    let query = this.db.selectFrom('quotes').selectAll().where('event_id', '=', eventId);

    if (category) {
      query = query.where('category', '=', category);
    }

    const quotes = await query.orderBy('created_at', 'desc').execute();
    if (quotes.length === 0) return [];

    const quoteIds = quotes.map((q) => q.id);

    const [lineItems, flags] = await Promise.all([
      this.db
        .selectFrom('quote_line_items')
        .selectAll()
        .where('quote_id', 'in', quoteIds)
        .execute(),
      this.db.selectFrom('quote_flags').selectAll().where('quote_id', 'in', quoteIds).execute(),
    ]);

    const itemMap = new Map<string, QuoteLineItemRow[]>();
    for (const item of lineItems) {
      const arr = itemMap.get(item.quote_id) ?? [];
      arr.push(item);
      itemMap.set(item.quote_id, arr);
    }

    const flagMap = new Map<string, QuoteFlagRow[]>();
    for (const flag of flags) {
      const arr = flagMap.get(flag.quote_id) ?? [];
      arr.push(flag);
      flagMap.set(flag.quote_id, arr);
    }

    return quotes.map((q) => ({
      ...q,
      line_items: itemMap.get(q.id) ?? [],
      flags: flagMap.get(q.id) ?? [],
    }));
  }

  async getById(eventId: string, quoteId: string): Promise<QuoteWithDetails | undefined> {
    const quote = await this.db
      .selectFrom('quotes')
      .selectAll()
      .where('event_id', '=', eventId)
      .where('id', '=', quoteId)
      .executeTakeFirst();

    if (!quote) return undefined;

    const [lineItems, flags] = await Promise.all([
      this.db.selectFrom('quote_line_items').selectAll().where('quote_id', '=', quoteId).execute(),
      this.db.selectFrom('quote_flags').selectAll().where('quote_id', '=', quoteId).execute(),
    ]);

    return {
      ...quote,
      line_items: lineItems,
      flags,
    };
  }

  async updateStatus(eventId: string, quoteId: string, status: QuoteStatus): Promise<boolean> {
    const result = await this.db
      .updateTable('quotes')
      .set({
        status,
        updated_at: new Date(),
      })
      .where('event_id', '=', eventId)
      .where('id', '=', quoteId)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  }
}
