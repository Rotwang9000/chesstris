/**
 * Sound Manager Utility
 * 
 * Handles audio playback and management for the game
 */

// Sound registry
const sounds = {};
let masterVolume = 0.7;
let musicVolume = 0.5;
let sfxVolume = 0.8;
let _isMuted = false;
let isInitialized = false;
let currentMusic = null;
let audioContext = null;
let hasUserInteraction = false;

// Constants
const DEFAULT_SOUNDS = {
	// UI sounds
	click: { url: 'sounds/ui/click.mp3', volume: 0.5, category: 'sfx' },
	hover: { url: 'sounds/ui/hover.mp3', volume: 0.3, category: 'sfx' },
	error: { url: 'sounds/ui/error.mp3', volume: 0.5, category: 'sfx' },
	success: { url: 'sounds/ui/success.mp3', volume: 0.5, category: 'sfx' },
	
	// Game sounds
	move: { url: 'sounds/game/move.mp3', volume: 0.5, category: 'sfx' },
	rotate: { url: 'sounds/game/rotate.mp3', volume: 0.5, category: 'sfx' },
	place: { url: 'sounds/game/place.mp3', volume: 0.6, category: 'sfx' },
	clear: { url: 'sounds/game/clear.mp3', volume: 0.7, category: 'sfx' },
	capture: { url: 'sounds/game/capture.mp3', volume: 0.7, category: 'sfx' },
	check: { url: 'sounds/game/check.mp3', volume: 0.7, category: 'sfx' },
	gameOver: { url: 'sounds/game/game_over.mp3', volume: 0.8, category: 'sfx' },
	victory: { url: 'sounds/game/victory.mp3', volume: 0.8, category: 'sfx' },
	
	// Music
	menuMusic: { url: 'sounds/music/menu.mp3', volume: 0.5, category: 'music', loop: true },
	gameMusic: { url: 'sounds/music/game.mp3', volume: 0.5, category: 'music', loop: true },
	gameOverMusic: { url: 'sounds/music/game_over.mp3', volume: 0.5, category: 'music', loop: false }
};

/**
 * Initialize the sound manager
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
export async function init(options = {}) {
	try {
		if (isInitialized) {
			console.warn('Sound manager already initialized');
			return true;
		}
		
		console.log('Initializing sound manager...');
		
		// Set up Web Audio API
		try {
			audioContext = new (window.AudioContext || window.webkitAudioContext)();
			console.log('Audio context created');
		} catch (error) {
			console.warn('Web Audio API not supported, falling back to HTML5 Audio');
		}
		
		// Apply volume settings
		masterVolume = options.masterVolume ?? masterVolume;
		musicVolume = options.musicVolume ?? musicVolume;
		sfxVolume = options.sfxVolume ?? sfxVolume;
		_isMuted = options.muted ?? _isMuted;
		
		// Set up user interaction detection
		setupUserInteractionDetection();
		
		// Preload default sounds
		if (options.preload !== false) {
			await preloadDefaultSounds();
		}
		
		isInitialized = true;
		console.log('Sound manager initialized');
		return true;
	} catch (error) {
		console.error('Error initializing sound manager:', error);
		return false;
	}
}

/**
 * Preload default sounds
 * @returns {Promise<boolean>} Success status
 */
export async function preloadDefaultSounds() {
	try {
		console.log('Preloading default sounds...');
		
		const preloadPromises = [];
		
		for (const [id, config] of Object.entries(DEFAULT_SOUNDS)) {
			preloadPromises.push(loadSound(id, config.url, config));
		}
		
		await Promise.allSettled(preloadPromises);
		
		console.log('Default sounds preloaded');
		return true;
	} catch (error) {
		console.error('Error preloading default sounds:', error);
		return false;
	}
}

/**
 * Load a sound
 * @param {string} id - Sound ID
 * @param {string} url - Sound URL
 * @param {Object} options - Sound options
 * @returns {Promise<Object>} Sound object
 */
export async function loadSound(id, url, options = {}) {
	try {
		if (sounds[id]) {
			console.warn(`Sound with ID ${id} already exists`);
			return sounds[id];
		}
		
		console.log(`Loading sound: ${id} (${url})`);
		
		// Create sound object
		const sound = {
			id,
			url,
			volume: options.volume ?? 1,
			category: options.category ?? 'sfx',
			loop: options.loop ?? false,
			loaded: false,
			error: null,
			buffer: null,
			element: null,
			source: null,
			gainNode: null,
			isPlaying: false,
			instances: []
		};
		
		// Store sound immediately so it's available even if loading fails
		sounds[id] = sound;
		
		try {
			// Try to load using Web Audio API if available
			if (audioContext) {
				try {
					const response = await fetch(url);
					
					// Check if response is valid
					if (!response.ok) {
						// Create a silent buffer instead of throwing an error
						sound.buffer = audioContext.createBuffer(2, 44100, 44100);
						sound.loaded = true;
						return sound;
					}
					
					// Check if response has content
					const contentLength = response.headers.get('content-length');
					if (contentLength && parseInt(contentLength) === 0) {
						// Silent handling of empty files - no warnings
						sound.buffer = audioContext.createBuffer(2, 44100, 44100);
						sound.loaded = true;
						return sound;
					}
					
					const arrayBuffer = await response.arrayBuffer();
					sound.buffer = await audioContext.decodeAudioData(arrayBuffer);
					sound.loaded = true;
					console.log(`Sound loaded: ${id}`);
					return sound;
				} catch (error) {
					// Silently fall back to HTML5 Audio
					sound.buffer = audioContext.createBuffer(2, 44100, 44100);
					sound.loaded = true;
					return sound;
				}
			}
			
			// Fall back to HTML5 Audio
			sound.element = new Audio(url);
			sound.element.preload = 'auto';
			
			// Set up event listeners
			await new Promise((resolve) => {
				const loadHandler = () => {
					sound.loaded = true;
					console.log(`Sound loaded (HTML5): ${id}`);
					resolve();
				};
				
				const errorHandler = (e) => {
					// Create a silent audio element without warning
					sound.element = new Audio();
					sound.loaded = true;
					resolve();
				};
				
				sound.element.addEventListener('canplaythrough', loadHandler, { once: true });
				sound.element.addEventListener('error', errorHandler, { once: true });
				
				// Set a timeout in case the file is empty or doesn't load
				setTimeout(() => {
					if (!sound.loaded) {
						sound.element.removeEventListener('canplaythrough', loadHandler);
						sound.element.removeEventListener('error', errorHandler);
						sound.loaded = true;
						resolve();
					}
				}, 3000);
				
				sound.element.load();
			});
			
			return sound;
		} catch (error) {
			// Silently create a placeholder sound
			sound.error = error;
			sound.loaded = true; // Mark as loaded to prevent further loading attempts
			return sound;
		}
	} catch (error) {
		// Create a dummy sound object
		const dummySound = {
			id,
			url,
			volume: options.volume ?? 1,
			category: options.category ?? 'sfx',
			loop: options.loop ?? false,
			loaded: true,
			error,
			buffer: null,
			element: null,
			source: null,
			gainNode: null,
			isPlaying: false,
			instances: []
		};
		sounds[id] = dummySound;
		return dummySound;
	}
}

/**
 * Play a sound
 * @param {string} id - Sound ID
 * @param {Object} options - Playback options
 * @returns {boolean} Success status
 */
export function play(id, options = {}) {
	if (!isInitialized || isMuted) {
		return false;
	}
	
	// Check if sound exists
	if (!sounds[id]) {
		console.warn(`Sound ${id} not loaded`);
		// Try to load the sound if it's in the default sounds
		if (DEFAULT_SOUNDS[id]) {
			loadSound(id, DEFAULT_SOUNDS[id].url)
				.then(() => {
					// Try to play after loading
					play(id, options);
				})
				.catch(error => {
					console.error(`Failed to load sound ${id}:`, error);
				});
		}
		return false;
	}
	
	// Get sound
	const sound = sounds[id];
	
	// Apply volume
	const category = sound.category || 'sfx';
	const categoryVolume = category === 'music' ? musicVolume : sfxVolume;
	const volume = (options.volume !== undefined ? options.volume : sound.volume) * categoryVolume * masterVolume;
	
	// Play sound
	try {
		if (sound.buffer && audioContext) {
			// Web Audio API
			const source = audioContext.createBufferSource();
			source.buffer = sound.buffer;
			
			const gainNode = audioContext.createGain();
			gainNode.gain.value = volume;
			
			source.connect(gainNode);
			gainNode.connect(audioContext.destination);
			
			// Loop if specified
			source.loop = options.loop !== undefined ? options.loop : sound.loop || false;
			
			// Start playback
			source.start(0);
			
			// Store source for stopping later
			sound.source = source;
			sound.gainNode = gainNode;
			sound.isPlaying = true;
			
			// Set up ended event
			source.onended = () => {
				sound.isPlaying = false;
				sound.source = null;
				
				if (options.onEnded) {
					options.onEnded();
				}
			};
			
			return true;
		} else if (sound.element) {
			// HTML5 Audio
			sound.element.volume = volume;
			sound.element.loop = options.loop !== undefined ? options.loop : sound.loop || false;
			
			// Reset to beginning if already playing
			if (!sound.element.paused) {
				sound.element.currentTime = 0;
			} else {
				sound.element.play().catch(error => {
					console.error(`Error playing sound ${id}:`, error);
				});
			}
			
			sound.isPlaying = true;
			
			// Set up ended event
			sound.element.onended = () => {
				sound.isPlaying = false;
				
				if (options.onEnded) {
					options.onEnded();
				}
			};
			
			return true;
		}
	} catch (error) {
		console.error(`Error playing sound ${id}:`, error);
	}
	
	return false;
}

/**
 * Stop a sound instance
 * @param {Object} instance - Sound instance
 * @returns {boolean} Success status
 */
export function stopInstance(instance) {
	try {
		if (!instance || !instance.playing) {
			return false;
		}
		
		// Stop based on available API
		if (instance.source) {
			// Stop Web Audio API source
			try {
				instance.source.stop();
			} catch (error) {
				// Source might already be stopped
			}
		} else if (instance.element) {
			// Stop HTML5 Audio
			instance.element.pause();
			instance.element.currentTime = 0;
		}
		
		// Mark as not playing
		instance.playing = false;
		
		// Clean up instances
		cleanupInstances(instance.sound);
		
		return true;
	} catch (error) {
		console.error('Error stopping sound instance:', error);
		return false;
	}
}

/**
 * Stop all instances of a sound
 * @param {string} id - Sound ID
 * @returns {boolean} Success status
 */
export function stop(id) {
	try {
		const sound = sounds[id];
		
		if (!sound) {
			console.warn(`Sound ${id} not found`);
			return false;
		}
		
		// Stop all instances
		for (const instance of [...sound.instances]) {
			stopInstance(instance);
		}
		
		return true;
	} catch (error) {
		console.error(`Error stopping sound ${id}:`, error);
		return false;
	}
}

/**
 * Stop all sounds
 * @param {string} [category] - Optional category to stop
 * @returns {boolean} Success status
 */
export function stopAll(category) {
	try {
		for (const [id, sound] of Object.entries(sounds)) {
			if (!category || sound.category === category) {
				stop(id);
			}
		}
		
		return true;
	} catch (error) {
		console.error('Error stopping all sounds:', error);
		return false;
	}
}

/**
 * Pause a sound instance
 * @param {Object} instance - Sound instance
 * @returns {boolean} Success status
 */
export function pauseInstance(instance) {
	try {
		if (!instance || !instance.playing) {
			return false;
		}
		
		// Pause based on available API
		if (instance.source) {
			// Web Audio API doesn't support pause, so we need to stop
			// and recreate the source when resuming
			instance.pauseTime = audioContext.currentTime;
			try {
				instance.source.stop();
			} catch (error) {
				// Source might already be stopped
			}
		} else if (instance.element) {
			// Pause HTML5 Audio
			instance.element.pause();
		}
		
		// Mark as not playing
		instance.playing = false;
		instance.paused = true;
		
		return true;
	} catch (error) {
		console.error('Error pausing sound instance:', error);
		return false;
	}
}

/**
 * Resume a sound instance
 * @param {Object} instance - Sound instance
 * @returns {boolean} Success status
 */
export function resumeInstance(instance) {
	try {
		if (!instance || !instance.paused) {
			return false;
		}
		
		// Resume based on available API
		if (instance.sound.buffer && audioContext) {
			// Recreate source for Web Audio API
			instance.source = audioContext.createBufferSource();
			instance.source.buffer = instance.sound.buffer;
			instance.source.loop = instance.loop;
			
			// Connect nodes
			instance.source.connect(instance.gainNode);
			
			// Set up end event
			instance.source.onended = () => {
				instance.playing = false;
				cleanupInstances(instance.sound);
			};
			
			// Calculate offset
			const offset = instance.pauseTime || 0;
			
			// Start playback
			instance.source.start(0, offset);
		} else if (instance.element) {
			// Resume HTML5 Audio
			instance.element.play();
		}
		
		// Mark as playing
		instance.playing = true;
		instance.paused = false;
		
		return true;
	} catch (error) {
		console.error('Error resuming sound instance:', error);
		return false;
	}
}

/**
 * Pause all sounds
 * @param {string} [category] - Optional category to pause
 * @returns {boolean} Success status
 */
export function pauseAll(category) {
	try {
		for (const [id, sound] of Object.entries(sounds)) {
			if (!category || sound.category === category) {
				for (const instance of [...sound.instances]) {
					if (instance.playing) {
						pauseInstance(instance);
					}
				}
			}
		}
		
		return true;
	} catch (error) {
		console.error('Error pausing all sounds:', error);
		return false;
	}
}

/**
 * Resume all paused sounds
 * @param {string} [category] - Optional category to resume
 * @returns {boolean} Success status
 */
export function resumeAll(category) {
	try {
		for (const [id, sound] of Object.entries(sounds)) {
			if (!category || sound.category === category) {
				// Check if instances exists and is iterable
				if (sound.instances && Array.isArray(sound.instances)) {
					for (const instance of sound.instances) {
						if (instance && instance.paused) {
							resumeInstance(instance);
						}
					}
				}
			}
		}
		
		return true;
	} catch (error) {
		console.error('Error resuming all sounds:', error);
		return false;
	}
}

/**
 * Set master volume
 * @param {number} volume - Volume level (0-1)
 * @returns {boolean} Success status
 */
export function setMasterVolume(volume) {
	try {
		masterVolume = Math.max(0, Math.min(1, volume));
		updateAllVolumes();
		return true;
	} catch (error) {
		console.error('Error setting master volume:', error);
		return false;
	}
}

/**
 * Set music volume
 * @param {number} volume - Volume level (0-1)
 * @returns {boolean} Success status
 */
export function setMusicVolume(volume) {
	try {
		musicVolume = Math.max(0, Math.min(1, volume));
		updateCategoryVolumes('music');
		return true;
	} catch (error) {
		console.error('Error setting music volume:', error);
		return false;
	}
}

/**
 * Set SFX volume
 * @param {number} volume - Volume level (0-1)
 * @returns {boolean} Success status
 */
export function setSfxVolume(volume) {
	try {
		sfxVolume = Math.max(0, Math.min(1, volume));
		updateCategoryVolumes('sfx');
		return true;
	} catch (error) {
		console.error('Error setting SFX volume:', error);
		return false;
	}
}

/**
 * Mute all sounds
 * @param {boolean} [mute=true] - Whether to mute
 * @returns {boolean} Success status
 */
export function mute(mute = true) {
	try {
		_isMuted = mute;
		
		if (mute) {
			// Pause all playing sounds
			pauseAll();
		} else {
			// Resume all paused sounds
			resumeAll();
		}
		
		return true;
	} catch (error) {
		console.error('Error setting mute state:', error);
		return false;
	}
}

/**
 * Toggle mute state
 * @returns {boolean} New mute state
 */
export function toggleMute() {
	return mute(!_isMuted);
}

/**
 * Check if sound is muted
 * @returns {boolean} Mute state
 */
export function isMuted() {
	return _isMuted;
}

/**
 * Get master volume
 * @returns {number} Master volume
 */
export function getMasterVolume() {
	return masterVolume;
}

/**
 * Get music volume
 * @returns {number} Music volume
 */
export function getMusicVolume() {
	return musicVolume;
}

/**
 * Get SFX volume
 * @returns {number} SFX volume
 */
export function getSfxVolume() {
	return sfxVolume;
}

/**
 * Play music track
 * @param {string} id - Music ID
 * @param {Object} options - Playback options
 * @returns {boolean} Success status
 */
export function playMusic(id, options = {}) {
	// Stop current music if different
	if (currentMusic && currentMusic !== id) {
		stopMusic();
	}
	
	// Set as current music
	currentMusic = id;
	
	// Create default options for music
	const musicOptions = {
		loop: true,
		volume: 1.0,
		...options
	};
	
	// Check if sound exists in registry
	if (!sounds[id]) {
		console.warn(`Music ${id} not loaded, attempting to load it now`);
		
		// Check if it's in default sounds
		if (DEFAULT_SOUNDS[id]) {
			// Try to load the sound
			loadSound(id, DEFAULT_SOUNDS[id].url)
				.then(() => {
					// Try playing again after loading
					playMusic(id, options);
				})
				.catch(error => {
					console.error(`Failed to load music ${id}:`, error);
				});
		} else {
			console.error(`Music ${id} not found in default sounds`);
		}
		return false;
	}
	
	// Play the music
	return play(id, musicOptions);
}

/**
 * Stop current music
 * @returns {boolean} Success status
 */
export function stopMusic() {
	try {
		if (currentMusic) {
			stopInstance(currentMusic);
			currentMusic = null;
			return true;
		}
		
		return false;
	} catch (error) {
		console.error('Error stopping music:', error);
		return false;
	}
}

/**
 * Generate a simple tone
 * @param {Object} options - Tone options
 * @returns {Object|null} Sound instance or null if failed
 */
export function generateTone(options = {}) {
	try {
		if (!audioContext) {
			console.warn('Web Audio API not supported, cannot generate tone');
			return null;
		}
		
		// Default options
		const frequency = options.frequency ?? 440; // A4
		const type = options.type ?? 'sine'; // sine, square, sawtooth, triangle
		const duration = options.duration ?? 0.5; // seconds
		const volume = options.volume ?? 0.5;
		const attack = options.attack ?? 0.01;
		const release = options.release ?? 0.1;
		
		// Create oscillator
		const oscillator = audioContext.createOscillator();
		oscillator.type = type;
		oscillator.frequency.value = frequency;
		
		// Create gain node
		const gainNode = audioContext.createGain();
		gainNode.gain.value = 0;
		
		// Connect nodes
		oscillator.connect(gainNode);
		gainNode.connect(audioContext.destination);
		
		// Create instance
		const instance = {
			id: `tone_${Date.now()}`,
			oscillator,
			gainNode,
			startTime: audioContext.currentTime,
			duration,
			playing: true
		};
		
		// Start oscillator
		oscillator.start();
		
		// Apply envelope
		gainNode.gain.setValueAtTime(0, audioContext.currentTime);
		gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + attack);
		gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration - release);
		
		// Stop oscillator after duration
		oscillator.stop(audioContext.currentTime + duration);
		
		// Set up end event
		oscillator.onended = () => {
			instance.playing = false;
		};
		
		return instance;
	} catch (error) {
		console.error('Error generating tone:', error);
		return null;
	}
}

/**
 * Clean up resources
 */
export function cleanup() {
	try {
		console.log('Cleaning up sound manager...');
		
		// Stop all sounds
		stopAll();
		
		// Close audio context
		if (audioContext) {
			audioContext.close();
			audioContext = null;
		}
		
		// Reset state
		for (const key in sounds) {
			delete sounds[key];
		}
		masterVolume = 0.7;
		musicVolume = 0.5;
		sfxVolume = 0.8;
		_isMuted = false;
		isInitialized = false;
		currentMusic = null;
		
		console.log('Sound manager cleaned up');
	} catch (error) {
		console.error('Error cleaning up sound manager:', error);
	}
}

// Helper functions

/**
 * Update volumes for all sound instances
 */
function updateAllVolumes() {
	try {
		for (const sound of Object.values(sounds)) {
			for (const instance of sound.instances) {
				updateInstanceVolume(instance);
			}
		}
	} catch (error) {
		console.error('Error updating all volumes:', error);
	}
}

/**
 * Update volumes for a category
 * @param {string} category - Sound category
 */
function updateCategoryVolumes(category) {
	try {
		for (const sound of Object.values(sounds)) {
			if (sound.category === category) {
				for (const instance of sound.instances) {
					updateInstanceVolume(instance);
				}
			}
		}
	} catch (error) {
		console.error(`Error updating ${category} volumes:`, error);
	}
}

/**
 * Update volume for a sound instance
 * @param {Object} instance - Sound instance
 */
function updateInstanceVolume(instance) {
	try {
		if (!instance) {
			return;
		}
		
		// Calculate volume
		const category = instance.sound.category || 'sfx';
		const categoryVolume = category === 'music' ? musicVolume : sfxVolume;
		const volume = instance.volume * categoryVolume * masterVolume;
		
		// Apply volume based on available API
		if (instance.gainNode) {
			// Update Web Audio API gain
			instance.gainNode.gain.value = volume;
		} else if (instance.element) {
			// Update HTML5 Audio volume
			instance.element.volume = volume;
		}
	} catch (error) {
		console.error('Error updating instance volume:', error);
	}
}

/**
 * Clean up inactive instances
 * @param {Object} sound - Sound object
 */
function cleanupInstances(sound) {
	try {
		if (!sound || !sound.instances) {
			return;
		}
		
		// Remove inactive instances
		sound.instances = sound.instances.filter(instance => instance.playing);
	} catch (error) {
		console.error('Error cleaning up instances:', error);
	}
}

/**
 * Handle music change
 * @param {string} id - Music ID
 * @param {Object} instance - Sound instance
 */
function handleMusicChange(id, instance) {
	try {
		// Stop current music if different
		if (currentMusic && currentMusic.sound.id !== id) {
			stopInstance(currentMusic);
		}
		
		// Set as current music
		currentMusic = instance;
	} catch (error) {
		console.error('Error handling music change:', error);
	}
}

/**
 * Set up user interaction detection
 */
function setupUserInteractionDetection() {
	try {
		// List of events that indicate user interaction
		const interactionEvents = [
			'click',
			'touchstart',
			'touchend',
			'mousedown',
			'keydown'
		];
		
		// Add event listeners
		const handleInteraction = () => {
			hasUserInteraction = true;
			
			// Resume audio context if suspended
			if (audioContext && audioContext.state === 'suspended') {
				audioContext.resume();
			}
			
			// Remove event listeners once interaction is detected
			interactionEvents.forEach(event => {
				document.removeEventListener(event, handleInteraction);
			});
		};
		
		// Add event listeners
		interactionEvents.forEach(event => {
			document.addEventListener(event, handleInteraction);
		});
	} catch (error) {
		console.error('Error setting up user interaction detection:', error);
	}
} 