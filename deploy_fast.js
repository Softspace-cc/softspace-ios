import { Client } from 'ssh2';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const remoteUser = 'root';
const remoteHost = '217.160.148.112';
const remotePath = '/var/www/softspace';
const password = 'zynFnGcW6r0L';

const localPath = __dirname;
const tempDir = path.join(process.env.TEMP || 'C:\\Windows\\Temp', `softspace_temp_deploy_fast_${Date.now()}`);
const zipFile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', `softspace_deploy_fast_${Date.now()}.zip`);

function runLocalCommand(cmd) {
  console.log(`Running local command: ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

async function main() {
  try {
    // 1. Clean up old temporary files
    console.log('Cleaning up temporary files...');
    if (fs.existsSync(zipFile)) {
      try {
        fs.unlinkSync(zipFile);
      } catch (err) {
        console.warn('Could not delete old zip file:', err.message);
      }
    }
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.warn('Could not clean up old temp directory:', err.message);
      }
    }
    fs.mkdirSync(tempDir, { recursive: true });

    // 2. Robocopy project files (excluding node_modules, .git, etc.)
    console.log('Copying project files using robocopy...');
    try {
      // Robocopy returns non-zero codes for success, so we catch and ignore ordinary exit codes (under 8)
      execSync(`robocopy "${localPath}" "${tempDir}" /MIR /XD node_modules .git .vscode client\\release-buildv3 client\\node_modules server\\node_modules /XF *.zip *.log dev.db .env .env.local .env.production .env.*.local`, { stdio: 'ignore' });
    } catch (e) {
      if (e.status >= 8) {
        throw new Error(`Robocopy failed with status ${e.status}`);
      }
    }

    // 3. Compress files using tar
    console.log('Compressing files with tar...');
    // We navigate to tempDir and zip all contents using tar
    runLocalCommand(`tar -a -c -f "${zipFile}" -C "${tempDir}" .`);

    // 4. SSH upload and remote execute
    console.log(`Connecting to ${remoteHost} via SSH...`);
    const conn = new Client();
    
    conn.on('ready', () => {
      console.log('SSH Connection established.');
      
      console.log('Initializing SFTP...');
      conn.sftp((err, sftp) => {
        if (err) throw err;
        
        console.log(`Uploading deploy package to /root/deploy_fast.zip...`);
        let lastPercent = -1;
        sftp.fastPut(zipFile, '/root/deploy_fast.zip', {
          step: (transferred, chunk, total) => {
            const percent = Math.round((transferred / total) * 100);
            if (percent !== lastPercent && percent % 10 === 0) {
              console.log(`Upload Progress: ${percent}% (${(transferred / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB)`);
              lastPercent = percent;
            }
          }
        }, (err) => {
          if (err) throw err;
          console.log('Upload complete. Triggering fast update script on remote server...');
          
          const remoteCmd = `mkdir -p ${remotePath} && cp /root/deploy_fast.zip ${remotePath}/ && cd ${remotePath} && unzip -o deploy_fast.zip && chmod +x update_fast.sh && ./update_fast.sh`;
          
          conn.exec(remoteCmd, (err, stream) => {
            if (err) throw err;
            
            stream.on('close', (code, signal) => {
              console.log(`Remote execution closed with code: ${code}`);
              conn.end();
              
              // Clean up local temp files
              console.log('Cleaning up local temporary files...');
              if (fs.existsSync(zipFile)) {
                try {
                  fs.unlinkSync(zipFile);
                } catch (e) {
                  console.warn('Could not delete temp zip file:', e.message);
                }
              }
              if (fs.existsSync(tempDir)) {
                try {
                  fs.rmSync(tempDir, { recursive: true, force: true });
                } catch (e) {
                  console.warn('Could not delete temp directory:', e.message);
                }
              }
              
              console.log('FAST DEPLOYMENT COMPLETE AND SERVER UPDATED!');
            }).on('data', (data) => {
              process.stdout.write(data);
            }).stderr.on('data', (data) => {
              process.stderr.write(data);
            });
          });
        });
      });
    }).connect({
      host: remoteHost,
      port: 22,
      username: remoteUser,
      password: password
    });
  } catch (err) {
    console.error('Deployment failed:', err);
  }
}

main();
