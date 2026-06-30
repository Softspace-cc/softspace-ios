import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const firstUser = await prisma.user.findFirst();
  if (!firstUser) throw new Error('No users in DB');

  let server = await prisma.serverGuild.findUnique({ where: { id: 'teamchat' } });
  if (!server) {
    server = await prisma.serverGuild.create({
      data: {
        id: 'teamchat',
        name: 'Teamchat',
        ownerId: firstUser.id,
      }
    });
    console.log('Created teamchat server');
  }

  const everyoneRole = await prisma.role.findFirst({
    where: { serverId: server.id, isDefault: true }
  });
  if (!everyoneRole) {
    await prisma.role.create({
      data: {
        serverId: server.id,
        name: '@everyone',
        color: '#a89cd6',
        position: 0,
        permissions: 2048n, // view + send
        isDefault: true,
      },
    });
  }

  // Create channels
  const channels = [
    { name: 'announcements', type: 'TEXT' },
    { name: 'chat', type: 'TEXT' },
    { name: 'events', type: 'TEXT' },
    { name: 'updates-changelogs', type: 'TEXT' },
    { name: 'teamupdates', type: 'TEXT' }
  ];

  let position = 0;
  for (const c of channels) {
    const existing = await prisma.channel.findFirst({
      where: { serverId: server.id, name: c.name }
    });
    if (!existing) {
      await prisma.channel.create({
        data: {
          serverId: server.id,
          name: c.name,
          type: c.type,
          position: position++
        }
      });
      console.log('Created channel: ' + c.name);
    }
  }

}
main().catch(console.error).finally(() => prisma.$disconnect());
