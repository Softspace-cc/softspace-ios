import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH Connected. Running Prisma query using CJS script...');
  
  const queryCode = `
    const { PrismaClient } = require('@prisma/client');
    
    async function checkDb(url, name) {
      const client = new PrismaClient({
        datasources: { db: { url } }
      });
      try {
        const msgCount = await client.message.count();
        const dmCount = await client.dMMessage.count();
        const userCount = await client.user.count();
        console.log(name, 'Message Count:', msgCount);
        console.log(name, 'DMMessage Count:', dmCount);
        console.log(name, 'User Count:', userCount);
      } catch (err) {
        console.error(name, 'error:', err.message);
      } finally {
        await client.$disconnect();
      }
    }

    async function main() {
      await checkDb('file:/var/www/softspace/server/prisma/dev.db', 'ROOT_DB');
      await checkDb('file:/var/www/softspace/server/prisma/prisma/dev.db', 'NESTED_DB');
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
