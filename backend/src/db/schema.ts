import { pgTable, text, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const marketStatusEnum = pgEnum('market_status', [
  'OPEN', 'CLOSED', 'RESOLVED', 'CANCELLED', 'DISPUTED',
]);

export const resolutionEnum = pgEnum('resolution', ['YES', 'NO']);

export const categories = pgTable('categories', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name:        text('name').notNull().unique(),
  slug:        text('slug').notNull().unique(),
  icon:        text('icon').notNull().default('📊'),
  description: text('description'),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
});

export const markets = pgTable('markets', {
  id:               text('id').primaryKey(), // on-chain marketId (uint256 as string)
  question:         text('question').notNull(),
  categoryId:       text('category_id').notNull().references(() => categories.id),
  imageUrl:         text('image_url'),
  resolutionSource: text('resolution_source').notNull(),
  closingTime:      timestamp('closing_time').notNull(),
  resolutionTime:   timestamp('resolution_time').notNull(),
  status:           marketStatusEnum('status').notNull().default('OPEN'),
  resolution:       resolutionEnum('resolution'),
  yesPool:          text('yes_pool').notNull().default('0'),
  noPool:           text('no_pool').notNull().default('0'),
  totalVolume:      text('total_volume').notNull().default('0'),
  createdBy:        text('created_by').notNull(),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
  resolvedAt:       timestamp('resolved_at'),
  txHash:           text('tx_hash'),
  resolveTxHash:    text('resolve_tx_hash'),
});

export const users = pgTable('users', {
  id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  walletAddress: text('wallet_address').notNull().unique(),
  displayName:   text('display_name'),
  avatarUrl:     text('avatar_url'),
  isAdmin:       boolean('is_admin').notNull().default(false),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
});

export const resolutionEvidence = pgTable('resolution_evidence', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  marketId:     text('market_id').notNull().references(() => markets.id),
  adminAddress: text('admin_address').notNull(),
  outcome:      resolutionEnum('outcome').notNull(),
  evidenceUrl:  text('evidence_url'),
  notes:        text('notes'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
});

// Relations for join queries
export const categoriesRelations = relations(categories, ({ many }) => ({
  markets: many(markets),
}));

export const marketsRelations = relations(markets, ({ one, many }) => ({
  category: one(categories, { fields: [markets.categoryId], references: [categories.id] }),
  evidence: many(resolutionEvidence),
}));

export const resolutionEvidenceRelations = relations(resolutionEvidence, ({ one }) => ({
  market: one(markets, { fields: [resolutionEvidence.marketId], references: [markets.id] }),
}));
