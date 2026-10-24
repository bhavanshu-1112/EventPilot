/**
 * Shared domain types for EventPilot.
 * These are the pure TypeScript types used across all packages.
 */

// ── Event types ────────────────────────────────────────────────────────

export type EventType = 'wedding' | 'birthday' | 'community';

export type BudgetCategoryId =
  | 'venue'
  | 'catering'
  | 'decor'
  | 'photography'
  | 'attire'
  | 'entertainment'
  | 'logistics'
  | 'contingency'
  | string; // Allow custom categories

export type TierLevel = 'save' | 'standard' | 'splurge';

export type ChecklistStatus = 'needed' | 'shortlisted' | 'quoted' | 'booked';

export type QuoteFlagSeverity = 'info' | 'warning' | 'critical';

export type ScheduleFixOp = 'shift' | 'swap' | 'shorten' | 'extend_filler' | 'cancel_optional';

export type NotifyChannel = 'sms' | 'whatsapp' | 'email';

// ── Budget domain ──────────────────────────────────────────────────────

export interface BudgetCategory {
  /** Unique category identifier */
  readonly id: BudgetCategoryId;
  /** Human-readable label */
  readonly label: string;
  /** Allocation weight (0-1, must sum to 1 across all categories) */
  readonly weight: number;
  /** Locked categories cannot be changed by rebalancing */
  readonly locked: boolean;
  /** Minimum floor as a fraction of total (0-1) */
  readonly floorPercent: number;
  /** Priority weight for deterministic fallback (higher = cut first) */
  readonly priority: number;
  /** Allocated amount in minor units (paise) */
  allocatedMinor: number;
  /** Amount actually spent/booked in minor units */
  spentMinor: number;
}

export interface RebalanceCut {
  /** Category to reduce */
  readonly categoryId: BudgetCategoryId;
  /** Amount to reduce in minor units */
  readonly reduceByMinor: number;
  /** Reason for the cut */
  readonly reason: string;
  /** Impact description */
  readonly impact: string;
}

export interface RebalanceProposal {
  /** Proposed cuts to absorb the overrun */
  readonly cuts: readonly RebalanceCut[];
  /** Summary of what changed */
  readonly summary: string;
  /** Whether this is the deterministic fallback */
  readonly isFallback: boolean;
}

export interface BudgetLedgerEntry {
  readonly id: string;
  readonly eventId: string;
  readonly categoryId: BudgetCategoryId;
  readonly previousMinor: number;
  readonly newMinor: number;
  readonly reason: string;
  readonly timestamp: Date;
}

// ── Schedule domain ────────────────────────────────────────────────────

export interface ScheduleItem {
  readonly id: string;
  /** Human-readable name */
  readonly label: string;
  /** Start time in minutes from event start (T=0) */
  startMin: number;
  /** Duration in minutes */
  readonly durationMin: number;
  /** Fixed items cannot be moved */
  readonly fixed: boolean;
  /** IDs of items this depends on */
  readonly dependsOn: readonly string[];
  /** Buffer time in minutes after dependencies */
  readonly bufferMin: number;
  /** Vendor or contact responsible */
  readonly vendor?: string;
  /** Whether guests see this item */
  readonly guestVisible: boolean;
  /** Priority (1 = highest) */
  readonly priority: number;
}

export interface RippleResult {
  /** Items after propagation (new start times) */
  readonly shiftedItems: readonly ScheduleItem[];
  /** Conflicts with fixed items */
  readonly conflicts: readonly ScheduleConflict[];
  /** Slack consumed per item */
  readonly consumedSlack: readonly SlackInfo[];
  /** Total minutes shifted */
  readonly totalMinutesMoved: number;
}

export interface ScheduleConflict {
  /** The fixed item that conflicts */
  readonly fixedItemId: string;
  /** The item trying to occupy the same slot */
  readonly conflictingItemId: string;
  /** Overlap in minutes */
  readonly overlapMin: number;
}

export interface SlackInfo {
  readonly itemId: string;
  readonly previousSlackMin: number;
  readonly consumedMin: number;
  readonly remainingSlackMin: number;
}

export interface ScheduleFixOption {
  /** Human-readable label */
  readonly label: string;
  /** Operations to apply */
  readonly operations: readonly ScheduleFixOperation[];
  /** Why this option */
  readonly rationale: string;
  /** Score (lower = better) */
  readonly score: FixScore;
}

export interface ScheduleFixOperation {
  readonly op: ScheduleFixOp;
  readonly itemId: string;
  /** Minutes to shift/shorten by */
  readonly minutes?: number;
  /** Target item for swap */
  readonly swapWithId?: string;
}

export interface FixScore {
  /** Number of fixed-item conflicts (primary sort) */
  readonly fixedConflicts: number;
  /** Number of guest-visible changes (secondary sort) */
  readonly guestVisibleChanges: number;
  /** Total minutes moved (tertiary sort) */
  readonly totalMinutesMoved: number;
}

// ── Quote domain ───────────────────────────────────────────────────────

export interface QuoteLineItem {
  readonly id: string;
  readonly description: string;
  readonly quantity: number;
  readonly unit: string;
  readonly unitPriceMinor: number;
  readonly totalMinor: number;
  readonly taxIncluded: boolean;
  readonly notes?: string;
  readonly sourceRef?: string;
}

export interface QuoteFee {
  readonly type: string;
  readonly amountMinor?: number;
  readonly percent?: number;
  readonly basis?: string;
  readonly sourceRef?: string;
}

export interface ExtractedQuote {
  readonly vendorName: string;
  readonly category: BudgetCategoryId;
  readonly currency: string;
  readonly lineItems: readonly QuoteLineItem[];
  readonly inclusions: readonly string[];
  readonly exclusions: readonly string[];
  readonly fees: readonly QuoteFee[];
  readonly validUntil?: string;
  readonly paymentTerms?: string;
  readonly cancellationTerms?: string;
  readonly statedTotalMinor?: number;
  readonly confidence: number;
}

export interface QuoteFlag {
  readonly id: string;
  readonly quoteId: string;
  readonly ruleId: string;
  readonly severity: QuoteFlagSeverity;
  readonly message: string;
  readonly explanation: string;
  readonly sourceRef?: string;
  /** 'deterministic' or 'llm' */
  readonly source: 'deterministic' | 'llm';
}

// ── Tax rules ──────────────────────────────────────────────────────────

export interface TaxRule {
  readonly id: string;
  readonly name: string;
  readonly rate: number;
  readonly appliesTo: readonly BudgetCategoryId[];
  readonly note: string;
}

export interface ServiceChargeRule {
  readonly rate: number;
  readonly note: string;
}

export interface TaxConfig {
  readonly _note: string;
  readonly gstRates: readonly TaxRule[];
  readonly serviceCharge: ServiceChargeRule;
}
