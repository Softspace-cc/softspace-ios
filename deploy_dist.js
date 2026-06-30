import { Client } from 'ssh2';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const zipFile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'softspace_client_dist.zip');
const localDistPath = path.join(__dirname, 'client', 'dist');
const remotePath = '/var/www/softspace/client';

if (fs.existsSync(zipFile)) fs.unlinkSync(zipFile);
console.log('Compressing local client/dist...');
execSync(`tar -a -c -f "${zipFile}" -C "${localDistPath}" .`, { stdio: 'inherit' });

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected. Uploading...');
  conn.sftp((err, sftp) => {
    if (err) throw err;
    let lastPercent = -1;
    sftp.fastPut(zipFile, `${remotePath}/dist.zip`, {
      step: (transferred, chunk, total) => {
        const p = Math.round((transferred / total) * 100);
        if (p !== lastPercent && p % 25 === 0) { console.log(`Upload: ${p}%`); lastPercent = p; }
      }
    }, (err) => {
      if (err) throw err;
      console.log('Extracting on server...');
      conn.exec(`cd ${remotePath} && rm -rf dist && mkdir -p dist && unzip -o dist.zip -d dist && rm -f dist.zip && chmod -R 755 dist && (chcon -Rt httpd_sys_content_t dist || true)`, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code) => {
          console.log(`Done! Exit code: ${code}`);
          conn.end();
          if (fs.existsSync(zipFile)) fs.unlinkSync(zipFile);
        }).on('data', d => process.stdout.write(d)).stderr.on('data', d => process.stderr.write(d));
      });
    });
  });
}).connect({ host: '217.160.148.112', port: 22, username: 'root', password: 'zynFnGcW6r0L' });
