import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH Connected. Querying active sessions in NESTED_DB...');
  
  const queryCode = `
    const { PrismaClient } = require('@prisma/client');
    const client = new PrismaClient({ datasources: { db: { url: 'file:/var/www/softspace/server/prisma/prisma/dev.db' } } });
    
    async function main() {
      try {
        const sessions = await client.session.findMany({
          include: {
            user: { select: { username: true, email: true } }
          }
        });
        console.log('--- ACTIVE SESSIONS ---');
        console.log(sessions);
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
