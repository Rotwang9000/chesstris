/**
 * Session Manager - Handles player sessions, persistence and wallet integration
 */
import { v4 as uuidv4 } from '../utils/uuid.js';
import GameState from '../game/gameState.js';

// Key for storing session data in local storage
const SESSION_STORAGE_KEY = 'chesstris_session';

// Session data structure
let sessionData = {
	playerId: null,
	username: null,
	walletConnected: false,
	walletAddress: null,
	lastSaved: null
};

/**
 * Initialize the session manager
 * Loads existing session or creates a new one
 */
export function initSession() {
	try {
		// Try to load existing session from localStorage
		const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
		
		if (savedSession) {
			// Session exists, parse and use it
			const parsedSession = JSON.parse(savedSession);
			sessionData = { ...sessionData, ...parsedSession };
			console.log('Loaded existing session:', sessionData.playerId);
		} else {
			// No existing session, create a new one
			createNewSession();
		}
		
		return sessionData;
	} catch (error) {
		console.error('Error initializing session:', error);
		// If there's an error, create a fresh session
		createNewSession();
		return sessionData;
	}
}

/**
 * Create a new player session
 */
function createNewSession() {
	// Generate a unique player ID
	sessionData.playerId = `player-${uuidv4().substring(0, 8)}`;
	sessionData.username = `Player ${Math.floor(Math.random() * 1000)}`;
	sessionData.lastSaved = Date.now();
	
	// Save to localStorage
	saveSession();
	
	console.log('Created new session:', sessionData.playerId);
}

/**
 * Save the current session to localStorage
 */
export function saveSession() {
	try {
		sessionData.lastSaved = Date.now();
		localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
	} catch (error) {
		console.error('Error saving session to localStorage:', error);
	}
}

/**
 * Connect a Solana wallet
 * @param {string} walletAddress - The connected wallet address
 */
export function connectWallet(walletAddress) {
	try {
		sessionData.walletConnected = true;
		sessionData.walletAddress = walletAddress;
		saveSession();
		
		// TODO: Check if this wallet has a saved game on the server
		// If so, prompt the user to load it
		
		console.log('Connected wallet:', walletAddress);
		return true;
	} catch (error) {
		console.error('Error connecting wallet:', error);
		return false;
	}
}

/**
 * Disconnect the wallet
 */
export function disconnectWallet() {
	sessionData.walletConnected = false;
	sessionData.walletAddress = null;
	saveSession();
	console.log('Wallet disconnected');
}

/**
 * Get the current session data
 */
export function getSessionData() {
	return { ...sessionData };
}

/**
 * Update the player's username
 * @param {string} username - New username to set
 */
export function setUsername(username) {
	if (username && username.trim()) {
		sessionData.username = username.trim();
		saveSession();
		return true;
	}
	return false;
}

/**
 * Save game state to server using wallet address
 * This would be implemented with an API call to your backend
 */
export async function saveGameToServer() {
	if (!sessionData.walletConnected || !sessionData.walletAddress) {
		console.warn('Cannot save to server: No wallet connected');
		return false;
	}
	
	try {
		const gameState = GameState.getGameState();
		
		// TODO: Implement the actual API call to save the game state
		// This is a placeholder
		console.log('Saving game state to server for wallet:', sessionData.walletAddress);
		
		// Simulating a successful save
		sessionData.lastSaved = Date.now();
		saveSession();
		return true;
	} catch (error) {
		console.error('Error saving game to server:', error);
		return false;
	}
}

/**
 * Load game state from server using wallet address
 * This would be implemented with an API call to your backend
 */
export async function loadGameFromServer() {
	if (!sessionData.walletConnected || !sessionData.walletAddress) {
		console.warn('Cannot load from server: No wallet connected');
		return false;
	}
	
	try {
		// TODO: Implement the actual API call to load the game state
		// This is a placeholder
		console.log('Loading game state from server for wallet:', sessionData.walletAddress);
		
		// Simulating a successful load
		// In a real implementation, you would:
		// 1. Fetch the game state from your server
		// 2. Parse the response
		// 3. Update the GameState
		
		return true;
	} catch (error) {
		console.error('Error loading game from server:', error);
		return false;
	}
}

export default {
	initSession,
	saveSession,
	connectWallet,
	disconnectWallet,
	getSessionData,
	setUsername,
	saveGameToServer,
	loadGameFromServer
}; 