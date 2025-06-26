const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('./config');

// Function to get image dimensions using Sharp
async function getImageDimensions(imagePath) {
  try {
    const metadata = await sharp(imagePath).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format
    };
  } catch (error) {
    console.warn(`Failed to get dimensions for ${imagePath}:`, error.message);
    return {
      width: null,
      height: null,
      format: null
    };
  }
}

// Function to find all high-resolution images (PNG from original dirs + high-res JPEG/PNG from specific dirs)
async function findHighResolutionImages(dir = '.') {
  const images = [];
  
  // 1. Scan for PNG files in original directories (existing logic)
  function scanOriginalDirectories(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        if (entry.name === 'original') {
          // Found an original directory, scan for PNG files
          const originalDir = fullPath;
          const pngFiles = fs.readdirSync(originalDir)
            .filter(file => file.toLowerCase().endsWith('.png'));
          
          for (const pngFile of pngFiles) {
            const imagePath = path.join(originalDir, pngFile);
            const stats = fs.statSync(imagePath);
            
            // Extract task name from the path
            const pathParts = originalDir.split(path.sep);
            const taskName = pathParts[pathParts.length - 2]; // Parent directory of 'original'
            
            images.push({
              filename: pngFile,
              taskName: taskName,
              relativePath: path.relative('.', imagePath),
              imagePath: imagePath,
              size: stats.size,
              lastModified: stats.mtime.toISOString(),
              source: 'original-directory'
            });
          }
        } else if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'image-gallery') {
          // Continue scanning other directories (but skip hidden dirs, node_modules, and our app)
          scanOriginalDirectories(fullPath);
        }
      }
    }
  }
  
  // 2. Add high-resolution images from specific directories
  async function addHighResFromDirectory(dirName, extensions = ['.jpg', '.jpeg', '.png']) {
    const dirPath = path.join(dir, dirName);
    if (!fs.existsSync(dirPath)) return;
    
    console.log(`Scanning ${dirName} for high-resolution images...`);
    
    function getAllFiles(currentDir, files = []) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          getAllFiles(fullPath, files);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
      
      return files;
    }
    
    const allFiles = getAllFiles(dirPath);
    let highResCount = 0;
    
    for (const filePath of allFiles) {
      try {
        const dimensions = await getImageDimensions(filePath);
        
        // Only include high-resolution images (>=1000px width)
        if (dimensions.width >= 1000) {
          const stats = fs.statSync(filePath);
          
          images.push({
            filename: path.basename(filePath),
            taskName: dirName,
            relativePath: path.relative('.', filePath),
            imagePath: filePath,
            size: stats.size,
            lastModified: stats.mtime.toISOString(),
            source: 'high-resolution-scan'
          });
          
          highResCount++;
        }
      } catch (err) {
        // Skip files that can't be processed
      }
    }
    
    console.log(`  Found ${highResCount} high-resolution images in ${dirName}`);
  }
  
  // Start scanning
  scanOriginalDirectories(dir);
  
  // Add high-resolution images from specific directories
  await addHighResFromDirectory('emotion-recognition', ['.jpg', '.jpeg']);
  await addHighResFromDirectory('theory-of-mind', ['.jpg', '.jpeg']);
  await addHighResFromDirectory('hearts-and-flowers', ['.png']);
  
  // Get dimensions for all images
  console.log(`\nExtracting image dimensions for ${images.length} images...`);
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    
    // Skip dimension extraction if we already have it from high-res scan
    if (image.source === 'high-resolution-scan') {
      const dimensions = await getImageDimensions(image.imagePath);
      images[i] = {
        ...image,
        width: dimensions.width,
        height: dimensions.height,
        format: dimensions.format
      };
    } else {
      // Original directory images
      const dimensions = await getImageDimensions(image.imagePath);
      images[i] = {
        ...image,
        width: dimensions.width,
        height: dimensions.height,
        format: dimensions.format
      };
    }
    
    delete images[i].imagePath; // Remove the local path
    delete images[i].source; // Remove the source indicator
    
    if ((i + 1) % 50 === 0) {
      console.log(`Processed ${i + 1}/${images.length} images...`);
    }
  }
  
  return images;
}

// Function to generate GitHub URLs for images
function generateGitHubUrls(images) {
  const githubBaseUrl = config.github.baseUrl;
  return images.map(image => ({
    ...image,
    publicPath: `${githubBaseUrl}/${image.relativePath}`,
    githubUrl: `${githubBaseUrl}/${image.relativePath}`
  }));
}

// Main execution
async function main() {
  console.log('Scanning for high-resolution images...');
  console.log('- PNG files from "original" directories');
  console.log('- High-resolution JPEG files from emotion-recognition');
  console.log('- High-resolution JPEG files from theory-of-mind');
  console.log('- High-resolution PNG files from hearts-and-flowers');
  console.log('');
  
  const images = await findHighResolutionImages();

  console.log(`\nFound ${images.length} high-resolution images across ${[...new Set(images.map(img => img.taskName))].length} tasks`);

  // Generate GitHub URLs for images
  const imagesWithGitHubUrls = generateGitHubUrls(images);

  // Analyze resolutions
  const resolutionAnalysis = analyzeResolutions(imagesWithGitHubUrls);

  // Generate metadata JSON
  const metadata = {
    totalImages: imagesWithGitHubUrls.length,
    tasks: [...new Set(imagesWithGitHubUrls.map(img => img.taskName))].sort(),
    images: imagesWithGitHubUrls,
    resolutionAnalysis: resolutionAnalysis
  };

  // Write metadata to Vue app public folder
  const metadataPath = path.join('image-gallery', 'public', 'imageMetadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`Metadata written to: ${metadataPath}`);

  console.log('Done! Image gallery setup complete with GitHub URLs.');
  console.log(`Tasks found: ${metadata.tasks.join(', ')}`);
  console.log(`Total images: ${metadata.totalImages}`);
  console.log(`Resolution analysis: ${resolutionAnalysis.resolutionBuckets.length} different resolution groups`);
  console.log('\nNote: Update the GitHub repository URL in the script before deployment!');
}

// Function to analyze image resolutions
function analyzeResolutions(images) {
  const resolutions = images
    .filter(img => img.width && img.height)
    .map(img => ({
      width: img.width,
      height: img.height,
      taskName: img.taskName
    }));

  // Group by width (horizontal resolution)
  const widthGroups = {};
  resolutions.forEach(res => {
    const width = res.width;
    if (!widthGroups[width]) {
      widthGroups[width] = { count: 0, tasks: new Set() };
    }
    widthGroups[width].count++;
    widthGroups[width].tasks.add(res.taskName);
  });

  // Convert to array and sort by width
  const resolutionBuckets = Object.entries(widthGroups)
    .map(([width, data]) => ({
      width: parseInt(width),
      count: data.count,
      tasks: Array.from(data.tasks).sort()
    }))
    .sort((a, b) => a.width - b.width);

  return {
    totalWithDimensions: resolutions.length,
    resolutionBuckets: resolutionBuckets,
    commonWidths: resolutionBuckets
      .filter(bucket => bucket.count >= 5)
      .map(bucket => ({ width: bucket.width, count: bucket.count }))
  };
}

// Run the main function
main().catch(console.error); 