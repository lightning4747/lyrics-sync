const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// File hash storage (in production, use a database)
const fileHashes = new Map(); // hash -> { filename, originalName, uploadDate }

// Function to calculate file hash
function calculateFileHash(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch (error) {
    console.error('Error calculating file hash:', error);
    return null;
  }
}

// Function to search for duplicate files
function findDuplicateFile(filePath) {
  const hash = calculateFileHash(filePath);
  if (!hash) return null;
  
  // Check if we already have a file with this hash
  if (fileHashes.has(hash)) {
    const existingFile = fileHashes.get(hash);
    console.log(`Duplicate detected! Hash: ${hash}, Existing file: ${existingFile.filename}`);
    return existingFile;
  }
  
  return null;
}

// Function to register a new file
function registerFile(filePath, originalName) {
  const hash = calculateFileHash(filePath);
  if (!hash) return null;
  
  const fileInfo = {
    filename: path.basename(filePath),
    originalName: originalName,
    uploadDate: new Date().toISOString(),
    hash: hash
  };
  
  fileHashes.set(hash, fileInfo);
  console.log(`Registered new file: ${fileInfo.filename} (hash: ${hash})`);
  return fileInfo;
}

// Configure multer for file uploads with better error handling
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log('Created uploads directory:', uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Clean filename and add timestamp
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_');
    cb(null, Date.now() + '-' + originalName);
  }
});

const fileFilter = (req, file, cb) => {
  console.log('Processing file:', file.fieldname, file.originalname, file.mimetype);
  
  if (file.fieldname === 'audio') {
    const allowedAudioTypes = [
      'audio/mpeg', 
      'audio/wav', 
      'audio/ogg', 
      'audio/mp4',
      'audio/x-m4a',
      'audio/aac',
      'audio/webm'
    ];
    
    if (allowedAudioTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.log('Rejected audio file type:', file.mimetype);
      cb(new Error(`Unsupported audio format: ${file.mimetype}. Please use MP3, WAV, OGG, or M4A.`), false);
    }
  } else if (file.fieldname === 'lyrics') {
    const allowedTextTypes = [
      'text/plain', 
      'application/json',
      'text/html',
      'application/octet-stream' // For some .lrc files
    ];
    
    if (allowedTextTypes.includes(file.mimetype) || 
        file.originalname.endsWith('.lrc') ||
        file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      console.log('Rejected lyrics file type:', file.mimetype);
      cb(new Error(`Unsupported lyrics format: ${file.mimetype}. Please use TXT or LRC files.`), false);
    }
  } else {
    cb(new Error('Unexpected field name'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 2 // Max 2 files
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Handle file upload with improved error handling
app.post('/upload', upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'lyrics', maxCount: 1 }
]), (req, res) => {
  console.log('Upload request received');
  console.log('Files received:', req.files);
  console.log('Body:', req.body);

  try {
    if (!req.files) {
      return res.status(400).json({ 
        success: false,
        error: 'No files were uploaded' 
      });
    }

    if (!req.files.audio || !req.files.lyrics) {
      const missing = [];
      if (!req.files.audio) missing.push('audio');
      if (!req.files.lyrics) missing.push('lyrics');
      
      return res.status(400).json({ 
        success: false,
        error: `Missing files: ${missing.join(', ')}` 
      });
    }

    const audioFile = req.files.audio[0];
    const lyricsFile = req.files.lyrics[0];

    console.log('Audio file:', audioFile);
    console.log('Lyrics file:', lyricsFile);

    // Check for duplicate files
    const duplicateAudio = findDuplicateFile(audioFile.path);
    const duplicateLyrics = findDuplicateFile(lyricsFile.path);
    
    let finalAudioUrl = `/uploads/${audioFile.filename}`;
    let finalLyricsData = [];
    let duplicateInfo = {};

    // Handle audio file
    if (duplicateAudio) {
      console.log('Using existing audio file:', duplicateAudio.filename);
      finalAudioUrl = `/uploads/${duplicateAudio.filename}`;
      duplicateInfo.audio = {
        isDuplicate: true,
        originalFile: duplicateAudio.filename,
        originalName: duplicateAudio.originalName,
        uploadDate: duplicateAudio.uploadDate
      };
      // Remove the duplicate file
      fs.unlinkSync(audioFile.path);
    } else {
      // Register new audio file
      registerFile(audioFile.path, audioFile.originalname);
      duplicateInfo.audio = { isDuplicate: false };
    }

    // Handle lyrics file
    if (duplicateLyrics) {
      console.log('Using existing lyrics file:', duplicateLyrics.filename);
      duplicateInfo.lyrics = {
        isDuplicate: true,
        originalFile: duplicateLyrics.filename,
        originalName: duplicateLyrics.originalName,
        uploadDate: duplicateLyrics.uploadDate
      };
      // Remove the duplicate file
      fs.unlinkSync(lyricsFile.path);
      
      // Parse the existing lyrics file
      try {
        const existingLyricsPath = path.join(__dirname, 'uploads', duplicateLyrics.filename);
        const lyricsContent = fs.readFileSync(existingLyricsPath, 'utf8');
        finalLyricsData = parseLyrics(lyricsContent);
      } catch (error) {
        console.error('Error reading existing lyrics file:', error);
        return res.status(500).json({ 
          success: false,
          error: 'Error reading existing lyrics file: ' + error.message 
        });
      }
    } else {
      // Parse new lyrics file
      try {
        const lyricsContent = fs.readFileSync(lyricsFile.path, 'utf8');
        console.log('Lyrics content length:', lyricsContent.length);
        finalLyricsData = parseLyrics(lyricsContent);
        console.log('Parsed lyrics data:', finalLyricsData.length, 'lines');
        
        // Register new lyrics file
        registerFile(lyricsFile.path, lyricsFile.originalname);
        duplicateInfo.lyrics = { isDuplicate: false };
      } catch (error) {
        console.error('Error parsing lyrics file:', error);
        return res.status(400).json({ 
          success: false,
          error: 'Error reading lyrics file: ' + error.message 
        });
      }
    }

    res.json({
      success: true,
      audioUrl: finalAudioUrl,
      lyrics: finalLyricsData,
      message: 'Files processed successfully',
      duplicateInfo: duplicateInfo
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error during upload: ' + error.message 
    });
  }
});

// Error handling middleware for multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 50MB.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files. Please upload only one audio and one lyrics file.'
      });
    }
  }
  
  console.error('Upload middleware error:', error);
  res.status(400).json({
    success: false,
    error: error.message || 'Upload failed'
  });
});

// Parse lyrics file (supports multiple formats)
function parseLyrics(content) {
  const lines = content.split('\n');
  const lyrics = [];
  
  console.log('Parsing lyrics, total lines:', lines.length);

  // Try LRC format first
  const lrcRegex = /\[(\d+):(\d+)\.(\d+)\]\s*(.*)/;
  let hasLrcFormat = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const match = line.match(lrcRegex);
    if (match) {
      hasLrcFormat = true;
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const milliseconds = parseInt(match[3]);
      const text = match[4].trim();
      
      const timestamp = minutes * 60 + seconds + milliseconds / 100;
      
      if (text) {
        lyrics.push({
          timestamp: timestamp,
          text: text,
          lineNumber: i + 1
        });
      }
    }
  }
  
  // If not LRC format, assume plain text with timestamps
  if (!hasLrcFormat) {
    console.log('No LRC format detected, trying plain text format');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Try to extract timestamp and text
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const timestamp = parseFloat(parts[0]);
        if (!isNaN(timestamp) && timestamp >= 0) {
          const text = parts.slice(1).join(' ');
          lyrics.push({
            timestamp: timestamp,
            text: text,
            lineNumber: i + 1
          });
        }
      } else {
        // If no timestamp, assume it's a continuation or error
        console.log('Skipping line (no valid timestamp):', line);
      }
    }
  }
  
  // Sort by timestamp
  lyrics.sort((a, b) => a.timestamp - b.timestamp);
  
  console.log('Final parsed lyrics:', lyrics.length, 'valid lines');
  return lyrics;
}

// Function to initialize file hash storage from existing files
function initializeFileHashes() {
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory at startup');
    return;
  }

  try {
    const files = fs.readdirSync(uploadsDir);
    let registeredCount = 0;
    
    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isFile()) {
        const hash = calculateFileHash(filePath);
        if (hash && !fileHashes.has(hash)) {
          const fileInfo = {
            filename: file,
            originalName: file, // We don't have original name for existing files
            uploadDate: stats.mtime.toISOString(),
            hash: hash
          };
          fileHashes.set(hash, fileInfo);
          registeredCount++;
        }
      }
    }
    
    console.log(`Initialized file hash storage with ${registeredCount} existing files`);
  } catch (error) {
    console.error('Error initializing file hashes:', error);
  }
}

// Create uploads directory and initialize file hashes
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory at startup');
}

// Initialize file hash storage
initializeFileHashes();

app.listen(PORT, () => {
  console.log(`🎵 Lyrics Sync App running at http://localhost:${PORT}`);
  console.log(`📁 Upload directory: ${uploadsDir}`);
  console.log('✅ Server is ready for file uploads');
});

// Add this route to your existing server.js
app.get('/player', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Endpoint to view file hash information (for debugging)
app.get('/files', (req, res) => {
  const files = Array.from(fileHashes.values());
  res.json({
    totalFiles: files.length,
    files: files.map(file => ({
      filename: file.filename,
      originalName: file.originalName,
      uploadDate: file.uploadDate,
      hash: file.hash.substring(0, 16) + '...' // Show only first 16 chars for security
    }))
  });
});