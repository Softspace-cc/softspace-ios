const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const clientDir = path.join(__dirname, 'client');
const packageJsonPath = path.join(clientDir, 'package.json');

if (!fs.existsSync(packageJsonPath)) {
  console.error('Error: client/package.json not found.');
  process.exit(1);
}

const version = require(packageJsonPath).version;
const releaseDir = path.join(clientDir, 'release-buildv3');
const zipFileName = `SoftSpace-${version}.zip`;
const setupFileName = `SoftSpace-Setup-${version}.exe`;

const localZipPath = path.join(releaseDir, zipFileName);
const localSetupPath = path.join(releaseDir, 'installer', setupFileName);
const localYmlPath = path.join(releaseDir, 'latest.yml');

const remoteZipPath = `/var/www/softspace/server/releases/windows/${zipFileName}`;
const remoteSetupPath = `/var/www/softspace/server/releases/windows/${setupFileName}`;
const remoteYmlPath = '/var/www/softspace/server/releases/windows/latest.yml';

if (!fs.existsSync(localZipPath)) {
  console.error(`Error: Local zip payload not found at ${localZipPath}`);
  console.log('Please run "npm run electron:build" in client first to build the release.');
  process.exit(1);
}

if (!fs.existsSync(localSetupPath)) {
  console.error(`Error: Local Setup EXE not found at ${localSetupPath}`);
  console.log('Please run "npm run electron:build" in client first to build the release.');
  process.exit(1);
}

if (!fs.existsSync(localYmlPath)) {
  console.error(`Error: Local latest.yml not found at ${localYmlPath}`);
  process.exit(1);
}

const conn = new Client();

conn.on('ready', () => {
  console.log('Connected to server. Initializing SFTP...');
  
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      return;
    }
    
    // 1. Upload latest.yml
    console.log('Uploading latest.yml...');
    sftp.fastPut(localYmlPath, remoteYmlPath, {}, (err) => {
      if (err) {
        console.error('Failed to upload latest.yml:', err);
        conn.end();
        return;
      }
      console.log('latest.yml uploaded successfully.');
      
      // 2. Upload Setup EXE with progress
      console.log(`Uploading ${setupFileName}...`);
      let setupLastPercent = -1;
      sftp.fastPut(localSetupPath, remoteSetupPath, {
        step: (transferred, chunk, total) => {
          const percent = Math.round((transferred / total) * 100);
          if (percent !== setupLastPercent && percent % 10 === 0) {
            console.log(`Setup EXE Upload Progress: ${percent}% (${(transferred / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB)`);
            setupLastPercent = percent;
          }
        }
      }, (err) => {
        if (err) {
          console.error(`Failed to upload ${setupFileName}:`, err);
          conn.end();
          return;
        }
        console.log(`${setupFileName} uploaded successfully.`);
        
        // 3. Upload the ZIP payload with progress
        console.log(`Uploading ${zipFileName} (this might take a few minutes)...`);
        let zipLastPercent = -1;
        sftp.fastPut(localZipPath, remoteZipPath, {
          step: (transferred, chunk, total) => {
            const percent = Math.round((transferred / total) * 100);
            if (percent !== zipLastPercent && percent % 10 === 0) {
              console.log(`ZIP Payload Upload Progress: ${percent}% (${(transferred / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB)`);
              zipLastPercent = percent;
            }
          }
        }, (err) => {
          if (err) {
            console.error(`Failed to upload ${zipFileName}:`, err);
          } else {
            console.log(`Successfully uploaded all release assets for version ${version}!`);
          }
          conn.end();
        });
      });
    });
  });
}).connect({
  host: '217.160.148.112',
  port: 22,
  username: 'root',
  password: 'zynFnGcW6r0L'
});
