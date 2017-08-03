const fs = require('fs'),
  _ = require('lodash'),
  ffmpeg = require('fluent-ffmpeg'),
  Heap = require('heap')
const waveform = require('./streaming_waveform.js')

var threshold;

averageFrequency = function (frequencies) {
  let totalFrequency = 0;
  for (let i = 0; i < frequencies.length; i++) {
    totalFrequency += frequencies[i];
  }
  return totalFrequency / frequencies.length;
};

calculateThreshold = function (frequencies) {
  return averageFrequency(Heap.nsmallest(frequencies.filter(function (frequency) {
    return frequency > 0;
  }), frequencies.length / 2));
};

// Trims background noise from start and end of clip
trimClip = function (frequencies) {
  let start = 0;
  let end = frequencies.length;
  for (let i = 0; i < frequencies.length; i++) {
    if (frequencies[i] <= threshold) {
      start = i;
    } else {
      break;
    }
  }

  for (let i = frequencies.length - 1; i >= 0; i--) {
    if (frequencies[i] <= threshold) {
      end = i;
    } else {
      break;
    }
  }

  return {start, end}
};


generateSubclips = async function (splits, filepath, clipLength, callback) {
  let subclipPaths = [];
  let ffmpeg_instance = ffmpeg(filepath);

  if (!splits || !splits.length || splits.length === 0) {
    let splitPath = filepath.split('.');
    subclipPaths.push(splitPath[0] + `-0.` + splitPath[1]);
    await new Promise(function (resolve, reject) {
      ffmpeg_instance
        .output(splitPath[0] + `-0.` + splitPath[1])
        .on('error', function (err) {
          callback(err);
        })
        .on('end', function () {
          if (subclipPaths.length === splits.length + 1) {
            callback(null, subclipPaths);
          }
          return resolve();
        })
        .run();
    });
  }

  for (let i = -1; i < splits.length; i++) {
    let startTime, duration;

    if (i === -1) {
      startTime = 0;
      duration = splits[0];
    } else if (i === splits.length - 1) {
      startTime = splits[i];
      duration = clipLength - startTime;
    } else {
      startTime = splits[i];
      duration = splits[i + 1] - splits[i];
    }

    let splitPath = filepath.split('.');

    ffmpeg_instance
      .output(splitPath[0] + `-${i + 1}.` + splitPath[1])
      .seek(startTime)
      .setDuration(duration);

    subclipPaths.push(splitPath[0] + `-${i + 1}.` + splitPath[1]);

    if (i % 10 === 0 || i === splits.length - 1) {
      await new Promise(function (resolve, reject) {
        ffmpeg_instance
          .on('error', function (err) {
            callback(err);
          })
          .on('end', function () {
            if (subclipPaths.length === splits.length + 1) {
              callback(null, subclipPaths);
            }
            return resolve();
          })
          .run();
      });
      ffmpeg_instance = ffmpeg(filepath);
    }


  }

};

module.exports = function (params, callback) {
  let {filepath, minClipLength, maxClipLength} = params;
  minClipLength = minClipLength ? minClipLength : 5;
  maxClipLength = maxClipLength ? maxClipLength : (minClipLength + 5);
  callback = callback || function () {
    };

  if (minClipLength > maxClipLength) {
    callback('Minimum clip length cannot be greater than maximum clip length.');
  }

  ffmpeg(filepath).ffprobe(function (err, metadata) {
    if (err) {
      callback(err);
      return;
    }
    let clipLength = metadata.format.duration;
    let numOfSample = 5000;
    let samplesPerSecond = numOfSample / clipLength;
    let stepSize = samplesPerSecond / 10;

    // streaming version of this
    waveform(filepath, numOfSample).then((frequencies) => {
      if (err) {
        callback(err);
        return;
      }

      threshold = calculateThreshold(frequencies);

      // let {start, end} = trimClip(frequencies);
      let sampleSplits = [];
      let lastSplit = minClipLength * samplesPerSecond;
      let quietestSecond = minClipLength * samplesPerSecond;
      let quietestFreq = averageFrequency(frequencies.slice(quietestSecond, quietestSecond + stepSize));
      for (let i = minClipLength * samplesPerSecond; i + stepSize < frequencies.length - minClipLength * samplesPerSecond; i += stepSize) { // iterating through frequency space
        let segment = frequencies.slice(i, i + stepSize);
        let avgFreq = averageFrequency(segment);

        if (avgFreq <= threshold) {
          sampleSplits.push(i + stepSize / 2);
          lastSplit = i;
          i += minClipLength * samplesPerSecond;
          quietestSecond = i;
          quietestFreq = averageFrequency(frequencies.slice(i, i + stepSize));
        } else if ((i - lastSplit) > maxClipLength * samplesPerSecond) {
          sampleSplits.push(quietestSecond + stepSize / 2);
          lastSplit = quietestSecond;
          i = quietestSecond + minClipLength * samplesPerSecond;
          quietestSecond = i;
          quietestFreq = averageFrequency(frequencies.slice(i, i + stepSize));
        }

        if (avgFreq < quietestFreq) {
          quietestFreq = avgFreq;
          quietestSecond = i;
        }

      }
      let secondSplits = _.map(sampleSplits, (frequency) => {
        return (frequency / frequencies.length) * clipLength
      });
      generateSubclips(secondSplits, filepath, clipLength, function (err, subclipPaths) {
        if (err) {
          callback(err);
        } else {
          callback(null, subclipPaths);
        }
      })
    })

  });
};
