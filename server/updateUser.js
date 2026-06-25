import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    where: { username: 'ezra_vp3qs' },
    data: { username: 'shadow-ezra' }
  });
  console.log('Erfolgreich aktualisiert:', result);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });