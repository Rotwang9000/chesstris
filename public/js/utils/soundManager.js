/**
 * Sound Manager
 * 
 * Handles audio effects and music for the game.
 */

// Sound state
let isMuted = false;
let musicVolume = 0.5;
let sfxVolume = 0.7;
let isInitialized = false;
let currentMusic = null;
let sounds = {};

// Sound paths
const SOUND_PATHS = {
	// UI sounds
	menu_select: 'sounds/ui/menu_select.mp3',
	menu_confirm: 'sounds/ui/menu_confirm.mp3',
	menu_back: 'sounds/ui/menu_back.mp3',
	
	// Game sounds
	game_start: 'sounds/game/game_start.mp3',
	game_over: 'sounds/game/game_over.mp3',
	pause: 'sounds/game/pause.mp3',
	resume: 'sounds/game/resume.mp3',
	
	// Tetromino sounds
	tetromino_move: 'sounds/tetromino/move.mp3',
	tetromino_rotate: 'sounds/tetromino/rotate.mp3',
	tetromino_land: 'sounds/tetromino/land.mp3',
	tetromino_hard_drop: 'sounds/tetromino/hard_drop.mp3',
	tetromino_hold: 'sounds/tetromino/hold.mp3',
	
	// Line clear sounds
	line_clear_single: 'sounds/line_clear/single.mp3',
	line_clear_double: 'sounds/line_clear/double.mp3',
	line_clear_triple: 'sounds/line_clear/triple.mp3',
	line_clear_tetris: 'sounds/line_clear/tetris.mp3',
	
	// Chess sounds
	chess_select: 'sounds/chess/select.mp3',
	chess_move: 'sounds/chess/move.mp3',
	chess_capture: 'sounds/chess/capture.mp3',
	chess_check: 'sounds/chess/check.mp3',
	chess_checkmate: 'sounds/chess/checkmate.mp3',
	
	// Level sounds
	level_up: 'sounds/level_up.mp3',
	score: 'sounds/score.mp3',
	
	// Music
	music_menu: 'sounds/music/menu.mp3',
	music_game: 'sounds/music/game.mp3',
	music_intense: 'sounds/music/intense.mp3'
};

/**
 * Initialize the sound manager
 */
export function init() {
	try {
		if (isInitialized) {
			return;
		}
		
		console.log('Initializing sound manager...');
		
		// Create audio context if supported
		if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
			window.AudioContext = window.AudioContext || window.webkitAudioContext;
		} else {
			console.warn('Web Audio API not supported in this browser');
		}
		
		// Load sounds
		preloadSounds();
		
		// Set up event listeners
		setupEventListeners();
		
		isInitialized = true;
		console.log('Sound manager initialized');
	} catch (error) {
		console.error('Error initializing sound manager:', error);
	}
}

/**
 * Preload sounds
 */
function preloadSounds() {
	try {
		// Create mock sounds for development
		createMockSounds();
		console.log('Creating mock sounds for development');
		return;
		
		// This code is unreachable but kept for future reference
		// Preload all sounds
		for (const [key, path] of Object.entries(SOUND_PATHS)) {
			const audio = new Audio();
			audio.src = path;
			audio.preload = 'auto';
			
			// Set volume based on type
			if (key.startsWith('music_')) {
				audio.volume = musicVolume;
				audio.loop = true;
			} else {
				audio.volume = sfxVolume;
			}
			
			sounds[key] = audio;
		}
		
		console.log('Sounds preloaded');
	} catch (error) {
		console.error('Error preloading sounds:', error);
		createMockSounds();
	}
}

/**
 * Check if sound paths are available
 * @returns {boolean} - Whether sound paths are available
 */
function arePathsAvailable() {
	try {
		// Try to fetch one sound file to check if paths are valid
		const testPath = SOUND_PATHS.menu_select;
		const request = new XMLHttpRequest();
		request.open('HEAD', testPath, false);
		request.send();
		
		return request.status !== 404;
	} catch (error) {
		console.error('Error checking sound paths:', error);
		return false;
	}
}

/**
 * Create mock sounds for development
 */
function createMockSounds() {
	try {
		console.log('Creating mock sounds for development');
		
		// Create mock audio objects
		for (const key of Object.keys(SOUND_PATHS)) {
			sounds[key] = {
				play: () => console.log(`Playing sound: ${key}`),
				pause: () => console.log(`Pausing sound: ${key}`),
				currentTime: 0,
				volume: key.startsWith('music_') ? musicVolume : sfxVolume,
				loop: key.startsWith('music_'),
				isMock: true
			};
		}
	} catch (error) {
		console.error('Error creating mock sounds:', error);
	}
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
	try {
		// Listen for mute/unmute key
		document.addEventListener('keydown', (event) => {
			if (event.key === 'm') {
				toggleMute();
			}
		});
	} catch (error) {
		console.error('Error setting up sound event listeners:', error);
	}
}

/**
 * Play a sound
 * @param {string} soundId - Sound ID
 */
export function playSound(soundId) {
	try {
		console.log(`Playing sound: ${soundId}`);
		
		if (!isInitialized || isMuted) {
			return;
		}
		
		const sound = sounds[soundId];
		if (!sound) {
			console.warn(`Sound not found: ${soundId}`);
			return;
		}
		
		// For mock sounds, just log and return
		if (sound.isMock) {
			console.log(`Mock sound played: ${soundId}`);
			return;
		}
		
		// Reset sound to beginning
		sound.currentTime = 0;
		
		// Play sound
		const playPromise = sound.play();
		if (playPromise !== undefined) {
			playPromise.catch(error => {
				console.warn(`Error playing sound ${soundId}:`, error);
			});
		}
	} catch (error) {
		console.error(`Error playing sound ${soundId}:`, error);
	}
}

/**
 * Play music
 * @param {string} musicId - Music ID
 */
export function playMusic(musicId) {
	try {
		console.log(`Playing music: ${musicId}`);
		
		if (!isInitialized) {
			return;
		}
		
		// Stop current music
		stopMusic();
		
		// Get music
		const music = sounds[musicId];
		if (!music) {
			console.warn(`Music not found: ${musicId}`);
			return;
		}
		
		// Set current music
		currentMusic = musicId;
		
		// For mock music, just log and return
		if (music.isMock) {
			console.log(`Mock music played: ${musicId}`);
			return;
		}
		
		// Play music if not muted
		if (!isMuted) {
			music.currentTime = 0;
			music.loop = true;
			const playPromise = music.play();
			if (playPromise !== undefined) {
				playPromise.catch(error => {
					console.warn(`Error playing music ${musicId}:`, error);
				});
			}
		}
	} catch (error) {
		console.error(`Error playing music ${musicId}:`, error);
	}
}

/**
 * Stop music
 */
export function stopMusic() {
	try {
		if (!isInitialized || !currentMusic) {
			return;
		}
		
		const music = sounds[currentMusic];
		if (music) {
			music.pause();
			music.currentTime = 0;
		}
		
		currentMusic = null;
	} catch (error) {
		console.error('Error stopping music:', error);
	}
}

/**
 * Toggle mute
 */
export function toggleMute() {
	try {
		isMuted = !isMuted;
		
		// Update all sounds
		for (const [key, sound] of Object.entries(sounds)) {
			if (key.startsWith('music_')) {
				sound.volume = isMuted ? 0 : musicVolume;
			} else {
				sound.volume = isMuted ? 0 : sfxVolume;
			}
		}
		
		// Pause or play current music
		if (currentMusic) {
			const music = sounds[currentMusic];
			if (music) {
				if (isMuted) {
					music.pause();
				} else {
					music.play().catch(error => {
						console.warn(`Error resuming music ${currentMusic}:`, error);
					});
				}
			}
		}
		
		console.log(`Sound ${isMuted ? 'muted' : 'unmuted'}`);
	} catch (error) {
		console.error('Error toggling mute:', error);
	}
}

/**
 * Set music volume
 * @param {number} volume - Volume (0-1)
 */
export function setMusicVolume(volume) {
	try {
		if (volume < 0 || volume > 1) {
			console.warn(`Invalid volume: ${volume}`);
			return;
		}
		
		musicVolume = volume;
		
		// Update music volumes
		for (const [key, sound] of Object.entries(sounds)) {
			if (key.startsWith('music_')) {
				sound.volume = isMuted ? 0 : musicVolume;
			}
		}
		
		console.log(`Music volume set to ${volume}`);
	} catch (error) {
		console.error('Error setting music volume:', error);
	}
}

/**
 * Set SFX volume
 * @param {number} volume - Volume (0-1)
 */
export function setSfxVolume(volume) {
	try {
		if (volume < 0 || volume > 1) {
			console.warn(`Invalid volume: ${volume}`);
			return;
		}
		
		sfxVolume = volume;
		
		// Update SFX volumes
		for (const [key, sound] of Object.entries(sounds)) {
			if (!key.startsWith('music_')) {
				sound.volume = isMuted ? 0 : sfxVolume;
			}
		}
		
		console.log(`SFX volume set to ${volume}`);
	} catch (error) {
		console.error('Error setting SFX volume:', error);
	}
}

/**
 * Check if sound is muted
 * @returns {boolean} - Whether sound is muted
 */
export function isSoundMuted() {
	return isMuted;
}

/**
 * Get music volume
 * @returns {number} - Music volume
 */
export function getMusicVolume() {
	return musicVolume;
}

/**
 * Get SFX volume
 * @returns {number} - SFX volume
 */
export function getSfxVolume() {
	return sfxVolume;
}

/**
 * Clean up the sound manager
 */
export function cleanup() {
	try {
		// Stop all sounds
		stopMusic();
		
		for (const sound of Object.values(sounds)) {
			if (sound.pause) {
				sound.pause();
			}
		}
		
		// Clear sounds
		sounds = {};
		
		isInitialized = false;
		console.log('Sound manager cleaned up');
	} catch (error) {
		console.error('Error cleaning up sound manager:', error);
	}
} 