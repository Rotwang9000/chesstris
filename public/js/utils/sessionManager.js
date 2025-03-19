/**
 * Session Manager Utility
 * 
 * Handles player session data, including:
 * - Player ID and username
 * - Settings and preferences
 * - Game statistics
 */

import { generateUUID } from './helpers.js';

// Session constants
const SESSION_KEY = 'shaktris_session';
const SETTINGS_KEY = 'shaktris_settings';
const STATS_KEY = 'shaktris_stats';

// Session data
let sessionData = {
	playerId: null,
	playerName: null,
	createdAt: null,
	lastAccess: null
};

// Default settings
const defaultSettings = {
	renderMode: null, // Will be determined by window.is2DMode
	musicVolume: 50,
	sfxVolume: 70,
	muted: false,
	ghostPieceEnabled: true,
	gameSpeed: 'normal'
};

// Default stats
const defaultStats = {
	gamesPlayed: 0,
	gamesWon: 0,
	highScore: 0,
	totalScore: 0,
	tetrominosPlaced: 0,
	linesCleared: 0,
	chessPiecesMoved: 0,
	chessPiecesCaptured: 0,
	timePlayed: 0
};

// Current settings and stats
let settings = { ...defaultSettings };
let stats = { ...defaultStats };

/**
 * Initialize session
 * @returns {Promise<Object>} - Session data
 */
export async function initSession() {
	try {
		console.log('Initializing session...');
		
		// Load session data
		loadSession();
		
		// Create new session if not found
		if (!sessionData.playerId) {
			createNewSession();
		}
		
		// Update last access time
		sessionData.lastAccess = Date.now();
		saveSession();
		
		// Load settings and stats
		loadSettings();
		loadStats();
		
		console.log('Session initialized for player:', sessionData.playerName);
		
		return sessionData;
	} catch (error) {
		console.error('Error initializing session:', error);
		
		// Fallback to new session if error
		createNewSession();
		saveSession();
		
		return sessionData;
	}
}

/**
 * Alias for initSession to maintain compatibility
 * @returns {Promise<Object>} - Session data
 */
export const init = initSession;

/**
 * Create a new session
 */
function createNewSession() {
	console.log('Creating new session...');
	
	// Generate new player ID
	const playerId = generateUUID();
	
	// Create default player name
	const playerName = `Player_${Math.floor(Math.random() * 10000)}`;
	
	// Set session data
	sessionData = {
		playerId: playerId,
		playerName: playerName,
		createdAt: Date.now(),
		lastAccess: Date.now()
	};
	
	// Reset settings and stats
	settings = { ...defaultSettings };
	stats = { ...defaultStats };
	
	// Save everything
	saveSession();
	saveSettings();
	saveStats();
}

/**
 * Load session data
 */
function loadSession() {
	try {
		// Get session data from local storage
		const savedSession = localStorage.getItem(SESSION_KEY);
		
		if (savedSession) {
			// Parse and validate session data
			const parsedSession = JSON.parse(savedSession);
			
			// Check if session data is valid
			if (parsedSession && parsedSession.playerId) {
				sessionData = parsedSession;
				console.log('Loaded existing session for player:', parsedSession.playerName);
			}
		}
	} catch (error) {
		console.error('Error loading session:', error);
	}
}

/**
 * Save session data
 */
function saveSession() {
	try {
		localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
	} catch (error) {
		console.error('Error saving session:', error);
	}
}

/**
 * Load user settings
 */
function loadSettings() {
	try {
		// Get settings from local storage
		const savedSettings = localStorage.getItem(SETTINGS_KEY);
		
		if (savedSettings) {
			// Parse settings
			const parsedSettings = JSON.parse(savedSettings);
			
			// Merge with default settings (to handle new settings properties)
			settings = { ...defaultSettings, ...parsedSettings };
		}
	} catch (error) {
		console.error('Error loading settings:', error);
	}
}

/**
 * Save user settings
 */
function _saveSettings() {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
	} catch (error) {
		console.error('Error saving settings:', error);
	}
}

/**
 * Load game statistics
 */
function loadStats() {
	try {
		// Get stats from local storage
		const savedStats = localStorage.getItem(STATS_KEY);
		
		if (savedStats) {
			// Parse stats
			const parsedStats = JSON.parse(savedStats);
			
			// Merge with default stats (to handle new stats properties)
			stats = { ...defaultStats, ...parsedStats };
		}
	} catch (error) {
		console.error('Error loading stats:', error);
	}
}

/**
 * Save game statistics
 */
function saveStats() {
	try {
		localStorage.setItem(STATS_KEY, JSON.stringify(stats));
	} catch (error) {
		console.error('Error saving stats:', error);
	}
}

/**
 * Get player ID
 * @returns {string} - Player ID
 */
export function getPlayerId() {
	return sessionData.playerId;
}

/**
 * Get player name
 * @returns {string} - Player name
 */
export function getPlayerName() {
	return sessionData.playerName;
}

/**
 * Set player name
 * @param {string} name - New player name
 */
export function setPlayerName(name) {
	if (!name || typeof name !== 'string' || name.trim() === '') {
		console.warn('Invalid player name, ignoring');
		return;
	}
	
	sessionData.playerName = name.trim();
	saveSession();
}

/**
 * Get all session data
 * @returns {Object} - Session data
 */
export function getSessionData() {
	return { ...sessionData };
}

/**
 * Get user settings
 * @returns {Object} - User settings
 */
export function getSettings() {
	return { ...settings };
}

/**
 * Save user settings
 * @param {Object} newSettings - New settings to save
 */
export function saveSettings(newSettings) {
	// Merge new settings with existing settings
	settings = { ...settings, ...newSettings };
	
	// Filter out null or undefined values
	Object.keys(settings).forEach(key => {
		if (settings[key] === null || settings[key] === undefined) {
			delete settings[key];
		}
	});
	
	// Save to local storage
	_saveSettings();
}

/**
 * Get game statistics
 * @returns {Object} - Game statistics
 */
export function getStats() {
	return { ...stats };
}

/**
 * Update game statistics
 * @param {Object} newStats - New statistics to update
 */
export function updateStats(newStats) {
	// Merge new stats with existing stats
	stats = { ...stats, ...newStats };
	
	// Save to local storage
	saveStats();
}

/**
 * Record game played
 * @param {Object} gameData - Game data
 */
export function recordGamePlayed(gameData = {}) {
	// Update stats
	stats.gamesPlayed += 1;
	stats.totalScore += gameData.score || 0;
	
	// Update high score if needed
	if (gameData.score > stats.highScore) {
		stats.highScore = gameData.score;
	}
	
	// Update other stats if provided
	if (gameData.linesCleared) {
		stats.linesCleared += gameData.linesCleared;
	}
	
	if (gameData.tetrominosPlaced) {
		stats.tetrominosPlaced += gameData.tetrominosPlaced;
	}
	
	if (gameData.chessPiecesMoved) {
		stats.chessPiecesMoved += gameData.chessPiecesMoved;
	}
	
	if (gameData.chessPiecesCaptured) {
		stats.chessPiecesCaptured += gameData.chessPiecesCaptured;
	}
	
	if (gameData.timePlayed) {
		stats.timePlayed += gameData.timePlayed;
	}
	
	// Record win if provided
	if (gameData.won) {
		stats.gamesWon += 1;
	}
	
	// Save stats
	saveStats();
}

/**
 * Clear all session data
 */
export function clearSession() {
	try {
		// Remove all data from local storage
		localStorage.removeItem(SESSION_KEY);
		localStorage.removeItem(SETTINGS_KEY);
		localStorage.removeItem(STATS_KEY);
		
		// Reset to defaults
		createNewSession();
	} catch (error) {
		console.error('Error clearing session:', error);
	}
}
