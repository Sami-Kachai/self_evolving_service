const fs = require('fs');
const logFile = 'app.log';
const pointerFile = 'app.log.pointer';

function ensureFilesExist() {
  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, '');
  }
  if (!fs.existsSync(pointerFile)) {
    fs.writeFileSync(pointerFile, '0');
  }
}

function getLastPointer() {
  ensureFilesExist();
  try {
    return parseInt(fs.readFileSync(pointerFile, 'utf8'), 10) || 0;
  } catch {
    return 0;
  }
}

function setLastPointer(position) {
  fs.writeFileSync(pointerFile, position.toString(), 'utf8');
}

function readNewLogEntries() {
  const start = getLastPointer();
  const stats = fs.statSync(logFile);
  const end = stats.size;

  if (start >= end) return null;

  const buffer = Buffer.alloc(end - start);
  const fd = fs.openSync(logFile, 'r');
  fs.readSync(fd, buffer, 0, buffer.length, start);
  fs.closeSync(fd);

  setLastPointer(end);
  return buffer.toString('utf8');
}

function watchLogs() {
  ensureFilesExist();

  fs.watchFile(logFile, async () => {
    const content = readNewLogEntries();
    if (content && content.includes('TypeError')) {
      console.log('[!] Detected runtime error, triggering patch...');
      const response = await require('./patcher').runSurgicalPatch();
      console.log(response);
    }
  });
}

module.exports = { watchLogs };
