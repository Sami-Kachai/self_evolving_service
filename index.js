const express = require('express');
const fs = require('fs');
const app = express();
const serverPort = process.env.PORT || 3000;

app.use(express.json());

function logError(err) {
  fs.appendFileSync('app.log', err.stack + '\n');
}

app.post('/parse', (req, res) => {
  try {
    const data = req.body.data;
    const upper = data.toUpperCase(); // This will trigger a typeError if {data} is not a string
    res.send({ result: upper });
  } catch (err) {
    logError(err);
    res.status(500).send({ error: 'Something went wrong' });
  }
});

function startServer() {
  app.listen(serverPort, () =>
    console.log(`Server running on port ${serverPort}`),
  );
}

module.exports = { startServer };
