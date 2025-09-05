'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');

/**
 * Recursively find all PNG/JPG/JPEG files under a directory.
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function findRasterImagesRecursively(directory) {
  /** @type {string[]} */
  const results = [];
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findRasterImagesRecursively(fullPath);
      results.push(...nested);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * Ensure a directory exists.
 * @param {string} directoryPath
 */
async function ensureDirectory(directoryPath) {
  await fs.promises.mkdir(directoryPath, { recursive: true });
}

/**
 * Convert a raster image to WebP at target path.
 * Skips conversion if target exists and is newer than source, unless force = true.
 * @param {string} sourcePath
 * @param {string} targetPath
 * @param {{ quality: number, force: boolean }} options
 */
async function convertToWebp(sourcePath, targetPath, options) {
  const { quality, force } = options;

  const targetDir = path.dirname(targetPath);
  await ensureDirectory(targetDir);

  if (!force) {
    try {
      const [srcStat, tgtStat] = await Promise.all([
        fs.promises.stat(sourcePath),
        fs.promises.stat(targetPath)
      ]);
      if (tgtStat.mtimeMs >= srcStat.mtimeMs) {
        return { converted: false, reason: 'up-to-date' };
      }
    } catch (err) {
      // If target doesn't exist, proceed; any other error will be thrown by sharp if relevant.
    }
  }

  await sharp(sourcePath)
    .webp({ quality })
    .toFile(targetPath);

  return { converted: true };
}

/**
 * Simple promise pool to limit concurrency.
 * @template T
 * @param {number} limit
 * @param {Array<() => Promise<T>>} tasks
 * @returns {Promise<T[]>}
 */
async function runWithConcurrency(limit, tasks) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (true) {
      const current = index++;
      if (current >= tasks.length) break;
      const task = tasks[current];
      results[current] = await task();
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const repoRoot = process.cwd();
  const sourceRoot = path.join(repoRoot, 'matrix-reasoning', 'assets');
  const targetRoot = path.join(repoRoot, 'webp-assets', 'matrix-reasoning', 'assets');

  // CLI options: --quality=90 --force --concurrency=8
  const argv = process.argv.slice(2);
  const qualityArg = argv.find(a => a.startsWith('--quality='));
  const concurrencyArg = argv.find(a => a.startsWith('--concurrency='));
  const force = argv.includes('--force');
  const quality = qualityArg ? Math.max(1, Math.min(100, parseInt(qualityArg.split('=')[1], 10) || 90)) : 90;
  const concurrency = concurrencyArg ? Math.max(1, parseInt(concurrencyArg.split('=')[1], 10) || os.cpus().length) : os.cpus().length;

  // Verify source exists
  try {
    const stat = await fs.promises.stat(sourceRoot);
    if (!stat.isDirectory()) {
      console.error(`Source path is not a directory: ${sourceRoot}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Source path does not exist: ${sourceRoot}`);
    process.exit(1);
  }

  console.log(`Scanning for PNG/JPEG under: ${sourceRoot}`);
  const files = await findRasterImagesRecursively(sourceRoot);
  if (files.length === 0) {
    console.log('No PNG/JPEG files found. Nothing to convert.');
    return;
  }

  console.log(`Found ${files.length} raster files. Converting to WebP with quality=${quality}, concurrency=${concurrency}${force ? ', force=true' : ''}.`);

  let convertedCount = 0;
  let skippedCount = 0;

  const tasks = files.map((sourcePath) => async () => {
    const relative = path.relative(sourceRoot, sourcePath);
    const targetPath = path.join(targetRoot, relative).replace(/\.(png|jpg|jpeg)$/i, '.webp');
    try {
      const result = await convertToWebp(sourcePath, targetPath, { quality, force });
      if (result.converted) {
        convertedCount++;
        if (convertedCount % 25 === 0) {
          console.log(`Converted ${convertedCount}/${files.length}...`);
        }
      } else {
        skippedCount++;
      }
    } catch (err) {
      console.error(`Failed to convert: ${sourcePath} -> ${targetPath}`);
      console.error(err && err.message ? err.message : err);
    }
  });

  await runWithConcurrency(concurrency, tasks);

  console.log(`Done. Converted: ${convertedCount}, Skipped: ${skippedCount}, Total considered: ${files.length}.`);
  console.log(`Output root: ${targetRoot}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


