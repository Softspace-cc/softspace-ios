const { Client } = require('ssh2');

const conn = new Client();

conn.on('ready', () => {
  console.log('Connected. Starting the server from the actual server folder using pm2...');
  
  // We explicitly change to the server directory, install express (and prisma client), and start index.js
  const script = `
    cd /var/www/softspace/server
    npm install express jsonwebtoken @prisma/client
    npx prisma generate
    pm2 stop softspace-backend || true
    pm2 delete softspace-backend || true
    pm2 start src/index.js --name "softspace-backend"
    sleep 3
    pm2 status
  `;
  
  conn.exec(script, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code) => {
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).connect({
  host: '217.160.148.112',
  port: 22,
  username: 'root',
  password: 'zynFnGcW6r0L'
});