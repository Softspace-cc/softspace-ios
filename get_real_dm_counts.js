import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH Connected. Fetching real DM counts...');
  
  const queryCode = `
    const { PrismaClient } = require('@prisma/client');
    const client = new PrismaClient({ datasources: { db: { url: 'file:/var/www/softspace/server/prisma/prisma/dev.db' } } });
    
    async function main() {
      try {
        const dmChannels = await client.dMChannel.findMany({
          include: {
            members: {
              include: {
                user: { select: { username: true } }
              }
            },
            _count: {
              select: { messages: true }
            }
          }
        });
        
        console.log('--- REAL DM CHANNELS & MESSAGE COUNTS ---');
        console.log(dmChannels.map(c => ({
          id: c.id,
          members: c.members.map(m => m.user.username),
          realMsgCount: c._count.messages
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
