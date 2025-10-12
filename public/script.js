class LyricsSync {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.audioElement = null;
        this.lyrics = [];
        this.currentLyricIndex = -1;
        this.isPlaying = false;
        this.animationFrame = null;
        this.canvas = document.getElementById('visualizerCanvas');
        this.canvasContext = this.canvas.getContext('2d');
        
        this.initializeEventListeners();
        this.setupVisualizer();
    }

    initializeEventListeners() {
        const uploadForm = document.getElementById('uploadForm');
        const playBtn = document.getElementById('playBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const restartBtn = document.getElementById('restartBtn');
        const audioPlayer = document.getElementById('audioPlayer');

        uploadForm.addEventListener('submit', (e) => this.handleUpload(e));
        playBtn.addEventListener('click', () => this.play());
        pauseBtn.addEventListener('click', () => this.pause());
        restartBtn.addEventListener('click', () => this.restart());
        
        audioPlayer.addEventListener('loadedmetadata', () => {
            this.setupAudioAnalysis();
        });

        audioPlayer.addEventListener('ended', () => {
            this.stop();
        });

        // Add file input change listeners for better UX
        const audioInput = document.getElementById('audioFile');
        const lyricsInput = document.getElementById('lyricsFile');
        
        audioInput.addEventListener('change', (e) => this.validateFile(e.target, 'audio'));
        lyricsInput.addEventListener('change', (e) => this.validateFile(e.target, 'lyrics'));
    }

    validateFile(input, type) {
        const file = input.files[0];
        if (!file) return;

        const errorElement = document.getElementById(`${type}Error`) || this.createErrorElement(input, type);
        
        // Clear previous errors
        errorElement.textContent = '';

        // File size validation (50MB)
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
            errorElement.textContent = `File too large. Maximum size is 50MB.`;
            input.value = '';
            return;
        }

        // File type validation
        if (type === 'audio') {
            const audioTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];
            if (!audioTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) {
                errorElement.textContent = 'Please select a valid audio file (MP3, WAV, OGG, M4A, AAC)';
                input.value = '';
            }
        } else if (type === 'lyrics') {
            if (!file.type.includes('text/') && !file.name.match(/\.(txt|lrc)$/i)) {
                errorElement.textContent = 'Please select a valid lyrics file (TXT or LRC)';
                input.value = '';
            }
        }
    }

    createErrorElement(input, type) {
        const errorElement = document.createElement('div');
        errorElement.id = `${type}Error`;
        errorElement.className = 'error-message';
        errorElement.style.color = 'red';
        errorElement.style.fontSize = '0.9rem';
        errorElement.style.marginTop = '5px';
        input.parentNode.appendChild(errorElement);
        return errorElement;
    }

    async handleUpload(event) {
        event.preventDefault();
        
        const uploadBtn = document.getElementById('uploadBtn');
        const originalText = uploadBtn.textContent;
        uploadBtn.textContent = 'Uploading...';
        uploadBtn.disabled = true;

        // Clear previous errors
        this.clearErrors();

        const formData = new FormData(event.target);

        // Validate files before upload
        const audioFile = document.getElementById('audioFile').files[0];
        const lyricsFile = document.getElementById('lyricsFile').files[0];

        if (!audioFile || !lyricsFile) {
            this.showError('Please select both audio and lyrics files');
            uploadBtn.textContent = originalText;
            uploadBtn.disabled = false;
            return;
        }

        try {
            console.log('Starting file upload...');
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            console.log('Upload response:', data);

            if (!response.ok) {
                throw new Error(data.error || `Upload failed with status ${response.status}`);
            }

            if (data.success) {
                this.setupPlayer(data);
                
                // Show duplicate information if any
                let message = 'Files processed successfully!';
                if (data.duplicateInfo) {
                    const duplicates = [];
                    if (data.duplicateInfo.audio?.isDuplicate) {
                        duplicates.push(`Audio: Using existing file "${data.duplicateInfo.audio.originalName}"`);
                    }
                    if (data.duplicateInfo.lyrics?.isDuplicate) {
                        duplicates.push(`Lyrics: Using existing file "${data.duplicateInfo.lyrics.originalName}"`);
                    }
                    
                    if (duplicates.length > 0) {
                        message += '\n\nDuplicate files detected and reused:\n' + duplicates.join('\n');
                    }
                }
                
                this.showMessage(message, 'success');
            } else {
                throw new Error(data.error || 'Upload failed');
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            this.showError('Upload failed: ' + error.message);
        } finally {
            uploadBtn.textContent = originalText;
            uploadBtn.disabled = false;
        }
    }

    clearErrors() {
        const errors = document.querySelectorAll('.error-message');
        errors.forEach(error => error.textContent = '');
        
        const output = document.getElementById('output');
        if (output) {
            output.style.display = 'none';
        }
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showMessage(message, type = 'info') {
        let output = document.getElementById('output');
        if (!output) {
            output = document.createElement('div');
            output.id = 'output';
            output.style.marginTop = '20px';
            output.style.padding = '15px';
            output.style.borderRadius = '8px';
            document.querySelector('.upload-section').appendChild(output);
        }
        
        output.innerHTML = message;
        output.style.display = 'block';
        output.style.borderLeft = '4px solid ' + (type === 'error' ? '#f44336' : type === 'success' ? '#4CAF50' : '#2196F3');
        output.style.background = type === 'error' ? '#ffebee' : type === 'success' ? '#e8f5e8' : '#e3f2fd';
        output.style.color = type === 'error' ? '#c62828' : type === 'success' ? '#2e7d32' : '#1565c0';
        
        output.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    setupPlayer(data) {
        // Store data for the player page
        sessionStorage.setItem('audioUrl', data.audioUrl);
        sessionStorage.setItem('lyrics', JSON.stringify(data.lyrics));
        
        // Redirect to player page
        window.location.href = `/player?audio=${encodeURIComponent(data.audioUrl)}&lyrics=${encodeURIComponent(JSON.stringify(data.lyrics))}`;
    }

    // ... rest of the methods remain the same as previous version
    setupAudioAnalysis() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.source = this.audioContext.createMediaElementSource(this.audioElement);
            
            // Configure analyser for pitch detection
            this.analyser.fftSize = 2048; // Larger FFT for better frequency resolution
            this.analyser.smoothingTimeConstant = 0.8;
            
            this.source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            
            this.setupVisualizer();
        } catch (error) {
            console.error('Audio analysis setup failed:', error);
        }
    }

    setupVisualizer() {
        if (this.canvas) {
            this.canvas.width = this.canvas.offsetWidth;
            this.canvas.height = this.canvas.offsetHeight;
        }
    }

    play() {
        if (!this.audioElement || !this.audioElement.src) {
            this.showError('Please upload audio and lyrics files first');
            return;
        }

        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        this.audioElement.play().then(() => {
            this.isPlaying = true;
            this.startLyricsSync();
            this.startVisualization();
        }).catch(error => {
            console.error('Play failed:', error);
            this.showError('Failed to play audio: ' + error.message);
        });
    }

    pause() {
        if (this.audioElement) {
            this.audioElement.pause();
        }
        this.isPlaying = false;
        this.stopLyricsSync();
        this.stopVisualization();
    }

    restart() {
        if (this.audioElement) {
            this.audioElement.currentTime = 0;
        }
        this.currentLyricIndex = -1;
        this.updateLyricsDisplay('');
        this.updateBackground(false);
        
        if (this.isPlaying && this.audioElement) {
            this.audioElement.play();
        }
    }

    stop() {
        this.pause();
        if (this.audioElement) {
            this.audioElement.currentTime = 0;
        }
        this.currentLyricIndex = -1;
        this.updateLyricsDisplay('');
        this.updateBackground(false);
    }

    startLyricsSync() {
        this.updateLyrics();
    }

    stopLyricsSync() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    updateLyrics() {
        if (!this.isPlaying || !this.audioElement) return;

        const currentTime = this.audioElement.currentTime;
        this.updateTimeDisplay(currentTime);

        let newLyricIndex = -1;
        for (let i = this.lyrics.length - 1; i >= 0; i--) {
            if (currentTime >= this.lyrics[i].timestamp) {
                newLyricIndex = i;
                break;
            }
        }

        if (newLyricIndex !== this.currentLyricIndex) {
            this.currentLyricIndex = newLyricIndex;
            
            if (newLyricIndex >= 0) {
                this.updateLyricsDisplay(this.lyrics[newLyricIndex].text);
                this.updateBackground(true);
            } else {
                this.updateLyricsDisplay('');
                this.updateBackground(false);
            }
        }

        if (this.analyser && newLyricIndex >= 0) {
            this.updateTextScale();
        }

        this.animationFrame = requestAnimationFrame(() => this.updateLyrics());
    }

    updateLyricsDisplay(text) {
        const lyricsDisplay = document.getElementById('lyricsDisplay');
        if (lyricsDisplay) {
            lyricsDisplay.textContent = text;
        }
    }

    updateBackground(hasLyrics) {
        if (hasLyrics) {
            document.body.classList.add('lyrics-active');
        } else {
            document.body.classList.remove('lyrics-active');
        }
    }

    updateTimeDisplay(currentTime) {
        const minutes = Math.floor(currentTime / 60);
        const seconds = Math.floor(currentTime % 60);
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        const timeElement = document.getElementById('currentTime');
        if (timeElement) {
            timeElement.textContent = timeString;
        }
    }

    updateTextScale() {
        if (!this.analyser) return;

        // Get frequency data for pitch detection
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);

        // Find dominant frequency (pitch)
        let maxVolume = 0;
        let dominantFrequency = 0;
        const sampleRate = this.audioContext.sampleRate;

        for (let i = 0; i < bufferLength; i++) {
            if (dataArray[i] > maxVolume) {
                maxVolume = dataArray[i];
                dominantFrequency = i * sampleRate / this.analyser.fftSize;
            }
        }

        // Map pitch to scale (human voice range: ~80Hz to 1100Hz)
        const minPitch = 80;
        const maxPitch = 1100;
        const normalizedPitch = Math.max(0, Math.min(1, 
            (dominantFrequency - minPitch) / (maxPitch - minPitch)
        ));

        // More dramatic scaling based on pitch
        const baseScale = 1;
        const pitchScale = 0.5 + normalizedPitch * 1.5; // Scale from 0.5x to 2x
        
        // Add some rotation based on pitch for more dynamic effect
        const rotation = (normalizedPitch - 0.5) * 10; // -5deg to +5deg

        const lyricsDisplay = document.getElementById('lyricsDisplay');
        if (lyricsDisplay) {
            lyricsDisplay.style.transform = `scale(${pitchScale}) rotate(${rotation}deg)`;
            
            // Change color based on pitch (warmer colors for higher pitches)
            const hue = 200 + (normalizedPitch * 160); // Blue to red
            lyricsDisplay.style.color = `hsl(${hue}, 70%, 70%)`;
        }
    }

    startVisualization() {
        this.drawVisualizer();
    }

    stopVisualization() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        if (this.canvasContext) {
            this.canvasContext.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    drawVisualizer() {
        if (!this.isPlaying || !this.analyser || !this.canvasContext) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);

        this.canvasContext.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const barWidth = (this.canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = (dataArray[i] / 255) * this.canvas.height;

            const isLyricsActive = document.body.classList.contains('lyrics-active');
            const gradient = this.canvasContext.createLinearGradient(0, 0, 0, this.canvas.height);
            
            if (isLyricsActive) {
                gradient.addColorStop(0, '#ff6b6b');
                gradient.addColorStop(0.5, '#4ecdc4');
                gradient.addColorStop(1, '#45b7d1');
            } else {
                gradient.addColorStop(0, '#667eea');
                gradient.addColorStop(0.5, '#764ba2');
                gradient.addColorStop(1, '#f093fb');
            }

            this.canvasContext.fillStyle = gradient;
            this.canvasContext.fillRect(x, this.canvas.height - barHeight, barWidth, barHeight);

            x += barWidth + 1;
        }

        this.animationFrame = requestAnimationFrame(() => this.drawVisualizer());
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new LyricsSync();
    
    // Test server connection
    fetch('/health')
        .then(response => response.json())
        .then(data => console.log('Server health:', data))
        .catch(error => console.error('Server connection test failed:', error));
});