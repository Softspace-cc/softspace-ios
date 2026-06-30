import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH Connected. Inspecting user brokenskies in database...');
  
  const queryCode = `
    const { PrismaClient } = require('@prisma/client');
    
    async function checkDb(url, name) {
      const client = new PrismaClient({
        datasources: { db: { url } }
      });
      try {
        console.log('Checking DB:', name);
        const users = await client.user.findMany();
        const user = users.find(u => u.username.toLowerCase() === 'brokenskies' || u.displayName.toLowerCase() === 'brokenskies');
        if (user) {
          console.log('Found user details:', JSON.stringify(user, null, 2));
        } else {
          console.log('User brokenskies not found in DB:', name);
        }
      } catch (err) {
        console.error(name, 'error:', err.message);
      } finally {
        await client.$disconnect();
      }
    }

    async function main() {
      await checkDb('file:/var/www/softspace/server/prisma/prisma/dev.db', 'NESTED_DB');
    }

    main();
  `;

  const cmd = `cat << 'EOF' > /var/www/softspace/server/inspect_user.cjs
${queryCode}
EOF
cd /var/www/softspace/server && node inspect_user.cjs
rm -f /var/www/softspace/server/inspect_user.cjs
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
