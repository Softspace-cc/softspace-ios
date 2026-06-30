import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH Connected. Inspecting old database relationships...');
  
  const queryCode = `
    const { PrismaClient } = require('@prisma/client');
    const client = new PrismaClient({ datasources: { db: { url: 'file:/var/www/softspace/server/prisma/dev.db' } } });
    
    async function main() {
      try {
        const users = await client.user.findMany({
          select: { id: true, username: true, email: true }
        });
        const friendships = await client.friendship.findMany();
        const dmChannels = await client.dMChannel.findMany({
          include: {
            members: {
              include: { user: { select: { username: true } } }
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: { content: true, createdAt: true }
            }
          }
        });
        
        console.log('--- OLD USERS ---');
        console.log(users);
        console.log('--- OLD FRIENDSHIPS ---');
        console.log(friendships);
        console.log('--- OLD DM CHANNELS & MEMBERS ---');
        console.log(dmChannels.map(c => ({
          id: c.id,
          members: c.members.map(m => m.user ? m.user.username : m.userId),
          msgCount: c.messages.length,
          lastMsg: c.messages[0] ? c.messages[0].content : 'None'
        })));
      } catch (err) {
        console.error('Error:', err.message);
      } finally {
        await client.$disconnect();
      }
    }
    main();
  `;

  const cmd = `cat << 'EOF' > /var/www/softspace/server/query_dbs.cjs
${queryCode}
EOF
cd /var/www/softspace/server && node query_dbs.cjs
rm -f /var/www/softspace/server/query_dbs.cjs
`;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
      .on('data', (data) => console.log(data.toString()))
      .stderr.on('data', (data) => console.error(data.toString()));
  });
}).connect({
  host: '217.160.148.112',
  port: 22,
  username: 'root',
  password: 'zynFnGcW6r0L'
});
