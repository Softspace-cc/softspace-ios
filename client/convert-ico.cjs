const fs = require('fs');
const pngToIco = require('png-to-ico').default;

pngToIco('build/icon.png')
  .then(buf => {
    fs.writeFileSync('build/icon.ico', buf);
    console.log('icon.ico created successfully');
  })
  .catch(console.error);
