# audio-split
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
  path: 'path/to/file.mp4',
  minClipLength: 5
});
```

## Parameters

- `path` (String, required)
- `minClipLength` (float, optional)
