var _ = require('lodash');
var waveform = require('waveform-node');
var ffmpeg = require('fluent-ffmpeg');
var Heap = require('heap');

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
  }), 2500));
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

generateSubclips = function (splits, path, clipLength, callback) {
  let subclipsGenerated = 0;
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
    let splitPath = path.split('.');
    ffmpeg(__dirname + '/' + path)
      .setStartTime(startTime)
      .setDuration(duration)
      .output(splitPath[0] + `-${i + 1}.` + splitPath[1])
      .audioCodec('copy')

      .on('error', function (err) {
        console.log('An error occurred: ' + err.message);
      })
      .on('end', function () {
        if (++subclipsGenerated === splits.length + 1) {
          callback(null, subclipsGenerated);
        }
      })
      .run();
  }
};


module.exports = function (params) {
  let {path, minClipLength} = params;

  ffmpeg.ffprobe(__dirname + '/' + path, function (err, metadata) {
    let clipLength = metadata.format.duration;
    minClipLength = minClipLength ? minClipLength : 5
    let numOfSample = 5000;
    let samplesPerSecond = numOfSample / clipLength;
    let stepSize = samplesPerSecond / 10;
    let options = {numOfSample};
    waveform.getWaveForm(__dirname + '/' + path, options, function (error, frequencies) {
      if (error) {
        console.log(error);
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
      let secondSplits = _.map(sampleSplits, (freq) => {
          return (freq / frequencies.length) * clipLength
    })
      generateSubclips(secondSplits, path, clipLength, function (err, subclipsGenerated) {
        if (err) {
          console.log(err);
        } else {
          console.log(`Generated ${subclipsGenerated} subclips`);
          return subclipsGenerated;
        }
      })
    });
  });
};