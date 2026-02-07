const fs = require('fs');
const logFile = 'app.log';
const pointerFile = 'app.log.pointer';
const { c, tag } = require('./colors');

function ensureFilesExist() {
  if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '');
  if (!fs.existsSync(pointerFile)) fs.writeFileSync(pointerFile, '0');
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

function watchLogs({ onPatched } = {}) {
  ensureFilesExist();

  fs.watchFile(logFile, { interval: 200 }, async () => {
    const content = readNewLogEntries();
    if (!content) return;

    if (content.includes('TypeError')) {
      console.log(
        `${tag('watcher', c.cyan)} ${c.yellow('Detected runtime error')} ${c.dim('→ triggering patch...')}`,
      );

      try {
        const ok = await require('./patcher').runSurgicalPatch();
        if (ok) {
          console.log(
            `${tag('patcher', c.magenta)} ${c.green('Patch applied')}`,
          );
          if (typeof onPatched === 'function') onPatched();
        } else {
          console.log(
            `${tag('patcher', c.magenta)} ${c.red('Patch not applied')}`,
          );
        }
      } catch (e) {
        console.log(
          `${tag('patcher', c.magenta)} ${c.red('Patch flow crashed:')} ${c.yellow(e.message)}`,
        );
      }
    }
  });
}

module.exports = { watchLogs };
