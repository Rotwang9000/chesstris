/**
 * Sound Manager Module
 * Handles loading and playing sound effects for the game
 */

// Sound effects
const sounds = {
	// Tetromino sounds
	move: new Audio('/sounds/move.mp3'),
	rotate: new Audio('/sounds/rotate.mp3'),
	drop: new Audio('/sounds/drop.mp3'),
	lineClear: new Audio('/sounds/line_clear.mp3'),
	tetris: new Audio('/sounds/tetris.mp3'),
	
	// Chess sounds
	chessPieceMove: new Audio('/sounds/chess_move.mp3'),
	chessPieceCapture: new Audio('/sounds/chess_capture.mp3'),
	
	// Game sounds
	levelUp: new Audio('/sounds/level_up.mp3'),
	gameOver: new Audio('/sounds/game_over.mp3'),
	
	// UI sounds
	buttonClick: new Audio('/sounds/button_click.mp3'),
	notification: new Audio('/sounds/notification.mp3')
};

// Sound settings
let isMuted = false;
let volume = 0.5;

/**
 * Initialize the sound manager
 * @param {Object} options - Sound options
 */
export function init(options = {}) {
	// Set initial volume
	setVolume(options.volume || 0.5);
	
	// Set initial mute state
	setMuted(options.muted || false);
	
	// Preload sounds
	preloadSounds();
	
	// Expose the sound manager globally
	window.SoundManager = {
		playSound,
		setVolume,
		setMuted,
		isMuted: () => isMuted,
		getVolume: () => volume
	};
	
	console.log('Sound manager initialized');
}

/**
 * Preload all sounds
 */
function preloadSounds() {
	// Set all sounds to preload
	Object.values(sounds).forEach(sound => {
		sound.preload = 'auto';
	});
}

/**
 * Play a sound effect
 * @param {string} soundName - The name of the sound to play
 * @param {Object} options - Options for playing the sound
 * @param {number} options.volume - Volume override for this sound (0-1)
 * @param {boolean} options.loop - Whether to loop the sound
 * @returns {HTMLAudioElement|null} The audio element or null if sound doesn't exist
 */
export function playSound(soundName, options = {}) {
	// Skip if muted
	if (isMuted) return null;
	
	// Get the sound
	const sound = sounds[soundName];
	
	// Skip if sound doesn't exist
	if (!sound) {
		console.warn(`Sound "${soundName}" not found`);
		return null;
	}
	
	try {
		// Reset the sound
		sound.currentTime = 0;
		
		// Set volume
		sound.volume = options.volume !== undefined ? options.volume : volume;
		
		// Set loop
		sound.loop = options.loop || false;
		
		// Play the sound
		sound.play().catch(error => {
			console.warn(`Error playing sound "${soundName}":`, error);
		});
		
		return sound;
	} catch (error) {
		console.warn(`Error playing sound "${soundName}":`, error);
		return null;
	}
}

/**
 * Set the global volume
 * @param {number} newVolume - The new volume (0-1)
 */
export function setVolume(newVolume) {
	// Ensure volume is between 0 and 1
	volume = Math.max(0, Math.min(1, newVolume));
	
	// Update all sounds
	Object.values(sounds).forEach(sound => {
		sound.volume = volume;
	});
}

/**
 * Set the muted state
 * @param {boolean} muted - Whether to mute sounds
 */
export function setMuted(muted) {
	isMuted = muted;
}

// Export the sound manager
export default {
	init,
	playSound,
	setVolume,
	setMuted,
	isMuted: () => isMuted,
	getVolume: () => volume
}; 