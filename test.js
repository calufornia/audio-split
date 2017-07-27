var Promise = require('bluebird');
var split = Promise.promisify(require('./index'));

const splitClip = Promise.coroutine(function*(filepath) {
  let paths = yield split({filepath});
  console.log(paths);
});

// splitClip('path/to/file.mp4'); // uncomment