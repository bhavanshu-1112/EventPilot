import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Events
  await db.schema
    .createTable('events')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('event_type', 'varchar(32)', (col) => col.notNull())
    .addColumn('location', 'varchar(255)', (col) => col.notNull())
    .addColumn('event_date', 'varchar(32)', (col) => col.notNull())
    .addColumn('guest_count', 'integer', (col) => col.notNull().check(sql`guest_count > 0`))
    .addColumn('total_budget_minor', 'bigint', (col) =>
      col.notNull().check(sql`total_budget_minor >= 0`),
    )
    .addColumn('currency', 'varchar(8)', (col) => col.notNull().defaultTo('INR'))
    .addColumn('access_token_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('brief_json', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex('idx_events_token_hash')
    .on('events')
    .column('access_token_hash')
    .execute();

  // 2. Ceremonies
  await db.schema
    .createTable('ceremonies')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('event_id', 'varchar(64)', (col) =>
      col.notNull().references('events.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('ceremony_date', 'varchar(32)', (col) => col.notNull())
    .addColumn('start_time', 'varchar(32)', (col) => col.notNull())
    .addColumn('duration_min', 'integer', (col) => col.notNull().check(sql`duration_min > 0`))
    .addColumn('venue', 'varchar(255)')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex('idx_ceremonies_event_id')
    .on('ceremonies')
    .column('event_id')
    .execute();

  // 3. Budget Categories
  await db.schema
    .createTable('budget_categories')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('event_id', 'varchar(64)', (col) =>
      col.notNull().references('events.id').onDelete('cascade'),
    )
    .addColumn('category_id', 'varchar(64)', (col) => col.notNull())
    .addColumn('label', 'varchar(255)', (col) => col.notNull())
    .addColumn('weight', 'double precision', (col) => col.notNull())
    .addColumn('locked', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('floor_percent', 'double precision', (col) => col.notNull())
    .addColumn('priority', 'integer', (col) => col.notNull())
    .addColumn('allocated_minor', 'bigint', (col) => col.notNull().check(sql`allocated_minor >= 0`))
    .addColumn('spent_minor', 'bigint', (col) =>
      col
        .notNull()
        .defaultTo(0)
        .check(sql`spent_minor >= 0`),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex('idx_budget_categories_event_id')
    .on('budget_categories')
    .column('event_id')
    .execute();
  await db.schema
    .createIndex('idx_budget_categories_cat_id')
    .on('budget_categories')
    .columns(['event_id', 'category_id'])
    .execute();

  // 4. Budget Ledger (append-only)
  await db.schema
    .createTable('budget_ledger')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('event_id', 'varchar(64)', (col) =>
      col.notNull().references('events.id').onDelete('cascade'),
    )
    .addColumn('category_id', 'varchar(64)', (col) => col.notNull())
    .addColumn('previous_minor', 'bigint', (col) => col.notNull())
    .addColumn('new_minor', 'bigint', (col) => col.notNull())
    .addColumn('reason', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex('idx_budget_ledger_event_id')
    .on('budget_ledger')
    .column('event_id')
    .execute();

  // 5. Inspiration Assets
  await db.schema
    .createTable('inspiration_assets')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('event_id', 'varchar(64)', (col) =>
      col.notNull().references('events.id').onDelete('cascade'),
    )
    .addColumn('original_filename', 'varchar(255)', (col) => col.notNull())
    .addColumn('storage_path', 'varchar(512)', (col) => col.notNull())
    .addColumn('mime_type', 'varchar(64)', (col) => col.notNull())
    .addColumn('size_bytes', 'integer', (col) => col.notNull())
    .addColumn('content_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('alt_text', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex('idx_inspiration_assets_event_id')
    .on('inspiration_assets')
    .column('event_id')
    .execute();
  await db.schema
    .createIndex('idx_inspiration_assets_hash')
    .on('inspiration_assets')
    .column('content_hash')
    .execute();

  // 6. BOM Items
  await db.schema
    .createTable('bom_items')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('event_id', 'varchar(64)', (col) =>
      col.notNull().references('events.id').onDelete('cascade'),
    )
    .addColumn('catalog_key', 'varchar(128)', (col) => col.notNull())
    .addColumn('category', 'varchar(64)', (col) => col.notNull())
    .addColumn('label', 'varchar(255)', (col) => col.notNull())
    .addColumn('quantity', 'integer', (col) => col.notNull())
    .addColumn('unit', 'varchar(32)', (col) => col.notNull())
    .addColumn('selected_tier', 'varchar(16)', (col) => col.notNull().defaultTo('standard'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex('idx_bom_items_event_id')
    .on('bom_items')
    .column('event_id')
    .execute();

  // 7. BOM Item Tiers
  await db.schema
    .createTable('bom_item_tiers')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('bom_item_id', 'varchar(64)', (col) =>
      col.notNull().references('bom_items.id').onDelete('cascade'),
    )
    .addColumn('tier', 'varchar(16)', (col) => col.notNull())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('price_minor', 'bigint', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex('idx_bom_item_tiers_item_id')
    .on('bom_item_tiers')
    .column('bom_item_id')
    .execute();

  // 8. Checklist Items
  await db.schema
    .createTable('checklist_items')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('event_id', 'varchar(64)', (col) =>
      col.notNull().references('events.id').onDelete('cascade'),
    )
    .addColumn('category', 'varchar(64)', (col) => col.notNull())
    .addColumn('title', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('due_date', 'varchar(32)')
    .addColumn('days_before_event', 'integer', (col) => col.notNull())
    .addColumn('priority', 'varchar(16)', (col) => col.notNull().defaultTo('medium'))
    .addColumn('status', 'varchar(32)', (col) => col.notNull().defaultTo('needed'))
    .addColumn('role', 'varchar(64)')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex('idx_checklist_items_event_id')
    .on('checklist_items')
    .column('event_id')
    .execute();

  // 9. Ideas
  await db.schema
    .createTable('ideas')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('event_id', 'varchar(64)', (col) =>
      col.notNull().references('events.id').onDelete('cascade'),
    )
    .addColumn('title', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('category', 'varchar(64)', (col) => col.notNull())
    .addColumn('estimated_cost_minor', 'bigint', (col) => col.notNull())
    .addColumn('why_fits', 'text', (col) => col.notNull())
    .addColumn('status', 'varchar(16)', (col) => col.notNull().defaultTo('suggested'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema.createIndex('idx_ideas_event_id').on('ideas').column('event_id').execute();

  // 10. Vendors
  await db.schema
    .createTable('vendors')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('event_id', 'varchar(64)', (col) =>
      col.notNull().references('events.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('category', 'varchar(64)', (col) => col.notNull())
    .addColumn('contact_name', 'varchar(255)')
    .addColumn('phone', 'varchar(64)')
    .addColumn('email', 'varchar(255)')
    .addColumn('status', 'varchar(32)', (col) => col.notNull().defaultTo('shortlisted'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema.createIndex('idx_vendors_event_id').on('vendors').column('event_id').execute();

  // 11. Quotes
  await db.schema
    .createTable('quotes')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('event_id', 'varchar(64)', (col) =>
      col.notNull().references('events.id').onDelete('cascade'),
    )
    .addColumn('vendor_id', 'varchar(64)', (col) =>
      col.references('vendors.id').onDelete('set null'),
    )
    .addColumn('vendor_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('category', 'varchar(64)', (col) => col.notNull())
    .addColumn('currency', 'varchar(8)', (col) => col.notNull().defaultTo('INR'))
    .addColumn('stated_total_minor', 'bigint')
    .addColumn('status', 'varchar(32)', (col) => col.notNull().defaultTo('extracted'))
    .addColumn('valid_until', 'varchar(32)')
    .addColumn('payment_terms', 'text')
    .addColumn('cancellation_terms', 'text')
    .addColumn('confidence', 'double precision', (col) => col.notNull().defaultTo(1.0))
    .addColumn('raw_storage_path', 'varchar(512)')
    .addColumn('content_hash', 'varchar(64)')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema.createIndex('idx_quotes_event_id').on('quotes').column('event_id').execute();

  // 12. Quote Line Items
  await db.schema
    .createTable('quote_line_items')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('quote_id', 'varchar(64)', (col) =>
      col.notNull().references('quotes.id').onDelete('cascade'),
    )
    .addColumn('description', 'varchar(255)', (col) => col.notNull())
    .addColumn('quantity', 'integer', (col) => col.notNull())
    .addColumn('unit', 'varchar(64)', (col) => col.notNull())
    .addColumn('unit_price_minor', 'bigint', (col) => col.notNull())
    .addColumn('total_minor', 'bigint', (col) => col.notNull())
    .addColumn('tax_included', 'boolean', (col) => col.notNull())
    .addColumn('notes', 'text')
    .addColumn('source_ref', 'varchar(255)')
    .execute();

  await db.schema
    .createIndex('idx_quote_line_items_quote_id')
    .on('quote_line_items')
    .column('quote_id')
    .execute();

  // 13. Quote Flags
  await db.schema
    .createTable('quote_flags')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('quote_id', 'varchar(64)', (col) =>
      col.notNull().references('quotes.id').onDelete('cascade'),
    )
    .addColumn('rule_id', 'varchar(64)', (col) => col.notNull())
    .addColumn('severity', 'varchar(16)', (col) => col.notNull())
    .addColumn('message', 'varchar(255)', (col) => col.notNull())
    .addColumn('explanation', 'text', (col) => col.notNull())
    .addColumn('source_ref', 'varchar(255)')
    .addColumn('source', 'varchar(16)', (col) => col.notNull().defaultTo('deterministic'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex('idx_quote_flags_quote_id')
    .on('quote_flags')
    .column('quote_id')
    .execute();

  // 14. Schedule Items
  await db.schema
    .createTable('schedule_items')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('event_id', 'varchar(64)', (col) =>
      col.notNull().references('events.id').onDelete('cascade'),
    )
    .addColumn('label', 'varchar(255)', (col) => col.notNull())
    .addColumn('start_min', 'integer', (col) => col.notNull())
    .addColumn('duration_min', 'integer', (col) => col.notNull().check(sql`duration_min > 0`))
    .addColumn('fixed', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('buffer_min', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('vendor', 'varchar(255)')
    .addColumn('guest_visible', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('priority', 'integer', (col) => col.notNull().defaultTo(3))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex('idx_schedule_items_event_id')
    .on('schedule_items')
    .column('event_id')
    .execute();

  // 15. Schedule Dependencies
  await db.schema
    .createTable('schedule_dependencies')
    .addColumn('item_id', 'varchar(64)', (col) =>
      col.notNull().references('schedule_items.id').onDelete('cascade'),
    )
    .addColumn('depends_on_item_id', 'varchar(64)', (col) =>
      col.notNull().references('schedule_items.id').onDelete('cascade'),
    )
    .addPrimaryKeyConstraint('pk_schedule_dependencies', ['item_id', 'depends_on_item_id'])
    .execute();

  // 16. Contacts
  await db.schema
    .createTable('contacts')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('event_id', 'varchar(64)', (col) =>
      col.notNull().references('events.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('role', 'varchar(128)', (col) => col.notNull())
    .addColumn('phone', 'varchar(64)')
    .addColumn('email', 'varchar(255)')
    .addColumn('preferred_channel', 'varchar(16)', (col) => col.notNull().defaultTo('whatsapp'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema.createIndex('idx_contacts_event_id').on('contacts').column('event_id').execute();

  // 17. Notifications
  await db.schema
    .createTable('notifications')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('event_id', 'varchar(64)', (col) =>
      col.notNull().references('events.id').onDelete('cascade'),
    )
    .addColumn('contact_id', 'varchar(64)', (col) =>
      col.references('contacts.id').onDelete('set null'),
    )
    .addColumn('channel', 'varchar(16)', (col) => col.notNull())
    .addColumn('recipient', 'varchar(255)', (col) => col.notNull())
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('status', 'varchar(16)', (col) => col.notNull().defaultTo('draft'))
    .addColumn('idempotency_key', 'varchar(128)', (col) => col.notNull().unique())
    .addColumn('sent_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex('idx_notifications_event_id')
    .on('notifications')
    .column('event_id')
    .execute();
  await db.schema
    .createIndex('idx_notifications_idempotency')
    .on('notifications')
    .column('idempotency_key')
    .execute();

  // 18. LLM Usage
  await db.schema
    .createTable('llm_usage')
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('event_id', 'varchar(64)', (col) => col.references('events.id').onDelete('set null'))
    .addColumn('purpose', 'varchar(64)', (col) => col.notNull())
    .addColumn('model', 'varchar(64)', (col) => col.notNull())
    .addColumn('prompt_tokens', 'integer', (col) => col.notNull())
    .addColumn('completion_tokens', 'integer', (col) => col.notNull())
    .addColumn('total_tokens', 'integer', (col) => col.notNull())
    .addColumn('estimated_cost_minor', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex('idx_llm_usage_event_id')
    .on('llm_usage')
    .column('event_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const tables = [
    'llm_usage',
    'notifications',
    'contacts',
    'schedule_dependencies',
    'schedule_items',
    'quote_flags',
    'quote_line_items',
    'quotes',
    'vendors',
    'ideas',
    'checklist_items',
    'bom_item_tiers',
    'bom_items',
    'inspiration_assets',
    'budget_ledger',
    'budget_categories',
    'ceremonies',
    'events',
  ];

  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().cascade().execute();
  }
}
