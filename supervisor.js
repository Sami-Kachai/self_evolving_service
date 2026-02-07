const { fork } = require('child_process');
const path = require('path');

let child = null;

function startChild() {
  child = fork(path.join(__dirname, 'server.js'), [], {
    stdio: 'inherit',
    env: process.env,
  });
  console.log(`[supervisor] server started (pid=${child.pid})`);
}

function restartChild(reason = 'unknown') {
  if (!child) return startChild();

  console.log(`[supervisor] restarting server (${reason})...`);
  child.kill('SIGTERM');

  setTimeout(() => startChild(), 300);
}

module.exports = { startChild, restartChild };
