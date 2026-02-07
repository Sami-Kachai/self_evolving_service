const fs = require('fs');

for (const f of ['app.log', 'app.log.pointer']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

console.log('Reset: app.log + app.log.pointer removed.');
