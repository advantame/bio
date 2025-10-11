/**
 * Post-install script to copy FFmpeg core files to accessible location
 * This ensures the WASM files can be loaded by the browser
 */

import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourceDir = join(__dirname, 'node_modules', '@ffmpeg', 'core', 'dist');
const targetDir = join(__dirname, 'ffmpeg-core');

// Create target directory if it doesn't exist
if (!existsSync(targetDir)) {
  mkdirSync(targetDir, { recursive: true });
}

// Copy core files
const filesToCopy = [
  'ffmpeg-core.js',
  'ffmpeg-core.wasm',
  'ffmpeg-core.worker.js'
];

console.log('📦 Copying FFmpeg core files...');

filesToCopy.forEach(file => {
  const source = join(sourceDir, file);
  const target = join(targetDir, file);

  if (existsSync(source)) {
    copyFileSync(source, target);
    console.log(`✅ Copied: ${file}`);
  } else {
    console.warn(`⚠️  Not found: ${file}`);
  }
});

console.log('✅ FFmpeg core files copied to ./ffmpeg-core/');
