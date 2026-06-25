import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { signToken, tokenExpiry } from './src/lib/auth.js';

const prisma = new PrismaClient();
const tokenId = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 32);

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log("Benutzung: node devLogin.js <email_oder_username>");
    process.exit(1);
  }

  const identifier = args[0];

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: identifier },
        { username: identifier }
      ]
    }
  });

  if (!user) {
    console.log(`User nicht gefunden: ${identifier}`);
    process.exit(1);
  }

  const token = signToken({ sub: user.id, jti: tokenId() });
  
  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      userAgent: 'Dev-CLI-Bypass',
      ipAddress: '127.0.0.1',
      expiresAt: tokenExpiry(),
    },
  });

  console.log(`\n✅ Login-Session erfolgreich erstellt fuer: ${user.username} (${user.email})`);
  console.log(`\nUm dich sofort einzuloggen, oeffne Softspace im Browser.`);
  console.log(`Druecke F12 (oder Rechtsklick -> Untersuchen), wechsle in den Tab "Console" (Konsole) und fuege dort diesen Code ein:\n`);

  const userPayload = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    bio: user.bio,
    pronouns: user.pronouns,
    status: user.status,
    systemRole: user.systemRole,
    allowDownloads: user.allowDownloads
  };

  console.log(`localStorage.setItem('softspace_token', '${token}');`);
  console.log(`localStorage.setItem('softspace_user', JSON.stringify(${JSON.stringify(userPayload)}));`);
  console.log(`location.href = '/app';\n`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
