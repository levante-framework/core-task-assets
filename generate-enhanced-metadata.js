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

// Function to map directory names to core-task names
function mapAssetDirToTaskName(assetDir) {
  const mapping = {
    'TROG': 'trog',
    'theory-of-mind': 'theoryOfMind', 
    'mental-rotation': 'mentalRotation',
    'emotion-recognition': 'emotionRecognition',
    'hearts-and-flowers': 'heartsAndFlowers',
    'matrix-reasoning': 'matrixReasoning',
    'memory-game': 'memoryGame',
    'math': 'egmaMath',
    'vocab': 'vocab',
    'same-different-selection': 'sameDifferentSelection'
  };
  
  return mapping[assetDir] || assetDir;
}

// Function to find task configuration files in core-tasks
function findTaskConfigurations() {
  const coreTasksPath = '../core-tasks/task-launcher/src/tasks';
  const taskConfigs = {};
  
  if (!fs.existsSync(coreTasksPath)) {
    console.warn('Core-tasks directory not found. Task mappings will be basic.');
    return taskConfigs;
  }
  
  try {
    const taskDirs = fs.readdirSync(coreTasksPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name !== 'shared')
      .map(dirent => dirent.name);
    
    for (const taskDir of taskDirs) {
      const taskPath = path.join(coreTasksPath, taskDir);
      const timelinePath = path.join(taskPath, 'timeline.ts');
      const configPath = path.join(taskPath, 'helpers', 'config.ts');
      
      taskConfigs[taskDir] = {
        hasTimeline: fs.existsSync(timelinePath),
        hasConfig: fs.existsSync(configPath),
        path: taskPath
      };
    }
  } catch (error) {
    console.warn('Error reading core-tasks directory:', error.message);
  }
  
  return taskConfigs;
}

// Function to scan for asset references in task files
async function findAssetReferences(taskDir, assetFilenames) {
  const coreTasksPath = '../core-tasks/task-launcher/src/tasks';
  const taskPath = path.join(coreTasksPath, taskDir);
  const references = [];
  
  if (!fs.existsSync(taskPath)) {
    return references;
  }
  
  try {
    // Recursively find all TypeScript files in the task directory
    function findTsFiles(dir) {
      const files = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...findTsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
      
      return files;
    }
    
    const tsFiles = findTsFiles(taskPath);
    
    // Search for asset filename references in the TypeScript files
    for (const filePath of tsFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        for (const filename of assetFilenames) {
          const basename = path.parse(filename).name; // Remove extension
          
          // Look for various ways the asset might be referenced
          const patterns = [
            new RegExp(`['"\`]${filename}['"\`]`, 'g'),
            new RegExp(`['"\`]${basename}['"\`]`, 'g'),
            new RegExp(`${basename}`, 'g')
          ];
          
          for (const pattern of patterns) {
            const matches = content.match(pattern);
            if (matches) {
              references.push({
                filename: filename,
                taskFile: path.relative(coreTasksPath, filePath),
                matchCount: matches.length,
                matchType: pattern.source
              });
            }
          }
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }
  } catch (error) {
    console.warn(`Error scanning task directory ${taskDir}:`, error.message);
  }
  
  return references;
}

// Function to extract item-level information from filenames
function extractItemInfo(filename, taskName) {
  const baseName = filename.replace(/\.(png|jpg|jpeg)$/i, '');
  let itemInfo = {
    itemNumber: null,
    variant: null,
    condition: null,
    description: null
  };

  // Different parsing strategies based on task
  if (taskName === 'TROG') {
    // TROG patterns: "1-boy", "100-gray-plane-over-clouds", "101-whale-above-fish-turtle"
    const trogMatch = baseName.match(/^(\d+)[-_](.+)$/);
    if (trogMatch) {
      itemInfo.itemNumber = parseInt(trogMatch[1]);
      itemInfo.description = trogMatch[2].replace(/[-_]/g, ' ');
      
      // Extract conditions from description
      const conditionPatterns = [
        'over', 'under', 'above', 'below', 'behind', 'between', 'into', 'out of',
        'gray', 'white', 'red', 'blue', 'green', 'yellow'
      ];
      
      for (const pattern of conditionPatterns) {
        if (itemInfo.description.includes(pattern)) {
          itemInfo.condition = pattern;
          break;
        }
      }
    }
  } else if (taskName === 'theory-of-mind') {
    // Theory of Mind patterns: "10a", "11_baseball", "12_greenball"
    const tomNumberMatch = baseName.match(/^(\d+)([a-z])$/);
    const tomObjectMatch = baseName.match(/^(\d+)_(.+)$/);
    
    if (tomNumberMatch) {
      itemInfo.itemNumber = parseInt(tomNumberMatch[1]);
      itemInfo.variant = tomNumberMatch[2];
      itemInfo.description = `Item ${itemInfo.itemNumber} option ${itemInfo.variant}`;
    } else if (tomObjectMatch) {
      itemInfo.itemNumber = parseInt(tomObjectMatch[1]);
      itemInfo.description = tomObjectMatch[2];
      
      // Extract color/object conditions
      const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'black', 'white', 'gray'];
      const objects = ['ball', 'baseball', 'basketball', 'soccerball'];
      
      for (const color of colors) {
        if (itemInfo.description.includes(color)) {
          itemInfo.condition = color;
          break;
        }
      }
      
      for (const object of objects) {
        if (itemInfo.description.includes(object)) {
          itemInfo.variant = object;
          break;
        }
      }
    }
  } else if (taskName === 'mental-rotation') {
    // Mental rotation patterns: look for rotation angles, difficulty levels
    const rotationMatch = baseName.match(/(\d+)[-_]?deg|rotation[-_]?(\d+)/i);
    const levelMatch = baseName.match(/level[-_]?(\d+)|difficulty[-_]?(\d+)/i);
    
    if (rotationMatch) {
      itemInfo.condition = `${rotationMatch[1] || rotationMatch[2]} degrees`;
    }
    if (levelMatch) {
      itemInfo.itemNumber = parseInt(levelMatch[1] || levelMatch[2]);
    }
    
    itemInfo.description = baseName.replace(/[-_]/g, ' ');
  } else if (taskName === 'hearts-and-flowers') {
    // Hearts and flowers patterns
    const hfMatch = baseName.match(/^(.+?)[-_]?(\d+)?$/);
    if (hfMatch) {
      itemInfo.description = hfMatch[1].replace(/[-_]/g, ' ');
      if (hfMatch[2]) {
        itemInfo.itemNumber = parseInt(hfMatch[2]);
      }
      
      // Extract stimulus type
      if (itemInfo.description.includes('heart')) {
        itemInfo.variant = 'heart';
      } else if (itemInfo.description.includes('flower')) {
        itemInfo.variant = 'flower';
      } else if (itemInfo.description.includes('mixed')) {
        itemInfo.variant = 'mixed';
      }
    }
  } else if (taskName === 'emotion-recognition') {
    // Emotion recognition patterns
    const emotions = ['happy', 'sad', 'angry', 'fear', 'surprise', 'disgust', 'neutral'];
    itemInfo.description = baseName.replace(/[-_]/g, ' ');
    
    for (const emotion of emotions) {
      if (itemInfo.description.toLowerCase().includes(emotion)) {
        itemInfo.condition = emotion;
        break;
      }
    }
    
    const numberMatch = baseName.match(/(\d+)/);
    if (numberMatch) {
      itemInfo.itemNumber = parseInt(numberMatch[1]);
    }
  }

  // Clean up description
  if (itemInfo.description) {
    itemInfo.description = itemInfo.description
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return itemInfo;
}

// Main function to find all high-resolution images with enhanced task mapping
async function findHighResolutionImagesWithTaskMapping(dir = '.') {
  const images = [];
  
  console.log('🔍 Finding task configurations in core-tasks...');
  const taskConfigs = findTaskConfigurations();
  const availableTasks = Object.keys(taskConfigs);
  console.log(`Found ${availableTasks.length} task configurations:`, availableTasks.join(', '));
  
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
            const assetTaskName = pathParts[pathParts.length - 2]; // Parent directory of 'original'
            const coreTaskName = mapAssetDirToTaskName(assetTaskName);
            
            // Extract item-level information from filename
            const itemInfo = extractItemInfo(pngFile, assetTaskName);
            
            images.push({
              filename: pngFile,
              taskName: assetTaskName,
              coreTaskName: coreTaskName,
              relativePath: path.relative('.', imagePath),
              imagePath: imagePath,
              size: stats.size,
              lastModified: stats.mtime.toISOString(),
              source: 'original-directory',
              hasTaskImplementation: availableTasks.includes(coreTaskName),
              // Item-level details
              itemNumber: itemInfo.itemNumber,
              variant: itemInfo.variant,
              condition: itemInfo.condition,
              itemDescription: itemInfo.description
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
          const coreTaskName = mapAssetDirToTaskName(dirName);
          
          // Extract item-level information from filename
          const filename = path.basename(filePath);
          const itemInfo = extractItemInfo(filename, dirName);
          
          images.push({
            filename: filename,
            taskName: dirName,
            coreTaskName: coreTaskName,
            relativePath: path.relative('.', filePath),
            imagePath: filePath,
            size: stats.size,
            lastModified: stats.mtime.toISOString(),
            source: 'high-resolution-scan',
            hasTaskImplementation: availableTasks.includes(coreTaskName),
            // Item-level details
            itemNumber: itemInfo.itemNumber,
            variant: itemInfo.variant,
            condition: itemInfo.condition,
            itemDescription: itemInfo.description
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
  
  // 3. Find asset references in core-task files
  console.log('\n🔗 Scanning for asset references in core-task implementations...');
  const taskAssetMappings = {};
  
  for (const task of availableTasks) {
    const taskImages = images.filter(img => img.coreTaskName === task);
    if (taskImages.length > 0) {
      console.log(`  Scanning ${task} task for ${taskImages.length} asset references...`);
      const assetFilenames = taskImages.map(img => img.filename);
      const references = await findAssetReferences(task, assetFilenames);
      
      taskAssetMappings[task] = {
        totalAssets: taskImages.length,
        referencedAssets: references.length,
        references: references
      };
      
      // Add reference information to images
      for (const img of taskImages) {
        const imgReferences = references.filter(ref => ref.filename === img.filename);
        img.taskReferences = imgReferences;
        img.isReferencedInTask = imgReferences.length > 0;
      }
    }
  }
  
  // Get dimensions for all images
  console.log(`\n📐 Extracting image dimensions for ${images.length} images...`);
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
  
  return { images, taskAssetMappings, taskConfigs };
}

// Generate GitHub URLs for images
function generateGitHubUrls(images) {
  return images.map(image => ({
    ...image,
    publicPath: `https://raw.githubusercontent.com/${config.github.owner}/${config.github.repo}/main/${image.relativePath}`,
    githubUrl: `https://raw.githubusercontent.com/${config.github.owner}/${config.github.repo}/main/${image.relativePath}`
  }));
}

// Function to analyze resolutions
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

// Main execution
async function main() {
  console.log('🚀 Scanning for high-resolution images with core-task mappings...');
  console.log('- PNG files from "original" directories');
  console.log('- High-resolution JPEG files from emotion-recognition');
  console.log('- High-resolution JPEG files from theory-of-mind');
  console.log('- High-resolution PNG files from hearts-and-flowers');
  console.log('- Core-task implementation mappings');
  console.log('- Asset reference analysis');
  console.log('');
  
  const { images, taskAssetMappings, taskConfigs } = await findHighResolutionImagesWithTaskMapping();

  console.log(`\n📊 Found ${images.length} high-resolution images across ${[...new Set(images.map(img => img.taskName))].length} asset directories`);

  // Generate GitHub URLs for images
  const imagesWithGitHubUrls = generateGitHubUrls(images);

  // Analyze resolutions
  const resolutionAnalysis = analyzeResolutions(imagesWithGitHubUrls);

  // Generate enhanced metadata JSON
  const metadata = {
    totalImages: imagesWithGitHubUrls.length,
    tasks: [...new Set(imagesWithGitHubUrls.map(img => img.taskName))].sort(),
    coreTasks: [...new Set(imagesWithGitHubUrls.map(img => img.coreTaskName))].sort(),
    images: imagesWithGitHubUrls,
    resolutionAnalysis: resolutionAnalysis,
    taskAssetMappings: taskAssetMappings,
    taskConfigurations: taskConfigs,
    generatedAt: new Date().toISOString()
  };

  // Write metadata to Vue app public folder
  const metadataPath = path.join('image-gallery', 'public', 'imageMetadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`\n💾 Metadata written to: ${metadataPath}`);

  // Generate summary
  console.log('\n📈 SUMMARY:');
  console.log(`Tasks found: ${metadata.tasks.join(', ')}`);
  console.log(`Core-task implementations: ${metadata.coreTasks.join(', ')}`);
  console.log(`Total images: ${metadata.totalImages}`);
  console.log(`Resolution analysis: ${resolutionAnalysis.resolutionBuckets.length} different resolution groups`);
  
  // Task implementation status
  const implementedTasks = imagesWithGitHubUrls.filter(img => img.hasTaskImplementation).length;
  const notImplementedTasks = imagesWithGitHubUrls.filter(img => !img.hasTaskImplementation).length;
  console.log(`Images with core-task implementations: ${implementedTasks}`);
  console.log(`Images without core-task implementations: ${notImplementedTasks}`);
  
  // Asset reference status
  const referencedAssets = imagesWithGitHubUrls.filter(img => img.isReferencedInTask).length;
  console.log(`Assets referenced in task code: ${referencedAssets}`);
  
  console.log('\n✅ Enhanced image gallery setup complete with core-task mappings!');
  console.log('\nNote: Update the GitHub repository URL in config.js before deployment!');
}

// Run the main function
main().catch(console.error); 