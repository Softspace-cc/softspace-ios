import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('J4m!e2025#Go', 10);
  
  const user = await prisma.user.upsert({
    where: { username: 'PVJamie' },
    update: {
      passwordHash,
      pronouns: 'he/him',
      systemRole: 'CEO',
      displayName: 'PVJamie'
    },
    create: {
      username: 'PVJamie',
      email: 'jamie@softspace.cc',
      displayName: 'PVJamie',
      passwordHash,
      pronouns: 'he/him',
      systemRole: 'CEO',
      theme: 'dark'
    }
  });
  
  console.log('User PVJamie created/updated successfully:', user.username);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });