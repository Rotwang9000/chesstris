/**
 * Sound Manager Module
 * 
 * Handles audio playback and management
 */

// Track loaded sounds
const loadedSounds = {};

// Audio settings
let masterVolume = 0.7;
let musicVolume = 0.5;
let sfxVolume = 0.8;
let isMuted = false;

// Currently playing music
let currentMusic = null;
let musicElement = null;

// Track missing assets to avoid repeated error logs
const missingAssets = new Set();

/**
 * Initialize sound manager
 * @param {Object} options - Sound options
 */
export async function init(options = {}) {
	// Apply options
	masterVolume = options.masterVolume !== undefined ? options.masterVolume : masterVolume;
	musicVolume = options.musicVolume !== undefined ? options.musicVolume : musicVolume;
	sfxVolume = options.sfxVolume !== undefined ? options.sfxVolume : sfxVolume;
	isMuted = options.muted || false;
	
	// Create audio element for music
	if (!musicElement) {
		musicElement = document.createElement('audio');
		musicElement.loop = true;
		document.body.appendChild(musicElement);
	}
	
	// Apply initial volume
	updateVolume();
	
	return true;
}

/**
 * Load a sound
 * @param {string} id - Sound ID
 * @param {string} url - Sound URL
 * @returns {Promise<boolean>} Success status
 */
export async function loadSound(id, url) {
	try {
		// Check if sound already loaded
		if (loadedSounds[id]) {
			return true;
		}
		
		// Create audio element
		const audioElement = new Audio();
		
		// Wait for load
		await new Promise((resolve, reject) => {
			audioElement.addEventListener('canplaythrough', resolve);
			audioElement.addEventListener('error', reject);
			audioElement.src = url;
			audioElement.load();
		});
		
		// Store sound
		loadedSounds[id] = {
			element: audioElement,
			url: url
		};
		
		return true;
	} catch (error) {
		// Only log the error once for each missing asset
		if (!missingAssets.has(id)) {
			console.warn(`Error loading sound ${id}`);
			missingAssets.add(id);
		}
		return false;
	}
}

/**
 * Play a sound effect
 * @param {string} id - Sound ID
 * @param {Object} options - Playback options
 * @returns {HTMLAudioElement|null} Audio element or null if failed
 */
export function playSound(id, options = {}) {
	// Skip if muted
	if (isMuted) return null;
	
	// Check if sound loaded
	if (!loadedSounds[id]) {
		// Only log once
		if (!missingAssets.has(id)) {
			console.warn(`Sound ${id} not found`);
			missingAssets.add(id);
		}
		
		// Try default sound based on ID
		const defaultSoundUrl = `sounds/${id}.mp3`;
		
		// Load and play default sound
		loadSound(id, defaultSoundUrl)
			.then(success => {
				if (success) {
					playSound(id, options);
				}
			})
			.catch(() => {}); // Silently fail after logging warning once
			
		return null;
	}
	
	try {
		// Clone the audio element for simultaneous playback
		const soundElement = loadedSounds[id].element.cloneNode();
		
		// Apply options
		soundElement.volume = (options.volume || 1) * sfxVolume * masterVolume;
		soundElement.playbackRate = options.playbackRate || 1;
		soundElement.loop = options.loop || false;
		
		// Play sound
		soundElement.play();
		
		// Return element for further control
		return soundElement;
	} catch (error) {
		// Only log once per session
		if (!missingAssets.has(`play_${id}`)) {
			console.warn(`Error playing sound ${id}`);
			missingAssets.add(`play_${id}`);
		}
		return null;
	}
}

/**
 * Play background music
 * @param {string} id - Music ID
 * @returns {boolean} Success status
 */
export function playMusic(id, restart = false) {
	// Skip if same music already playing and not forcing restart
	if (currentMusic === id && !restart) {
		return true;
	}
	
	// Stop current music
	if (musicElement) {
		musicElement.pause();
		musicElement.currentTime = 0;
	}
	
	// Set current music
	currentMusic = id;
	
	// Skip further playback if muted
	if (isMuted) return true;
	
	try {
		// Set up music URL
		const musicUrl = `sounds/music/${id}.mp3`;
		
		// Only log missing music once per ID
		if (!musicElement.canPlayType('audio/mpeg')) {
			if (!missingAssets.has('music_support')) {
				console.warn('Browser does not support MP3 playback');
				missingAssets.add('music_support');
			}
			return false;
		}
		
		// Load and play
		musicElement.src = musicUrl;
		musicElement.volume = musicVolume * masterVolume;
		
		// Handle errors - only log once per music ID
		musicElement.onerror = () => {
			if (!missingAssets.has(`music_${id}`)) {
				console.warn(`Music ${id} not found in default sounds`);
				missingAssets.add(`music_${id}`);
			}
		};
		
		// Try to play the music
		const playPromise = musicElement.play();
		
		// Handle autoplay restrictions
		if (playPromise !== undefined) {
			playPromise.catch(error => {
				if (!missingAssets.has('autoplay_blocked')) {
					console.warn('Music playback was prevented by browser');
					missingAssets.add('autoplay_blocked');
				}
			});
		}
		
		return true;
	} catch (error) {
		// Only log once
		if (!missingAssets.has(`music_error_${id}`)) {
			console.warn(`Error playing music ${id}`);
			missingAssets.add(`music_error_${id}`);
		}
		return false;
	}
}

/**
 * Update volume settings
 */
export function updateVolume() {
	// Update music volume
	if (musicElement) {
		musicElement.volume = isMuted ? 0 : musicVolume * masterVolume;
	}
}

/**
 * Set master volume
 * @param {number} volume - Volume level (0-1)
 */
export function setMasterVolume(volume) {
	masterVolume = Math.max(0, Math.min(1, volume));
	updateVolume();
}

/**
 * Set music volume
 * @param {number} volume - Volume level (0-1)
 */
export function setMusicVolume(volume) {
	musicVolume = Math.max(0, Math.min(1, volume));
	updateVolume();
}

/**
 * Set sound effects volume
 * @param {number} volume - Volume level (0-1)
 */
export function setSfxVolume(volume) {
	sfxVolume = Math.max(0, Math.min(1, volume));
}

/**
 * Toggle mute state
 * @param {boolean} muted - Mute state (optional)
 * @returns {boolean} New mute state
 */
export function toggleMute(muted) {
	isMuted = muted !== undefined ? muted : !isMuted;
	updateVolume();
	return isMuted;
}

/**
 * Preload default sounds
 */
export async function preloadDefaultSounds() {
	try {
		// Preload common sound effects
		const commonSounds = [
			'click', 'place', 'rotate', 'move', 'clear', 'levelup', 'gameover'
		];
		
		// Load sounds in parallel
		await Promise.all(
			commonSounds.map(id => loadSound(id, `sounds/${id}.mp3`))
		);
		
		return true;
	} catch (error) {
		console.warn('Error preloading default sounds');
		return false;
	}
} 