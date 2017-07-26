# audio-split
[![NPM](https://nodei.co/npm/audio-split.png?compact=true)](https://npmjs.org/package/audio-split)

Slice audio file into subclips

## Requirements
* ffmpeg
## Installation

```
npm install audio-split
```

## Usage

```node
var split = require('audio-split');

split({
  filepath: 'path/to/file.mp4',
  minClipLength: 5
});
```

## Parameters

- `filepath` (String, required)
- `minClipLength` (float, optional, default 5)
