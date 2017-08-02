var Promise = require('bluebird');
var split = Promise.promisify(require('./index'));

const splitClip = Promise.coroutine(function*(filepath) {
  let paths;
  try {
    paths = yield split({filepath});
  } catch (e) {
    console.log(e);
    return;
  }
  console.log(paths);
});

// splitClip('path/to/file.mp3'); // uncomment