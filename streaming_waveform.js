/* Derived from waveform-node package. */

var Promise = require('bluebird');
var fs = require('fs');
var _ = require('lodash')
var spawn = require('child_process').spawn;

var log_10 = function(arg){
    return Math.log(arg) / Math.LN10;
}
var coefficient_to_db = function(coeff){
	return 20.0 * log_10(coeff);
}
var log_meter = function(power, lower_db, upper_db, non_linearity){
	if(power < lower_db){
		return 0;
	}
    else{
      return Math.pow((power - lower_db) / (upper_db - lower_db), non_linearity);
  	}
}
var alt_log_meter = function(power){
	return log_meter(power, -192.0, 0.0, 8.0);
}

var waveformTypeEnum = {
	STACK: 0,
	LINE: 1
}

module.exports = Promise.coroutine(function*(filepath, numOfSample) {

  const totalSamples = yield new Promise(function(resolve, reject) {
    var outputStr = '';
    var oddByte = null;
    var gotData = false;
    var samples = [];
    var channel = 0;
    var total = 0;
    var ffmpeg = spawn('ffmpeg', ['-i', filepath, '-f','s16le', '-acodec','pcm_s16le','-y','pipe:1']);
    ffmpeg.stdout.on('data', function(data){
      gotData = true;
      var value;
      var i = 0;
      var dataLen = data.length;

      // If there is a leftover byte from the previous block, combine it with the
      // first byte from this block
      if (oddByte !== null) {
        value = ((data.readInt8(i++, true) << 8) | oddByte) / 32767.0;
        //samples.push(value);
        total += 1
        channel = ++channel % 2;
      }

      for (; i < dataLen; i += 2) {
        value = data.readInt16LE(i, true) / 32767.0;
        //samples.push(value);
        total += 1
        channel = ++channel % 2;
      }


      oddByte = (i < dataLen) ? data.readUInt8(i, true) : null;
    });

    ffmpeg.stderr.on('data', function(data) {
      // Text info from ffmpeg is output to stderr
      //outputStr += data.toString();
    });

    ffmpeg.stderr.on('end', function() {
      if (gotData) {
        resolve(total)
      }
      resolve(0)
    });
  });


	var samplesPerPeak = Math.ceil(totalSamples / numOfSample);

  const frequencies = yield new Promise(function(resolve, reject) {
    var outputStr = '';
    var oddByte = null;
    var gotData = false;
    var samples = [];
    var channel = 0;
    var total = 0;

    var partialMax = 0;
    var sampleIdx = 0;
    var peaks = [];
    var currMax = 0;
    var ffmpeg = spawn('ffmpeg', ['-i', filepath,'-f','s16le', '-acodec','pcm_s16le','-y','pipe:1']);
    ffmpeg.stdout.on('data', function(data){
      gotData = true;
      var value;
      var i = 0;
      var dataLen = data.length;

      // If there is a leftover byte from the previous block, combine it with the
      // first byte from this block
      if (oddByte !== null) {
        value = ((data.readInt8(i++, true) << 8) | oddByte) / 32767.0;
        samples.push(value);

        var absVal = Math.abs(value);
        if(absVal > partialMax){
          partialMax = absVal;
        }
        if(sampleIdx >= samplesPerPeak){
          var currMax = alt_log_meter(coefficient_to_db(partialMax));
          peaks.push(currMax);
          samples = []
          sampleIdx = 0;
          partialMax = 0;
        }
        sampleIdx++;

        channel = ++channel % 2;
      }

      for (; i < dataLen; i += 2) {
        value = data.readInt16LE(i, true) / 32767.0;
        samples.push(value);

        var absVal = Math.abs(value);
        sampleIdx++;
        if(absVal > partialMax){
          partialMax = absVal;
        }

        if(sampleIdx >= samplesPerPeak){
          var currMax = alt_log_meter(coefficient_to_db(partialMax));
          peaks.push(currMax);
          samples = []
          sampleIdx = 0;
          partialMax = 0;
        }
        channel = ++channel % 2;
      }

      oddByte = (i < dataLen) ? data.readUInt8(i, true) : null;
    });

    ffmpeg.stderr.on('data', function(data) {
      // Text info from ffmpeg is output to stderr
      //outputStr += data.toString();
    });

    ffmpeg.stderr.on('end', function() {
      resolve(peaks)
    });
  });
  return frequencies
})
