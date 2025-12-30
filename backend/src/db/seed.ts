import prisma from './client.js';

async function seed() {
  // Ensure metrics row exists (singleton)
  await prisma.metrics.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      totalCompletedCount: 0,
      momentumScore: 0,
      sunBrightness: 0.2,
    },
  });

  console.log('Database seeded successfully');
}

seed()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
