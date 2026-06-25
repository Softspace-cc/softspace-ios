const { Client } = require('ssh2');

const conn = new Client();

conn.on('ready', () => {
  console.log('Connected to server. Looking deeply into PM2 and Nginx...');
  conn.exec(`
    echo "--- PM2 STATUS ---"
    pm2 status
    echo "\\n--- PM2 ERROR LOGS ---"
    pm2 logs softspace-backend --lines 30 --err --nostream
    echo "\\n--- NGINX ERROR LOGS ---"
    tail -n 20 /var/log/nginx/error.log
  `, (err, stream) => {
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