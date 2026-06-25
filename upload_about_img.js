const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();
const aboutTsx = fs.readFileSync(path.join(__dirname, 'client/src/pages/AboutPage.tsx'), 'utf8');

// Also try to read image.png locally so we can upload it if it's missing on the server
let localImage = null;
try {
  localImage = fs.readFileSync(path.join(__dirname, 'client/public/image.png'));
} catch (e) {
  console.log('Local image.png not found, skipping image upload.');
}

conn.on('ready', () => {
  console.log('Uploading updated About page and image to server...');
  conn.sftp((err, sftp) => {
    if (err) throw err;
    
    const finishUpdate = () => {
      sftp.writeFile('/var/www/softspace/client/src/pages/AboutPage.tsx', aboutTsx, 'utf8', (err) => {
        if (err) throw err;
        
        console.log('Files uploaded. Rebuilding frontend...');
        conn.exec('cd /var/www/softspace && bash update.sh', (err, stream) => {
          if (err) throw err;
          stream.on('close', (code) => {
            console.log('Update finished with code:', code);
            conn.end();
          }).on('data', (data) => {
            process.stdout.write(data);
          }).stderr.on('data', (data) => {
            process.stderr.write(data);
          });
        });
      });
    };

    if (localImage) {
      sftp.writeFile('/var/www/softspace/client/public/image.png', localImage, (err) => {
        if (err) throw err;
        console.log('image.png uploaded.');
        finishUpdate();
      });
    } else {
      finishUpdate();
    }
  });
}).connect({
  host: '217.160.148.112',
  port: 22,
  username: 'root',
  password: 'zynFnGcW6r0L'
});