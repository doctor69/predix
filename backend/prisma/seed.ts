import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const categories = [
    { name: 'Crypto', slug: 'crypto', icon: '₿', description: 'Cryptocurrency prices and events' },
    { name: 'Politics', slug: 'politics', icon: '🏛️', description: 'Elections and political outcomes' },
    { name: 'Sports', slug: 'sports', icon: '⚽', description: 'Sports results and championships' },
    { name: 'Finance', slug: 'finance', icon: '📈', description: 'Stocks, macro, and economic events' },
    { name: 'Tech', slug: 'tech', icon: '💻', description: 'Technology releases and milestones' },
    { name: 'Science', slug: 'science', icon: '🔬', description: 'Scientific discoveries and research' },
    { name: 'Pop Culture', slug: 'pop-culture', icon: '🎬', description: 'Entertainment and celebrity events' },
    { name: 'Other', slug: 'other', icon: '📊', description: 'Miscellaneous prediction markets' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }

  console.log('Seeded categories:', categories.length);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
