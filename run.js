
const { startServer } = require('./index');
const { watchLogs } = require('./watcher');

startServer();
watchLogs();
