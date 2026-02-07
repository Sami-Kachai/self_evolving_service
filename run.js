require('dotenv').config();
const { startChild, restartChild } = require('./supervisor');
const { watchLogs } = require('./watcher');

startChild();
watchLogs({
  onPatched: () => restartChild('patch applied'),
});
