import { pgTable, uuid, varchar, text, timestamp, boolean, integer, real, pgEnum } from 'drizzle-orm/pg-core';

// --- Enums ---
export const assetTypeEnum = pgEnum('asset_type', ['stock', 'crypto', 'mutual_fund', 'sip']);
export const transactionTypeEnum = pgEnum('transaction_type', ['buy', 'sell']);
export const sipFrequencyEnum = pgEnum('sip_frequency', ['monthly', 'quarterly', 'yearly']);
export const sipStatusEnum = pgEnum('sip_status', ['active', 'paused', 'completed']);
export const alertDirectionEnum = pgEnum('alert_direction', ['above', 'below']);

// --- Users ---
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  telegramChatId: varchar('telegram_chat_id', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Portfolios ---
export const portfolios = pgTable('portfolios', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Assets ---
export const assets = pgTable('assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  portfolioId: uuid('portfolio_id').notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  type: assetTypeEnum('type').notNull(),
  symbol: varchar('symbol', { length: 50 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  quantity: real('quantity').notNull().default(0),
  avgBuyPrice: real('avg_buy_price').notNull().default(0),
  currentPrice: real('current_price').notNull().default(0),
  manualPrice: real('manual_price'),
  useLivePrice: boolean('use_live_price').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- Transactions ---
export const transactions = pgTable('transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  type: transactionTypeEnum('type').notNull(),
  quantity: real('quantity').notNull(),
  pricePerUnit: real('price_per_unit').notNull(),
  totalAmount: real('total_amount').notNull(),
  date: timestamp('date').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- SIPs ---
export const sips = pgTable('sips', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  frequency: sipFrequencyEnum('frequency').notNull(),
  startDate: timestamp('start_date').notNull(),
  nextPaymentDate: timestamp('next_payment_date').notNull(),
  status: sipStatusEnum('status').default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Price Alerts ---
export const priceAlerts = pgTable('price_alerts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  targetPrice: real('target_price').notNull(),
  direction: alertDirectionEnum('direction').notNull(),
  isTriggered: boolean('is_triggered').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Refresh Tokens ---
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Portfolio Snapshots (daily performance tracking) ---
export const portfolioSnapshots = pgTable('portfolio_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  portfolioId: uuid('portfolio_id').notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  date: timestamp('date').notNull(),
  totalValue: real('total_value').notNull().default(0),
  totalInvested: real('total_invested').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
