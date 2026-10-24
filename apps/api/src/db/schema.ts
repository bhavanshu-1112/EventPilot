/**
 * Database table definitions and schema types for Kysely.
 * All tables with user data include event_id for strict tenant isolation.
 */
import type { Generated, ColumnType, Selectable } from 'kysely';

export type EventType = 'wedding' | 'birthday' | 'community';
export type TierLevel = 'save' | 'standard' | 'splurge';
export type ChecklistStatus = 'needed' | 'shortlisted' | 'quoted' | 'booked';
export type QuoteStatus = 'draft' | 'extracted' | 'booked' | 'rejected';
export type QuoteFlagSeverity = 'info' | 'warning' | 'critical';
export type NotifyChannel = 'sms' | 'whatsapp' | 'email';
export type NotifyStatus = 'draft' | 'pending' | 'sent' | 'failed';

export interface EventsTable {
  id: string; // UUID
  name: string;
  event_type: EventType;
  location: string;
  event_date: string; // YYYY-MM-DD
  guest_count: number;
  total_budget_minor: number; // paise, >= 0
  currency: string; // default 'INR'
  access_token_hash: string; // SHA-256 of 128-bit hex token
  brief_json: string; // JSON string
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CeremoniesTable {
  id: Generated<string>;
  event_id: string;
  name: string;
  ceremony_date: string;
  start_time: string;
  duration_min: number;
  venue: string | null;
  created_at: Generated<Date>;
}

export interface BudgetCategoriesTable {
  id: Generated<string>;
  event_id: string;
  category_id: string;
  label: string;
  weight: number;
  locked: boolean;
  floor_percent: number;
  priority: number;
  allocated_minor: number;
  spent_minor: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface BudgetLedgerTable {
  id: Generated<string>;
  event_id: string;
  category_id: string;
  previous_minor: number;
  new_minor: number;
  reason: string;
  created_at: Generated<Date>;
}

export interface InspirationAssetsTable {
  id: Generated<string>;
  event_id: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  content_hash: string;
  alt_text: string | null;
  created_at: Generated<Date>;
}

export interface BomItemsTable {
  id: Generated<string>;
  event_id: string;
  catalog_key: string;
  category: string;
  label: string;
  quantity: number;
  unit: string;
  selected_tier: TierLevel;
  created_at: Generated<Date>;
}

export interface BomItemTiersTable {
  id: Generated<string>;
  bom_item_id: string;
  tier: TierLevel;
  name: string;
  price_minor: number;
  description: string;
}

export interface ChecklistItemsTable {
  id: Generated<string>;
  event_id: string;
  category: string;
  title: string;
  description: string;
  due_date: string | null;
  days_before_event: number;
  priority: string;
  status: ChecklistStatus;
  role: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface IdeasTable {
  id: Generated<string>;
  event_id: string;
  title: string;
  description: string;
  category: string;
  estimated_cost_minor: number;
  why_fits: string;
  status: 'suggested' | 'accepted' | 'rejected';
  created_at: Generated<Date>;
}

export interface VendorsTable {
  id: Generated<string>;
  event_id: string;
  name: string;
  category: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: Generated<Date>;
}

export interface QuotesTable {
  id: Generated<string>;
  event_id: string;
  vendor_id: string | null;
  vendor_name: string;
  category: string;
  currency: string;
  stated_total_minor: number | null;
  status: QuoteStatus;
  valid_until: string | null;
  payment_terms: string | null;
  cancellation_terms: string | null;
  confidence: number;
  raw_storage_path: string | null;
  content_hash: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface QuoteLineItemsTable {
  id: Generated<string>;
  quote_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price_minor: number;
  total_minor: number;
  tax_included: boolean;
  notes: string | null;
  source_ref: string | null;
}

export interface QuoteFlagsTable {
  id: Generated<string>;
  quote_id: string;
  rule_id: string;
  severity: QuoteFlagSeverity;
  message: string;
  explanation: string;
  source_ref: string | null;
  source: 'deterministic' | 'llm';
  created_at: Generated<Date>;
}

export interface ScheduleItemsTable {
  id: Generated<string>;
  event_id: string;
  label: string;
  start_min: number;
  duration_min: number;
  fixed: boolean;
  buffer_min: number;
  vendor: string | null;
  guest_visible: boolean;
  priority: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ScheduleDependenciesTable {
  item_id: string;
  depends_on_item_id: string;
}

export interface ContactsTable {
  id: Generated<string>;
  event_id: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  preferred_channel: NotifyChannel;
  created_at: Generated<Date>;
}

export interface NotificationsTable {
  id: Generated<string>;
  event_id: string;
  contact_id: string | null;
  channel: NotifyChannel;
  recipient: string;
  body: string;
  status: NotifyStatus;
  idempotency_key: string;
  sent_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: Generated<Date>;
}

export interface LlmUsageTable {
  id: Generated<string>;
  event_id: string | null;
  purpose: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_minor: number;
  created_at: Generated<Date>;
}

export interface Database {
  events: EventsTable;
  ceremonies: CeremoniesTable;
  budget_categories: BudgetCategoriesTable;
  budget_ledger: BudgetLedgerTable;
  inspiration_assets: InspirationAssetsTable;
  bom_items: BomItemsTable;
  bom_item_tiers: BomItemTiersTable;
  checklist_items: ChecklistItemsTable;
  ideas: IdeasTable;
  vendors: VendorsTable;
  quotes: QuotesTable;
  quote_line_items: QuoteLineItemsTable;
  quote_flags: QuoteFlagsTable;
  schedule_items: ScheduleItemsTable;
  schedule_dependencies: ScheduleDependenciesTable;
  contacts: ContactsTable;
  notifications: NotificationsTable;
  llm_usage: LlmUsageTable;
}

export type EventRow = Selectable<EventsTable>;
export type CeremonyRow = Selectable<CeremoniesTable>;
export type BudgetCategoryRow = Selectable<BudgetCategoriesTable>;
export type BudgetLedgerRow = Selectable<BudgetLedgerTable>;
export type ScheduleItemRow = Selectable<ScheduleItemsTable>;
export type ScheduleDependencyRow = Selectable<ScheduleDependenciesTable>;
export type QuoteRow = Selectable<QuotesTable>;
export type QuoteLineItemRow = Selectable<QuoteLineItemsTable>;
export type QuoteFlagRow = Selectable<QuoteFlagsTable>;
export type ChecklistItemRow = Selectable<ChecklistItemsTable>;
export type ContactRow = Selectable<ContactsTable>;
export type NotificationRow = Selectable<NotificationsTable>;
export type InspirationAssetRow = Selectable<InspirationAssetsTable>;
export type BomItemRow = Selectable<BomItemsTable>;
export type BomItemTierRow = Selectable<BomItemTiersTable>;
export type IdeaRow = Selectable<IdeasTable>;
export type VendorRow = Selectable<VendorsTable>;
export type LlmUsageRow = Selectable<LlmUsageTable>;
