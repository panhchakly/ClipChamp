const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const fs = require('fs');
const path = require('path');

// Set ffmpeg paths
const ffmpegPath = (typeof ffmpegStatic === 'string') ? ffmpegStatic : (ffmpegStatic && ffmpegStatic.path) || ffmpegStatic;
const ffprobePath = (typeof ffprobeStatic === 'string') ? ffprobeStatic : (ffprobeStatic && ffprobeStatic.path) || ffprobeStatic;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const tmpDir = path.resolve(__dirname, 'tmp');

class YouTubeRemaker {
  constructor() {
    // Ensure tmp directory exists
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  }

  async downloadVideo(url) {
    return new Promise((resolve, reject) => {
      const videoId = ytdl.getURLVideoID(url);
      const outputPath = path.join(tmpDir, `${videoId}.mp4`);
      const stream = ytdl(url, { quality: 'highestvideo' });

      stream.pipe(fs.createWriteStream(outputPath))
        .on('finish', () => resolve(outputPath))
        .on('error', reject);
    });
  }

  async remakeVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters([
          // Add multiple text overlays for disclaimer
          'drawtext=text=\'Remade for educational purposes\':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=h-th-10',
          'drawtext=text=\'Parody Remix - Not Original Content\':fontcolor=red:fontsize=18:x=10:y=10',
          'drawtext=text=\'Transformed and Modified\':fontcolor=yellow:fontsize=16:x=w-tw-10:y=h-th-50',
          // Add watermark
          'drawtext=text=\'Original Content\':fontcolor=blue:fontsize=14:x=10:y=h-50',
          // Apply color effects to alter appearance
          'colorbalance=rs=0.2:gs=-0.1:bs=0.1',
          // Add noise for distortion
          'noise=alls=20:allf=t+u',
          // Pixelate parts
          'boxblur=2:1',
          // Change speed (slow down to 0.8x)
          'setpts=1.25*PTS'
        ])
        .audioFilters([
          // Change audio speed to match video
          'atempo=0.8',
          // Add echo for modification
          'aecho=0.8:0.9:1000:0.3',
          // Normalize audio
          'loudnorm'
        ])
        .outputOptions('-c:v libx264', '-c:a aac', '-preset veryfast', '-crf 28')
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .run();
    });
  }

  async processYouTubeVideo(url, finalOutputPath) {
    try {
      console.log('Downloading video...');
      const downloadedPath = await this.downloadVideo(url);

      console.log('Remaking video...');
      const remadePath = await this.remakeVideo(downloadedPath, finalOutputPath);

      // Clean up downloaded file
      fs.unlinkSync(downloadedPath);

      console.log('Video remade successfully:', remadePath);
      return remadePath;
    } catch (error) {
      console.error('Error processing video:', error);
      throw error;
    }
  }
}

module.exports = YouTubeRemaker;