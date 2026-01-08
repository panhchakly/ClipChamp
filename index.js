const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
// Resolve path strings for ffmpeg/ffprobe (some packages export an object with a .path property)
const ffmpegPath = (typeof ffmpegStatic === 'string') ? ffmpegStatic : (ffmpegStatic && ffmpegStatic.path) || ffmpegStatic;
const ffprobePath = (typeof ffprobeStatic === 'string') ? ffprobeStatic : (ffprobeStatic && ffprobeStatic.path) || ffprobeStatic;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
console.log('FFmpeg path:', ffmpegPath);
console.log('FFprobe path:', ffprobePath);

const fs = require('fs');
const path = require('path');
const tmpDir = path.resolve(__dirname, 'tmp');

// Ensure temporary directory exists
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// Basic check that ffmpeg binary exists and is executable (best effort across platforms)
if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
  console.warn('Warning: ffmpeg binary not found at configured path:', ffmpegPath);
} else {
  try {
    fs.accessSync(ffmpegPath, fs.constants.X_OK);
  } catch (err) {
    console.warn('Warning: ffmpeg binary exists but may not be executable:', ffmpegPath);
  }
}


// Merge two videos
function mergeVideos(videoPaths, outputPath) {
  return new Promise((resolve, reject) => {
    // Basic validation to catch invalid input early
    if (!Array.isArray(videoPaths) || videoPaths.length < 2) return reject(new TypeError('videoPaths must be an array of at least two file paths'));
    if (typeof videoPaths[0] !== 'string' || typeof videoPaths[1] !== 'string') return reject(new TypeError('videoPaths elements must be strings'));

    // Resolve absolute paths and ensure input files exist
    const inputs = [path.resolve(videoPaths[0]), path.resolve(videoPaths[1])];
    for (const p of inputs) {
      try {
        const st = fs.statSync(p);
        if (!st.isFile()) return reject(new Error(`Input path is not a file: ${p}`));
      } catch (err) {
        return reject(new Error(`Input file not found: ${p}`));
      }
    }

    const outputResolved = path.resolve(outputPath);

    // Collect stderr lines so we can show a helpful excerpt on failure
    const stderrLines = [];
    const maxStderrLines = 200;

    // Use ffprobe on the first video to get a target resolution, then scale/pad both inputs
    ffmpeg.ffprobe(inputs[0], (probeErr, probeData) => {
      if (probeErr) return reject(probeErr);
      const vstream = (probeData.streams || []).find(s => s.codec_type === 'video');
      if (!vstream) return reject(new Error('No video stream found in first input'));
      const targetW = vstream.width;
      const targetH = vstream.height;

      // Build a complex filter: scale+pad both inputs to target W/H, set SAR, then concat
      const filter = [
        {filter: 'scale', options: `${targetW}:${targetH}:force_original_aspect_ratio=decrease`, inputs: '0:v', outputs: 'v0s'},
        {filter: 'pad', options: `${targetW}:${targetH}:-1:-1:color=black`, inputs: 'v0s', outputs: 'v0'},
        {filter: 'scale', options: `${targetW}:${targetH}:force_original_aspect_ratio=decrease`, inputs: '1:v', outputs: 'v1s'},
        {filter: 'pad', options: `${targetW}:${targetH}:-1:-1:color=black`, inputs: 'v1s', outputs: 'v1'},
        {filter: 'setsar', options: '1', inputs: 'v0', outputs: 'v0r'},
        {filter: 'setsar', options: '1', inputs: 'v1', outputs: 'v1r'},
        {filter: 'concat', options: {n: 2, v: 1, a: 0}, inputs: ['v0r', 'v1r'], outputs: 'outv'}
      ];

      ffmpeg()
        .input(inputs[0])
        .input(inputs[1])
        .complexFilter(filter)
        .outputOptions(['-map', '[outv]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-y'])
        .on('start', (cmdLine) => console.log('FFmpeg command:', cmdLine))
        .on('stderr', (line) => {
          const text = (typeof line === 'string') ? line : JSON.stringify(line);
          stderrLines.push(text);
          if (stderrLines.length > maxStderrLines) stderrLines.shift();
          console.error('ffmpeg stderr:', text);
        })
        .on('progress', (p) => console.log('ffmpeg progress:', p))
        .on('error', (err, stdout, stderr) => {
          const lastStderr = stderrLines.slice(-50).join('\n');
          const codeInfo = (err && err.code) ? ` (code=${err.code})` : '';
          const message = `FFmpeg failed${codeInfo}: ${err && err.message ? err.message : 'Unknown error'}\nLast ffmpeg stderr output:\n${lastStderr}`;
          const newErr = new Error(message);
          newErr.original = err;
          console.error(message);
          return reject(newErr);
        })
        .on('end', () => resolve(outputResolved))
        .save(outputResolved);
    });
  });

}

// Trim/cut video
function trimVideo(inputPath, startTime, duration, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startTime) // format: '00:01:23'
      .duration(duration)      // in seconds
      .on('error', reject)
      .on('end', () => resolve(outputPath))
      .save(outputPath);
  });
}

// Add audio to video
function addAudio(videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .addInput(audioPath)
      .outputOptions('-c:v copy')
      .outputOptions('-map 0:v:0 -map 1:a:0')
      .on('error', reject)
      .on('end', () => resolve(outputPath))
      .save(outputPath);
  });
}

// Burn subtitles into video
function burnSubtitles(videoPath, subtitlePath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        `-vf subtitles=${subtitlePath}`
      ])
      .on('error', reject)
      .on('end', () => resolve(outputPath))
      .save(outputPath);
  });
}

// Overlay image on video
function overlayImage(videoPath, imagePath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .input(imagePath)
      .complexFilter([
        '[0:v][1:v] overlay=10:10'
      ])
      .on('error', reject)
      .on('end', () => resolve(outputPath))
      .save(outputPath);
  });
}

// Example usage
(async () => {
  try {
    // Merge Videos (example)
    const sampleInputs = ['video1.mp4', 'video2.mp4'];
    if (sampleInputs.every(p => fs.existsSync(path.resolve(p)))) {
      await mergeVideos(sampleInputs, 'merged.mp4');
    } else {
      console.warn('Sample input files not found. To test merge, add video1.mp4 and video2.mp4 to the project root.');
    }
    
    // Trim Video
    // await trimVideo('input.mp4', '00:00:10', 15, 'trimmed.mp4');
    
    // Add audio
    // await addAudio('input.mp4', 'audio.mp3', 'with_audio.mp4');

    // Burn subtitles
    // await burnSubtitles('input.mp4', 'subs.srt', 'with_subs.mp4');

    // Overlay Image
    // await overlayImage('input.mp4', 'logo.png', 'with_overlay.mp4');

    console.log('All tasks finished!');
  } catch (err) {
    console.error('Error during processing:', err);
  }
})();