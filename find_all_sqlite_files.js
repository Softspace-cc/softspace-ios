import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH Connected. Scanning files for SQLite signature...');
  
  // Find files and check their headers for 'SQLite format 3'
  const cmd = `find /var/www /root -type f -size +10k 2>/dev/null | while read -r file; do
    if head -c 15 "$file" | grep -q "SQLite format 3"; then
      ls -lh "$file"
    fi
  done`;

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
