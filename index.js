const fs        = require('fs'),
      _         = require('lodash'),
      waveform  = require('waveform-node'),
      ffmpeg    = require('fluent-ffmpeg'),
      Heap      = require('heap'),
      path      = require('path');

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

generateSubclips = function (splits, filepath, clipLength, callback) {
  let subclipsGenerated = 0;
  let subclipPaths = [];
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
    ffmpeg(path.join(__dirname, filepath))
      .setStartTime(startTime)
      .setDuration(duration)
      .output(splitPath[0] + `-${i + 1}.` + splitPath[1])
      .audioCodec('copy')

      .on('error', function (err) {
        callback(err);
      })
      .on('end', function () {
        subclipPaths.push(splitPath[0] + `-${i + 1}.` + splitPath[1]);
        if (++subclipsGenerated === splits.length + 1) {
          callback(null, subclipPaths);
        }
      })
      .run();
  }
};


module.exports = function (params, callback) {
  let {filepath, minClipLength} = params;
  ffmpeg(path.join(__dirname, filepath)).ffprobe( function (err, metadata) {
    if (err) {
      callback(err);
      return;
    }
    let clipLength = metadata.format.duration;
    if (clipLength < minClipLength) { // return original clip
      callback(null, [filepath]);
      return;
    }
    minClipLength = minClipLength ? minClipLength : 5;
    let numOfSample = 5000;
    let samplesPerSecond = numOfSample / clipLength;
    let stepSize = samplesPerSecond / 10;
    let options = { numOfSample };
    waveform.getWaveForm(path.join(__dirname, filepath), options, function (err, frequencies) {
      if (err) {
        callback(err);
        return;
      }

      threshold = calculateThreshold(frequencies);

      let {start, end} = trimClip(frequencies);
      let sampleSplits = [];
      for (let i = start + minClipLength * samplesPerSecond; i + stepSize < end - minClipLength * samplesPerSecond; i += stepSize) {
        let segment = frequencies.slice(i, i + stepSize);
        if (averageFrequency(segment) <= threshold) {
          sampleSplits.push(i + stepSize / 2);
          i += minClipLength * samplesPerSecond;
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
    });
  });
};