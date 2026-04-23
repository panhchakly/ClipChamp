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
          // Add text overlay for disclaimer
          'drawtext=text=\'Remade for educational purposes\':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=h-th-10',
          // Add watermark
          'drawtext=text=\'Original Content\':fontcolor=red:fontsize=18:x=10:y=10',
          // Change speed (slow down to 0.8x)
          'setpts=1.25*PTS'
        ])
        .audioFilters([
          // Change audio speed to match video
          'atempo=0.8'
        ])
        .outputOptions('-c:v libx264', '-c:a aac')
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