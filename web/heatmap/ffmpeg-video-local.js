/**
 * FFmpeg.wasm integration using LOCAL files (alternative to CDN)
 * Install first: cd web/heatmap && npm install
 * This will copy core files to ./ffmpeg-core/
 */

// FFmpeg.wasm instance (loaded on-demand)
let ffmpegInstance = null;
let ffmpegLoaded = false;

/**
 * Load FFmpeg.wasm from local node_modules
 * Requires: npm install in web/heatmap/
 */
export async function loadFFmpeg(statusCallback) {
  if (ffmpegLoaded && ffmpegInstance) {
    return ffmpegInstance;
  }

  if (statusCallback) {
    statusCallback('FFmpeg.wasm読み込み中... (ローカルファイル)');
  }

  try {
    // Import FFmpeg from local node_modules
    const { createFFmpeg } = await import('./node_modules/@ffmpeg/ffmpeg/dist/ffmpeg.min.js');

    if (!createFFmpeg) {
      throw new Error('createFFmpeg not found in local FFmpeg module');
    }

    // Use local core files (copied by post-install script)
    ffmpegInstance = createFFmpeg({
      log: true,
      mainName: 'main',
      corePath: './ffmpeg-core/ffmpeg-core.js',
    });

    const startTime = performance.now();

    // Set up detailed logging
    ffmpegInstance.setLogger(({ type, message }) => {
      console.log(`[FFmpeg ${type}]`, message);
    });

    await ffmpegInstance.load();
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ FFmpeg.wasm loaded from local files in ${elapsed}s`);

    ffmpegLoaded = true;
    return ffmpegInstance;

  } catch (error) {
    console.error('❌ FFmpeg.wasm loading failed (local):', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    console.error('💡 Did you run "npm install" in web/heatmap/?');
    throw new Error(`FFmpeg読み込み失敗（ローカル）: ${error.message}`);
  }
}

/**
 * Generate MP4 video from 3D grid using FFmpeg.wasm
 * (Same implementation as ffmpeg-video.js)
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

  console.log(`🎬 FFmpeg.wasm video generation (LOCAL): ${totalFrames} frames @ ${fps.toFixed(2)} FPS`);

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
 */
function forceGCHint() {
  if (typeof performance !== 'undefined' && performance.memory) {
    const temp = new Array(1000);
    temp.fill(null);
  }
}
