const ytdl = require('yt-dlp-exec');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Set ffmpeg paths
const ffmpegPath = (typeof ffmpegStatic === 'string') ? ffmpegStatic : (ffmpegStatic && ffmpegStatic.path) || ffmpegStatic;
const ffprobePath = (typeof ffprobeStatic === 'string') ? ffprobeStatic : (ffprobeStatic && ffprobeStatic.path) || ffprobeStatic;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const tmpDir = path.resolve(os.tmpdir(), 'clipchamp-tmp');

class YouTubeRemaker {
  constructor() {
    // Ensure tmp directory exists outside OneDrive to avoid Windows file lock/rename issues
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  }

  async downloadVideo(url) {
    const videoId = (() => {
      try {
        const parsed = new URL(url);
        return parsed.searchParams.get('v') || parsed.pathname.slice(parsed.pathname.lastIndexOf('/') + 1) || `${Date.now()}`;
      } catch (err) {
        return `${Date.now()}`;
      }
    })();

    const baseName = `yt-${videoId}-${Date.now()}`;
    const outputTemplate = path.join(tmpDir, `${baseName}.%(ext)s`);
    const outputPath = path.join(tmpDir, `${baseName}.mp4`);
    const tempPath = `${outputPath}.temp.mp4`;

    for (const stale of [outputPath, tempPath]) {
      if (fs.existsSync(stale)) {
        try {
          fs.unlinkSync(stale);
        } catch (cleanupErr) {
          console.warn(`Could not remove stale file ${stale}:`, cleanupErr.message || cleanupErr);
        }
      }
    }

    try {
      await ytdl(url, {
        output: outputTemplate,
        format: 'bestvideo+bestaudio/best',
        mergeOutputFormat: 'mp4',
        ffmpegLocation: ffmpegPath,
        quiet: true,
        noWarnings: true,
        restrictFilenames: true,
      });

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        throw new Error(`Downloaded file not found or empty after yt-dlp execution: ${outputPath}`);
      }
    } catch (error) {
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (cleanupErr) {
          console.warn('Failed to clean up partial temp file:', cleanupErr.message || cleanupErr);
        }
      }
      throw new Error(`YouTube download failed: ${error.message || error}`);
    }
    return outputPath;
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
        .outputOptions(['-c:v', 'libx264', '-c:a', 'aac', '-preset', 'veryfast', '-crf', '28'])
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