const { c, tag } = require('./colors');
const { fork } = require('child_process');
const path = require('path');

let child = null;

function startChild() {
  child = fork(path.join(__dirname, 'server.js'), [], {
    stdio: 'inherit',
    env: process.env,
  });
  console.log(
    `${tag('supervisor', c.blue)} ${c.green('server started')} ${c.dim(`(pid=${child.pid})`)}`,
  );
}

function restartChild(reason = 'unknown') {
  if (!child) return startChild();

  console.log(
    `${tag('supervisor', c.blue)} ${c.yellow('restarting server')} ${c.dim(`(${reason})...`)}`,
  );

  child.kill('SIGTERM');

  setTimeout(() => startChild(), 300);
}

module.exports = { startChild, restartChild };
