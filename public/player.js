class KaraokePlayer {
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
        this.particlesContainer = document.getElementById('particlesContainer');
        
        this.initializePlayer();
        this.setupEventListeners();
        this.createParticles();
        this.startVisualization();
    }

    initializePlayer() {
        // Get data from URL parameters or sessionStorage
        const urlParams = new URLSearchParams(window.location.search);
        const audioUrl = urlParams.get('audio') || sessionStorage.getItem('audioUrl');
        const lyricsData = urlParams.get('lyrics') || sessionStorage.getItem('lyrics');

        if (!audioUrl || !lyricsData) {
            alert('No audio or lyrics data found. Please go back and upload files.');
            return;
        }

        this.audioElement = document.getElementById('audioPlayer');
        this.audioElement.src = audioUrl;
        this.lyrics = JSON.parse(lyricsData);

        // Set song title from audio filename
        const songName = this.extractSongName(audioUrl);
        document.getElementById('songTitle').textContent = `🎵 ${songName}`;

        console.log('Player initialized with:', this.lyrics.length, 'lyrics');
    }

    extractSongName(url) {
        const filename = url.split('/').pop() || 'Unknown Song';
        return filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    }

    setupEventListeners() {
        const playBtn = document.getElementById('playBtn');
        const restartBtn = document.getElementById('restartBtn');
        const backBtn = document.getElementById('backBtn');

        playBtn.addEventListener('click', () => this.togglePlay());
        restartBtn.addEventListener('click', () => this.restart());
        backBtn.addEventListener('click', () => window.history.back());

        this.audioElement.addEventListener('loadedmetadata', () => {
            this.setupAudioAnalysis();
        });

        this.audioElement.addEventListener('ended', () => {
            this.stop();
        });

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pause();
            }
        });
    }

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
        this.canvas.width = this.canvas.offsetWidth * 2;
        this.canvas.height = this.canvas.offsetHeight * 2;
    }

    togglePlay() {
        if (!this.audioElement.src) {
            alert('No audio file loaded');
            return;
        }

        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        this.audioElement.play().then(() => {
            this.isPlaying = true;
            document.getElementById('playBtn').textContent = '⏸ Pause';
            this.startLyricsSync();
            this.startVisualization();
        }).catch(error => {
            console.error('Play failed:', error);
        });
    }

    pause() {
        this.audioElement.pause();
        this.isPlaying = false;
        document.getElementById('playBtn').textContent = '▶ Play';
        this.stopLyricsSync();
    }

    restart() {
        this.audioElement.currentTime = 0;
        this.currentLyricIndex = -1;
        this.updateLyricsDisplay('');
        this.updateBackground(false);
        
        if (this.isPlaying) {
            this.audioElement.play();
        }
    }

    stop() {
        this.pause();
        this.audioElement.currentTime = 0;
        this.currentLyricIndex = -1;
        this.updateLyricsDisplay('');
        this.updateBackground(false);
        document.getElementById('playBtn').textContent = '▶ Play';
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

        // Find current lyric
        let newLyricIndex = -1;
        for (let i = this.lyrics.length - 1; i >= 0; i--) {
            if (currentTime >= this.lyrics[i].timestamp) {
                newLyricIndex = i;
                break;
            }
        }

        // Update display if lyric changed
        if (newLyricIndex !== this.currentLyricIndex) {
            // Exit animation for old lyric
            if (this.currentLyricIndex >= 0) {
                this.animateLyricExit();
            }

            this.currentLyricIndex = newLyricIndex;
            
            if (newLyricIndex >= 0) {
                this.updateLyricsDisplay(this.lyrics[newLyricIndex].text);
                this.updateBackground(true);
                this.animateLyricEnter();
            } else {
                this.updateLyricsDisplay('');
                this.updateBackground(false);
            }
        }

        // Update text scale based on pitch
        if (this.analyser && newLyricIndex >= 0) {
            this.updateTextScale();
        }

        this.animationFrame = requestAnimationFrame(() => this.updateLyrics());
    }

    animateLyricEnter() {
        const lyricsDisplay = document.getElementById('lyricsDisplay');
        lyricsDisplay.classList.remove('lyric-exit');
        lyricsDisplay.classList.add('lyric-enter');
    }

    animateLyricExit() {
        const lyricsDisplay = document.getElementById('lyricsDisplay');
        lyricsDisplay.classList.remove('lyric-enter');
        lyricsDisplay.classList.add('lyric-exit');
    }

    updateLyricsDisplay(text) {
        const lyricsDisplay = document.getElementById('lyricsDisplay');
        lyricsDisplay.textContent = text;
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
        document.getElementById('currentTime').textContent = timeString;
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

        // Update pitch indicator
        document.getElementById('pitchIndicator').textContent = `Pitch: ${Math.round(dominantFrequency)} Hz`;

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
        lyricsDisplay.style.transform = `scale(${pitchScale}) rotate(${rotation}deg)`;

        // Change color based on pitch (warmer colors for higher pitches)
        const hue = 200 + (normalizedPitch * 160); // Blue to red
        lyricsDisplay.style.color = `hsl(${hue}, 70%, 70%)`;
    }

    startVisualization() {
        this.drawVisualizer();
    }

    drawVisualizer() {
        if (!this.isPlaying || !this.analyser || !this.canvasContext) {
            this.animationFrame = requestAnimationFrame(() => this.drawVisualizer());
            return;
        }

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);

        this.canvasContext.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const barWidth = (this.canvas.width / bufferLength) * 2;
        let barHeight;
        let x = 0;

        const isLyricsActive = document.body.classList.contains('lyrics-active');

        for (let i = 0; i < bufferLength; i++) {
            barHeight = (dataArray[i] / 255) * this.canvas.height;

            // Create gradient based on current state
            const gradient = this.canvasContext.createLinearGradient(0, 0, 0, this.canvas.height);
            
            if (isLyricsActive) {
                // Lyrics active - use warm colors
                const hue = (i / bufferLength) * 60 + 300; // Purple to red
                gradient.addColorStop(0, `hsl(${hue}, 100%, 60%)`);
                gradient.addColorStop(1, `hsl(${hue + 30}, 100%, 40%)`);
            } else {
                // No lyrics - use cool colors
                const hue = (i / bufferLength) * 60 + 180; // Green to blue
                gradient.addColorStop(0, `hsl(${hue}, 100%, 60%)`);
                gradient.addColorStop(1, `hsl(${hue + 30}, 100%, 40%)`);
            }

            this.canvasContext.fillStyle = gradient;
            this.canvasContext.fillRect(x, this.canvas.height - barHeight, barWidth, barHeight);

            x += barWidth + 1;
        }

        this.animationFrame = requestAnimationFrame(() => this.drawVisualizer());
    }

    createParticles() {
        // Create floating particles for background
        const particleCount = 50;
        
        for (let i = 0; i < particleCount; i++) {
            this.createParticle();
        }
    }

    createParticle() {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        // Random properties
        const size = Math.random() * 3 + 1;
        const posX = Math.random() * 100;
        const posY = Math.random() * 100;
        const delay = Math.random() * 5;
        const duration = Math.random() * 5 + 3;
        
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${posX}%`;
        particle.style.top = `${posY}%`;
        particle.style.animationDelay = `${delay}s`;
        particle.style.animationDuration = `${duration}s`;
        
        // Random color based on current theme
        const hue = Math.random() * 360;
        particle.style.background = `hsl(${hue}, 70%, 60%)`;
        
        this.particlesContainer.appendChild(particle);
        
        // Remove particle after animation and create new one
        setTimeout(() => {
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
                this.createParticle();
            }
        }, (duration + delay) * 1000);
    }
}

// Initialize player when page loads
document.addEventListener('DOMContentLoaded', () => {
    new KaraokePlayer();
});