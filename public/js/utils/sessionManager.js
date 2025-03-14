/**
 * Session Manager
 * 
 * Handles player session management and persistence.
 */

import { STORAGE_KEYS } from '../core/constants.js';
import { generateId } from './helpers.js';

// Session variable
let session = null;

/**
 * Initialize session
 * @returns {Object} Session data
 */
export function initSession() {
	try {
		console.log('Initializing session');
		
		// Check if session already exists
		if (session) {
			console.log('Session already initialized');
			return session;
		}
		
		// Try to load session from storage
		const loadedSession = loadSessionFromStorage();
		
		if (loadedSession) {
			console.log('Session loaded from storage');
			session = loadedSession;
		} else {
			// Create new session
			console.log('Creating new session');
			session = createNewSession();
			saveSessionToStorage();
		}
		
		return session;
	} catch (error) {
		console.error('Error initializing session:', error);
		
		// Create fallback session
		session = {
			playerId: 'fallback-' + Date.now(),
			playerName: 'Player',
			created: Date.now(),
			lastActive: Date.now()
		};
		
		return session;
	}
}

/**
 * Create new session
 * @returns {Object} New session
 */
function createNewSession() {
	try {
		return {
			playerId: generateId(8),
			playerName: 'Player',
			created: Date.now(),
			lastActive: Date.now()
		};
	} catch (error) {
		console.error('Error creating new session:', error);
		throw error;
	}
}

/**
 * Load session from storage
 * @returns {Object|null} Session data or null if not found
 */
function loadSessionFromStorage() {
	try {
		const sessionData = localStorage.getItem(STORAGE_KEYS.SESSION);
		
		if (!sessionData) {
			return null;
		}
		
		return JSON.parse(sessionData);
	} catch (error) {
		console.error('Error loading session from storage:', error);
		return null;
	}
}

/**
 * Save session to storage
 */
function saveSessionToStorage() {
	try {
		if (!session) {
			console.warn('No session to save');
			return;
		}
		
		localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
	} catch (error) {
		console.error('Error saving session to storage:', error);
	}
}

/**
 * Update session
 * @param {Object} data - Session data to update
 */
export function updateSession(data) {
	try {
		if (!session) {
			initSession();
		}
		
		// Update session data
		session = {
			...session,
			...data,
			lastActive: Date.now()
		};
		
		// Save to storage
		saveSessionToStorage();
		
		return session;
	} catch (error) {
		console.error('Error updating session:', error);
		return session;
	}
}

/**
 * Get player ID
 * @returns {string} Player ID
 */
export function getPlayerId() {
	if (!session) {
		initSession();
	}
	
	return session.playerId;
}

/**
 * Get player name
 * @returns {string} Player name
 */
export function getPlayerName() {
	if (!session) {
		initSession();
	}
	
	return session.playerName;
}

/**
 * Set player name
 * @param {string} name - Player name
 */
export function setPlayerName(name) {
	updateSession({ playerName: name });
}

/**
 * Save game state
 * @param {Object} gameState - Game state to save
 */
export function saveGameState(gameState) {
	try {
		localStorage.setItem(STORAGE_KEYS.GAME_STATE, JSON.stringify(gameState));
	} catch (error) {
		console.error('Error saving game state:', error);
	}
}

/**
 * Load game state
 * @returns {Object|null} Game state or null if not found
 */
export function loadGameState() {
	try {
		const gameState = localStorage.getItem(STORAGE_KEYS.GAME_STATE);
		
		if (!gameState) {
			return null;
		}
		
		return JSON.parse(gameState);
	} catch (error) {
		console.error('Error loading game state:', error);
		return null;
	}
}

/**
 * Clear session data
 */
export function clearSession() {
	try {
		localStorage.removeItem(STORAGE_KEYS.SESSION);
		localStorage.removeItem(STORAGE_KEYS.GAME_STATE);
		session = null;
	} catch (error) {
		console.error('Error clearing session:', error);
	}
}

/**
 * Get session data
 * @returns {Object} Session data
 */
export function getSession() {
	if (!session) {
		initSession();
	}
	
	return session;
}
