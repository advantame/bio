/**
 * FFmpeg.wasm integration for high-precision MP4 video generation
 * Memory-optimized implementation using IndexedDB streaming
 */

// FFmpeg.wasm instance (loaded on-demand)
let ffmpegInstance = null;
let ffmpegLoaded = false;

/**
 * Load FFmpeg.wasm script dynamically (one-time initialization)
 * Uses script tag injection since dynamic import doesn't work with UMD builds
 */
async function loadFFmpegScript() {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.FFmpeg) {
      resolve(window.FFmpeg);
      return;
    }

    // Create script tag
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js';
    script.crossOrigin = 'anonymous';

    script.onload = () => {
      if (window.FFmpeg && window.FFmpeg.createFFmpeg) {
        resolve(window.FFmpeg);
      } else {
        reject(new Error('FFmpeg loaded but createFFmpeg not found'));
      }
    };

    script.onerror = () => {
      reject(new Error('Failed to load FFmpeg.wasm script'));
    };

    document.head.appendChild(script);
  });
}

/**
 * Load FFmpeg.wasm library (one-time initialization)
 */
export async function loadFFmpeg(statusCallback) {
  if (ffmpegLoaded && ffmpegInstance) {
    return ffmpegInstance;
  }

  if (statusCallback) {
    statusCallback('FFmpeg.wasm読み込み中... (初回のみ、25MB)');
  }

  try {
    // Load FFmpeg.wasm script via script tag (UMD global)
    const FFmpeg = await loadFFmpegScript();
    const { createFFmpeg } = FFmpeg;

    if (!createFFmpeg) {
      throw new Error('createFFmpeg not found in FFmpeg global');
    }

    // Use single-threaded core to avoid SharedArrayBuffer requirement
    // Multi-threaded version requires Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers
    ffmpegInstance = createFFmpeg({
      log: true,
      corePath: 'https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js',
    });

    const startTime = performance.now();
    await ffmpegInstance.load();
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ FFmpeg.wasm loaded in ${elapsed}s`);

    ffmpegLoaded = true;
    return ffmpegInstance;

  } catch (error) {
    console.error('FFmpeg.wasm loading failed:', error);
    throw new Error(`FFmpeg読み込み失敗: ${error.message}`);
  }
}

/**
 * Generate MP4 video from 3D grid using FFmpeg.wasm
 * Memory-optimized: streams frames from IndexedDB one at a time
 *
 * @param {Array} frames - Frame metadata (frameIndex, tVal)
 * @param {FrameStorage} storage - IndexedDB storage instance
 * @param {Object} gridContext - Grid parameters (nx, ny, xMin, xMax, etc.)
 * @param {number} videoDuration - Video length in seconds
 * @param {HTMLCanvasElement} canvas - Canvas for rendering
 * @param {Function} drawFrameCallback - Function to draw single frame
 * @param {Function} statusCallback - Status update callback
 * @returns {Promise<Blob>} - MP4 video blob
 */
export async function generateMP4WithFFmpeg(
  frames,
  storage,
  gridContext,
  videoDuration,
  canvas,
  drawFrameCallback,
  statusCallback
) {
  const totalFrames = frames.length;
  const fps = totalFrames / videoDuration;

  console.log(`🎬 FFmpeg.wasm video generation: ${totalFrames} frames @ ${fps.toFixed(2)} FPS`);

  // Memory usage tracking
  const memoryLog = [];

  function logMemory(label) {
    if (performance.memory) {
      const usedMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1);
      const totalMB = (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1);
      memoryLog.push({ label, usedMB, totalMB });
      console.log(`📊 Memory (${label}): ${usedMB} MB used / ${totalMB} MB total`);
    }
  }

  logMemory('start');

  // Step 1: Load FFmpeg.wasm
  const ffmpeg = await loadFFmpeg(statusCallback);

  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }

  logMemory('ffmpeg_loaded');

  try {
    // Step 2: Compute global min/max using streaming
    if (statusCallback) {
      statusCallback('グローバル範囲を計算中...');
    }

    const range = await storage.computeGlobalRange(totalFrames);
    const { globalMin, globalMax } = range;

    logMemory('range_computed');

    // Step 3: Stream frames from IndexedDB and write as PNG to FFmpeg's virtual filesystem
    if (statusCallback) {
      statusCallback(`フレーム書き込み中... 0/${totalFrames}`);
    }

    for (let i = 0; i < totalFrames; i++) {
      // Load frame from IndexedDB (disk → memory)
      const { grid, tVal } = await storage.getFrame(i);

      // Draw frame to canvas
      drawFrameCallback(
        grid,
        gridContext.nx,
        gridContext.ny,
        gridContext.xMin,
        gridContext.xMax,
        gridContext.yMin,
        gridContext.yMax,
        gridContext.xLabel,
        gridContext.yLabel,
        globalMin,
        globalMax,
        gridContext.metricUnit,
        gridContext.tLabel,
        gridContext.tMin,
        gridContext.tMax,
        tVal,
        i,
        totalFrames
      );

      // Canvas → Blob → Uint8Array
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1.0));
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Write to FFmpeg's virtual filesystem
      const filename = `frame${i.toString().padStart(4, '0')}.png`;
      ffmpeg.FS('writeFile', filename, uint8Array);

      // Explicitly clear grid to help GC
      grid.fill(0);

      // Update progress
      if (i % 10 === 0 || i === totalFrames - 1) {
        if (statusCallback) {
          const progress = Math.floor(((i + 1) / totalFrames) * 100);
          statusCallback(`フレーム書き込み中... ${i + 1}/${totalFrames} (${progress}%)`);
        }

        logMemory(`frame_${i}`);

        // Hint garbage collection every 10 frames
        forceGCHint();

        // Yield to UI thread
        await new Promise(r => setTimeout(r, 0));
      }
    }

    console.log('📊 Memory usage during frame writing:', memoryLog.slice(-5));

    logMemory('frames_written');

    // Step 4: Encode video with FFmpeg
    if (statusCallback) {
      statusCallback('MP4エンコード中...');
    }

    console.log(`🎬 Encoding ${totalFrames} frames @ ${fps.toFixed(2)} FPS...`);

    await ffmpeg.run(
      '-framerate', fps.toString(),        // Input framerate (precise)
      '-i', 'frame%04d.png',               // Input file pattern
      '-c:v', 'libx264',                   // H.264 codec
      '-pix_fmt', 'yuv420p',               // Pixel format (compatibility)
      '-crf', '18',                        // Quality (18 = high, 23 = default, 51 = worst)
      '-preset', 'medium',                 // Encoding speed (ultrafast/fast/medium/slow)
      '-movflags', 'faststart',            // Web optimization (metadata at start)
      '-r', fps.toString(),                // Output framerate (CFR guaranteed)
      'output.mp4'
    );

    logMemory('encoded');

    // Step 5: Read output file
    const data = ffmpeg.FS('readFile', 'output.mp4');
    const videoBlob = new Blob([data.buffer], { type: 'video/mp4' });

    const fileSizeMB = (data.length / 1024 / 1024).toFixed(2);
    console.log(`✅ Video generated: ${fileSizeMB} MB (${totalFrames} frames @ ${fps.toFixed(2)} FPS)`);

    // Step 6: Cleanup FFmpeg's virtual filesystem
    if (statusCallback) {
      statusCallback('メモリクリーンアップ中...');
    }

    for (let i = 0; i < totalFrames; i++) {
      const filename = `frame${i.toString().padStart(4, '0')}.png`;
      try {
        ffmpeg.FS('unlink', filename);
      } catch (e) {
        // File might not exist, ignore
      }

      // Batch cleanup status updates
      if (i % 50 === 0 && statusCallback) {
        statusCallback(`メモリクリーンアップ中... ${i}/${totalFrames}`);
      }
    }

    try {
      ffmpeg.FS('unlink', 'output.mp4');
    } catch (e) {}

    logMemory('cleanup_done');

    // Final GC hint
    forceGCHint();

    console.log('📊 Final memory stats:', memoryLog[memoryLog.length - 1]);

    return videoBlob;

  } catch (error) {
    console.error('FFmpeg encoding failed:', error);

    // Attempt cleanup on error
    try {
      for (let i = 0; i < totalFrames; i++) {
        const filename = `frame${i.toString().padStart(4, '0')}.png`;
        try {
          ffmpeg.FS('unlink', filename);
        } catch (e) {}
      }
    } catch (e) {}

    throw new Error(`MP4生成エラー: ${error.message}`);
  }
}

/**
 * Force garbage collection hint
 * (copied from heatmap.js for consistency)
 */
function forceGCHint() {
  if (typeof performance !== 'undefined' && performance.memory) {
    const temp = new Array(1000);
    temp.fill(null);
  }
}
