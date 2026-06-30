import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH Connected. Testing DM API endpoint...');
  
  // Use curl to call the local API with a valid token
  const cmd = `
    # Get latest PVJamie session token
    TOKEN=$(cd /var/www/softspace/server && node -e "
      const { PrismaClient } = require('@prisma/client');
      const p = new PrismaClient({ datasources: { db: { url: 'file:/var/www/softspace/server/prisma/prisma/dev.db' } } });
      p.session.findFirst({
        where: { userId: 'cmpwbqr1z0000tjc8t37gcefn' },
        orderBy: { createdAt: 'desc' }
      }).then(s => { console.log(s.token); p.\\$disconnect(); });
    " 2>/dev/null)
    
    echo "Token: $TOKEN"
    echo ""
    echo "=== DM Channels List ==="
    curl -s http://localhost:4000/api/dms -H "Authorization: Bearer $TOKEN" | node -e "
      let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
        const j=JSON.parse(d);
        console.log('Channels returned:', j.channels?.length);
        j.channels?.forEach(c => {
          const members = c.members?.map(m => m.user?.username).join(', ');
          console.log('  Channel:', c.id, '| Members:', members, '| Last msg:', c.lastMessage?.content?.substring(0,30) || 'none');
        });
      });
    "
    echo ""
    echo "=== Test: Messages from PVJamie+shadow-ezra channel ==="
    curl -s "http://localhost:4000/api/dms/cmq2o0kaj001p9i8t84wv8tn2/messages?limit=5" -H "Authorization: Bearer $TOKEN" | node -e "
      let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
        const j=JSON.parse(d);
        console.log('Messages returned:', j.messages?.length);
        j.messages?.forEach(m => {
          console.log('  [' + m.author?.username + ']:', m.content?.substring(0,50));
        });
      });
    "
    echo ""
    echo "=== Test: Messages from PVJamie+brokenskies channel ==="
    curl -s "http://localhost:4000/api/dms/cmq4prd3p00aa9i8t70dzm6yw/messages?limit=5" -H "Authorization: Bearer $TOKEN" | node -e "
      let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
        const j=JSON.parse(d);
        console.log('Messages returned:', j.messages?.length);
        j.messages?.forEach(m => {
          console.log('  [' + m.author?.username + ']:', m.content?.substring(0,50));
        });
      });
    "
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
