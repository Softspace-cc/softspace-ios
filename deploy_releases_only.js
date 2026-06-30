const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

const localFilePath = path.join(__dirname, 'server', 'src', 'routes', 'releases.js');
const remoteFilePath = '/var/www/softspace/server/src/routes/releases.js';

conn.on('ready', () => {
  console.log('Connected to server. Uploading releases.js...');
  
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      return;
    }
    
    const readStream = fs.createReadStream(localFilePath);
    const writeStream = sftp.createWriteStream(remoteFilePath);
    
    writeStream.on('error', (err) => {
      console.error('Write stream error:', err);
      conn.end();
    });

    writeStream.on('close', () => {
      console.log('File uploaded successfully. Restarting backend PM2 process...');
      
      conn.exec('pm2 restart softspace-backend', (err, stream) => {
        if (err) {
          console.error('PM2 restart execution error:', err);
          conn.end();
          return;
        }
        stream.on('close', (code) => {
          console.log(`PM2 restart complete with code ${code}.`);
          conn.end();
        }).on('data', (data) => {
          process.stdout.write(data);
        }).stderr.on('data', (data) => {
          process.stderr.write(data);
        });
      });
    });
    
    readStream.pipe(writeStream);
  });
}).connect({
  host: '217.160.148.112',
  port: 22,
  username: 'root',
  password: 'zynFnGcW6r0L'
});
