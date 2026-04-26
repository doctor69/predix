// Run locally: DATABASE_URL=... npm run db:seed
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { categories } from './schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const defaultCategories = [
  { name: 'Crypto',      slug: 'crypto',      icon: '₿',  description: 'Cryptocurrency prices and events' },
  { name: 'Politics',    slug: 'politics',    icon: '🏛️', description: 'Elections and political outcomes' },
  { name: 'Sports',      slug: 'sports',      icon: '⚽', description: 'Sports results and championships' },
  { name: 'Finance',     slug: 'finance',     icon: '📈', description: 'Stocks, macro, and economic events' },
  { name: 'Tech',        slug: 'tech',        icon: '💻', description: 'Technology releases and milestones' },
  { name: 'Science',     slug: 'science',     icon: '🔬', description: 'Scientific discoveries and research' },
  { name: 'Pop Culture', slug: 'pop-culture', icon: '🎬', description: 'Entertainment and celebrity events' },
  { name: 'Other',       slug: 'other',       icon: '📊', description: 'Miscellaneous prediction markets' },
];

async function seed() {
  for (const cat of defaultCategories) {
    await db.insert(categories).values(cat).onConflictDoNothing();
  }
  console.log('Seeded', defaultCategories.length, 'categories');
}

seed().catch(console.error);
