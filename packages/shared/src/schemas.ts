import { z } from 'zod';

/**
 * Zod Schemas for EventPilot LLM Tool Use and API validation.
 * Every schema field is annotated with .describe() for JSON schema generation.
 */

// ── Quote Extraction Schemas ──────────────────────────────────────────────

export const quoteLineItemSchema = z.object({
  description: z.string().describe('Itemized service or product description'),
  quantity: z.number().positive().describe('Quantity of items or guests'),
  unit: z.string().describe('Unit of measurement (e.g., per guest, setup, per hour)'),
  unitPriceMinor: z
    .number()
    .int()
    .nonnegative()
    .describe('Unit price in minor currency units (paise/cents)'),
  totalMinor: z
    .number()
    .int()
    .nonnegative()
    .describe('Total price for this line item in minor units'),
  taxIncluded: z.boolean().describe('Whether tax (e.g. GST) is included in this line item price'),
  notes: z.string().optional().describe('Special conditions, chef notes, or dietary remarks'),
  sourceRef: z
    .string()
    .optional()
    .describe('Citation/page reference from the source quote document'),
});

export const quoteFeeSchema = z.object({
  type: z.string().describe('Type of fee (e.g., overtime, corkage, setup/teardown, deposit)'),
  amountMinor: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Fixed fee amount in minor units'),
  percent: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Percentage fee expressed as decimal (0.18 = 18%)'),
  basis: z.string().optional().describe('Basis of percentage (e.g. total, subtotal, per hour)'),
  sourceRef: z
    .string()
    .optional()
    .describe('Citation/page reference from the source quote document'),
});

export const extractQuoteSchema = z.object({
  vendorName: z.string().describe('Official commercial name of the vendor or agency'),
  category: z.string().describe('Event budget category (e.g. catering, venue, decor, photography)'),
  currency: z.string().default('INR').describe('ISO 4217 currency code (default: INR)'),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Quote validity expiration date in YYYY-MM-DD format'),
  statedTotalMinor: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Total quoted amount explicitly written on document in minor units'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence score between 0.0 and 1.0 based on clarity of document'),
  lineItems: z
    .array(quoteLineItemSchema)
    .min(1)
    .describe('Itemized list of billable goods and services'),
  fees: z
    .array(quoteFeeSchema)
    .default([])
    .describe('Additional fees, surcharges, overtime rates, or deposits'),
  inclusions: z
    .array(z.string())
    .default([])
    .describe('Items, staff, or equipment explicitly included in the quote'),
  exclusions: z
    .array(z.string())
    .default([])
    .describe('Items, permits, or taxes explicitly excluded from the quote'),
  paymentTerms: z.string().optional().describe('Payment schedule, advances, and milestones'),
  cancellationTerms: z
    .string()
    .optional()
    .describe('Refundability, cancellation penalties, and timelines'),
});

export type ExtractQuotePayload = z.infer<typeof extractQuoteSchema>;

// ── Negotiation Draft Schemas ─────────────────────────────────────────────

export const draftNegotiationSchema = z.object({
  subject: z.string().optional().describe('Email subject line for negotiation'),
  body: z
    .string()
    .describe('Polite, professional negotiation message citing exact line items and flags'),
  citedLineItemIds: z
    .array(z.string())
    .default([])
    .describe('Identifiers or descriptions of line items referenced in the message'),
});

export type DraftNegotiationPayload = z.infer<typeof draftNegotiationSchema>;

// ── Budget Rebalance Proposal Schemas ─────────────────────────────────────

export const rebalanceCutProposalSchema = z.object({
  categoryId: z.string().describe('Budget category identifier being reduced'),
  reduceByMinor: z.number().int().positive().describe('Amount to reduce in minor units'),
  reason: z.string().describe('Clear rationale for why this cut is feasible'),
  impact: z.string().describe('Expected trade-off or visual/experiential impact of the reduction'),
});

export const proposeRebalanceSchema = z.object({
  cuts: z
    .array(rebalanceCutProposalSchema)
    .min(1)
    .describe('Itemized category reductions that sum to the overrun'),
  summary: z.string().describe('High-level executive summary of the rebalance strategy'),
});

export type ProposeRebalancePayload = z.infer<typeof proposeRebalanceSchema>;

// ── Brief Parsing Schemas ─────────────────────────────────────────────────

export const ceremonyBriefSchema = z.object({
  name: z.string().describe('Name of the ceremony (e.g. Mehendi, Sangeet, Reception)'),
  date: z.string().optional().describe('Date of ceremony in YYYY-MM-DD format'),
  guestCount: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Expected guest count for this sub-event'),
  venue: z.string().optional().describe('Venue or setting style for this ceremony'),
  budgetShare: z.number().min(0).max(1).optional().describe('Fractional budget share (0-1)'),
});

export const parseBriefSchema = z.object({
  eventType: z.enum(['wedding', 'birthday', 'community']).describe('Type of celebration'),
  dates: z.array(z.string()).min(1).describe('Event dates in YYYY-MM-DD format'),
  city: z.string().describe('Host city or region'),
  guestCount: z.number().int().positive().describe('Total expected attendee count'),
  budgetMinor: z
    .number()
    .int()
    .positive()
    .describe('Target budget in minor currency units (paise)'),
  currency: z.string().default('INR').describe('Currency ISO code'),
  vibe: z.array(z.string()).describe('Atmosphere tags (e.g. royal, bohemian, intimate, energetic)'),
  mustHaves: z.array(z.string()).describe('Non-negotiable priorities or features'),
  dietary: z.array(z.string()).describe('Dietary restrictions and catering preferences'),
  accessibility: z
    .array(z.string())
    .describe('Accessibility requirements (e.g. wheelchair, elderly seating)'),
  languages: z.array(z.string()).describe('Spoken languages or cultural traditions'),
  ceremonies: z
    .array(ceremonyBriefSchema)
    .default([])
    .describe('Sub-events or multi-day ceremonies'),
});

export type ParseBriefPayload = z.infer<typeof parseBriefSchema>;

// ── Disruption Parsing Schemas ───────────────────────────────────────────

export const parseDisruptionSchema = z.object({
  itemId: z
    .string()
    .optional()
    .describe('ID or key phrase of the schedule item that is delayed or disrupted'),
  vendorId: z.string().optional().describe('ID or name of the vendor associated with the delay'),
  delayMin: z.number().int().describe('Delay magnitude in minutes (positive for delay)'),
  reason: z.string().describe('Explanation or cause of the schedule disruption'),
  needsClarification: z
    .boolean()
    .default(false)
    .describe('Whether the voice/text input was ambiguous and needs organizer input'),
  clarifyingQuestion: z
    .string()
    .optional()
    .nullable()
    .describe('Specific clarifying question to prompt the user if input was ambiguous'),
});

export type ParseDisruptionPayload = z.infer<typeof parseDisruptionSchema>;

// ── Schedule Fix Proposal Schemas ────────────────────────────────────────

export const scheduleFixOperationSchema = z.object({
  op: z
    .enum(['shift', 'swap', 'shorten', 'extend_filler', 'cancel_optional'])
    .describe('Type of schedule adjustment operation'),
  itemId: z.string().describe('ID of the schedule item to adjust'),
  minutes: z.number().int().optional().describe('Minutes to shift or adjust duration'),
  swapWithId: z.string().optional().describe('ID of the schedule item to swap time slots with'),
});

export type ScheduleFixOperationPayload = z.infer<typeof scheduleFixOperationSchema>;

export const scheduleFixOptionSchema = z.object({
  label: z.string().describe('Clear human-readable summary of this proposed fix option'),
  operations: z
    .array(scheduleFixOperationSchema)
    .min(1)
    .describe('Ordered sequence of operations to apply this fix'),
  rationale: z.string().describe('Trade-off explanation and impact analysis of this fix option'),
});

export type ScheduleFixOptionPayload = z.infer<typeof scheduleFixOptionSchema>;

export const proposeScheduleFixesSchema = z.object({
  options: z
    .array(scheduleFixOptionSchema)
    .min(1)
    .describe('Candidate fix options proposing schedule adjustments'),
});

export type ProposeScheduleFixesPayload = z.infer<typeof proposeScheduleFixesSchema>;

// ── Notification Drafting Schemas ────────────────────────────────────────

export const draftNotificationMessageSchema = z.object({
  contactId: z.string().optional().describe('Contact ID of the recipient from contacts table'),
  recipient: z.string().describe('Phone number or email address of the recipient'),
  recipientName: z.string().optional().describe('Name of the recipient contact or vendor'),
  channel: z
    .enum(['sms', 'whatsapp', 'email'])
    .describe('Communication channel for this notification'),
  body: z
    .string()
    .describe('Actionable notification message body alerting recipient to schedule changes'),
});

export type DraftNotificationMessagePayload = z.infer<typeof draftNotificationMessageSchema>;

export const draftNotificationsSchema = z.object({
  messages: z
    .array(draftNotificationMessageSchema)
    .describe('List of broadcast alerts tailored to affected parties'),
});

export type DraftNotificationsPayload = z.infer<typeof draftNotificationsSchema>;

// ── Inspiration Vision & BOM Schemas ─────────────────────────────────────

export const inspirationBomItemSchema = z.object({
  catalogKey: z
    .string()
    .describe('Price catalog key (e.g. venue.heritage_palace_lawn, decor.mandap_floral_royal)'),
  category: z
    .string()
    .describe('Budget category (venue, catering, decor, photography, entertainment, logistics)'),
  label: z.string().describe('Item description and styling title'),
  quantity: z
    .number()
    .positive()
    .describe('Scaled quantity required for guest count and ceremonies'),
  rationale: z.string().describe('Design justification linking item to visual inspiration theme'),
});

export type InspirationBomItemPayload = z.infer<typeof inspirationBomItemSchema>;

export const analyzeInspirationSchema = z.object({
  theme: z.string().describe('Overarching aesthetic theme title'),
  paletteHex: z
    .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
    .min(3)
    .describe('Hex color codes defining the primary visual palette'),
  styleTags: z
    .array(z.string())
    .describe('Stylistic keywords e.g. royal, heritage, minimalist, vibrant'),
  bom: z
    .array(inspirationBomItemSchema)
    .min(1)
    .describe('Itemized bill of materials required to realize this visual theme'),
});

export type AnalyzeInspirationPayload = z.infer<typeof analyzeInspirationSchema>;

// ── Ideas Schemas ────────────────────────────────────────────────────────

export const ideaSchema = z.object({
  title: z.string().describe('Creative, personalized concept title'),
  description: z.string().describe('Detailed execution proposal fitting the event profile'),
  category: z.string().describe('Budget category associated with this idea'),
  estCostMinor: z
    .number()
    .int()
    .positive()
    .describe('Estimated cost in minor currency units (paise)'),
  whyItFits: z.string().describe('Specific cultural, stylistic, or personal fit for this event'),
});

export type IdeaPayload = z.infer<typeof ideaSchema>;

export const generateIdeasSchema = z.object({
  ideas: z
    .array(ideaSchema)
    .min(3)
    .max(8)
    .describe('Curated personalized ideas that strictly respect remaining budget'),
});

export type GenerateIdeasPayload = z.infer<typeof generateIdeasSchema>;
