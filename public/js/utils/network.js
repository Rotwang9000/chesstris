/**
 * Network Module
 * 
 * Handles communication with the server, including socket connections
 * and API requests.
 */

import io from 'socket.io-client';
import * as Helpers from './helpers.js';

// Socket.io instance
let socket = null;

// Event listeners
const eventListeners = {};

// Server URL
const SERVER_URL = window.location.hostname === 'localhost' 
	? `http://${window.location.hostname}:3000` 
	: window.location.origin;

// API endpoints
const API = {
	USERS: `${SERVER_URL}/api/users`,
	GAMES: `${SERVER_URL}/api/games`,
	STATS: `${SERVER_URL}/api/stats`,
	TRANSACTIONS: `${SERVER_URL}/api/transactions`
};

/**
 * Initialize the socket connection
 * @param {Object} options - Connection options
 * @returns {Promise<Object>} The socket instance
 */
export function initSocket(options = {}) {
	return new Promise((resolve, reject) => {
		try {
			// Close existing socket if any
			if (socket) {
				socket.close();
			}
			
			// Connect to the server
			socket = io(SERVER_URL, {
				transports: ['websocket'],
				reconnection: true,
				reconnectionAttempts: 5,
				reconnectionDelay: 1000,
				...options
			});
			
			// Handle connection events
			socket.on('connect', () => {
				console.log('Connected to server');
				resolve(socket);
			});
			
			socket.on('connect_error', (error) => {
				console.error('Connection error:', error);
				reject(error);
			});
			
			socket.on('disconnect', (reason) => {
				console.log('Disconnected from server:', reason);
			});
			
			// Re-register event listeners
			for (const event in eventListeners) {
				for (const callback of eventListeners[event]) {
					socket.on(event, callback);
				}
			}
		} catch (error) {
			console.error('Socket initialization error:', error);
			reject(error);
		}
	});
}

/**
 * Get the socket instance
 * @returns {Object|null} The socket instance or null if not connected
 */
export function getSocket() {
	return socket;
}

/**
 * Check if the socket is connected
 * @returns {boolean} Whether the socket is connected
 */
export function isConnected() {
	return socket && socket.connected;
}

/**
 * Add an event listener
 * @param {string} event - The event name
 * @param {Function} callback - The callback function
 */
export function on(event, callback) {
	if (!eventListeners[event]) {
		eventListeners[event] = [];
	}
	
	eventListeners[event].push(callback);
	
	if (socket) {
		socket.on(event, callback);
	}
}

/**
 * Remove an event listener
 * @param {string} event - The event name
 * @param {Function} callback - The callback function
 */
export function off(event, callback) {
	if (eventListeners[event]) {
		eventListeners[event] = eventListeners[event].filter(cb => cb !== callback);
	}
	
	if (socket) {
		socket.off(event, callback);
	}
}

/**
 * Emit an event
 * @param {string} event - The event name
 * @param {*} data - The event data
 * @returns {Promise<*>} The server response
 */
export function emit(event, data) {
	return new Promise((resolve, reject) => {
		if (!socket || !socket.connected) {
			reject(new Error('Socket not connected'));
			return;
		}
		
		socket.emit(event, data, (response) => {
			if (response && response.error) {
				reject(response.error);
			} else {
				resolve(response);
			}
		});
	});
}

/**
 * Make an API request
 * @param {string} url - The API URL
 * @param {Object} options - The fetch options
 * @returns {Promise<*>} The API response
 */
export async function apiRequest(url, options = {}) {
	try {
		// Add default headers
		const headers = {
			'Content-Type': 'application/json',
			...options.headers
		};
		
		// Add auth token if available
		const token = localStorage.getItem('auth_token');
		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}
		
		// Make the request
		const response = await fetch(url, {
			...options,
			headers
		});
		
		// Parse the response
		const data = await response.json();
		
		// Check for errors
		if (!response.ok) {
			throw new Error(data.message || 'API request failed');
		}
		
		return data;
	} catch (error) {
		console.error('API request error:', error);
		throw error;
	}
}

/**
 * Login a user
 * @param {string} username - The username
 * @param {string} password - The password
 * @returns {Promise<Object>} The user data
 */
export async function login(username, password) {
	const data = await apiRequest(`${API.USERS}/login`, {
		method: 'POST',
		body: JSON.stringify({ username, password })
	});
	
	// Store the auth token
	if (data.token) {
		localStorage.setItem('auth_token', data.token);
	}
	
	return data;
}

/**
 * Register a new user
 * @param {string} username - The username
 * @param {string} password - The password
 * @param {string} email - The email
 * @returns {Promise<Object>} The user data
 */
export async function register(username, password, email) {
	const data = await apiRequest(`${API.USERS}/register`, {
		method: 'POST',
		body: JSON.stringify({ username, password, email })
	});
	
	// Store the auth token
	if (data.token) {
		localStorage.setItem('auth_token', data.token);
	}
	
	return data;
}

/**
 * Logout the current user
 */
export function logout() {
	localStorage.removeItem('auth_token');
	
	// Disconnect the socket
	if (socket) {
		socket.disconnect();
	}
}

/**
 * Get the current user
 * @returns {Promise<Object>} The user data
 */
export async function getCurrentUser() {
	return apiRequest(`${API.USERS}/me`);
}

/**
 * Get user stats
 * @param {string} userId - The user ID (optional, defaults to current user)
 * @returns {Promise<Object>} The user stats
 */
export async function getUserStats(userId = 'me') {
	return apiRequest(`${API.STATS}/${userId}`);
}

/**
 * Get game history
 * @param {number} limit - The maximum number of games to return
 * @param {number} offset - The offset for pagination
 * @returns {Promise<Array>} The game history
 */
export async function getGameHistory(limit = 10, offset = 0) {
	return apiRequest(`${API.GAMES}/history?limit=${limit}&offset=${offset}`);
}

/**
 * Get game details
 * @param {string} gameId - The game ID
 * @returns {Promise<Object>} The game details
 */
export async function getGameDetails(gameId) {
	return apiRequest(`${API.GAMES}/${gameId}`);
}

/**
 * Join a game
 * @param {string} gameId - The game ID
 * @returns {Promise<Object>} The game data
 */
export async function joinGame(gameId) {
	return emit('join_game', { gameId });
}

/**
 * Create a new game
 * @param {Object} options - Game options
 * @returns {Promise<Object>} The game data
 */
export async function createGame(options = {}) {
	return emit('create_game', options);
}

/**
 * Leave a game
 * @param {string} gameId - The game ID
 * @returns {Promise<Object>} The result
 */
export async function leaveGame(gameId) {
	return emit('leave_game', { gameId });
}

/**
 * Send a game input
 * @param {string} input - The input type
 * @param {Object} data - The input data
 * @returns {Promise<Object>} The result
 */
export async function sendGameInput(input, data = {}) {
	return emit('game_input', { input, ...data });
}

/**
 * Get leaderboard data
 * @param {string} type - The leaderboard type ('score', 'wins', etc.)
 * @param {number} limit - The maximum number of entries
 * @returns {Promise<Array>} The leaderboard data
 */
export async function getLeaderboard(type = 'score', limit = 10) {
	return apiRequest(`${API.STATS}/leaderboard/${type}?limit=${limit}`);
}

/**
 * Create a payment intent
 * @param {number} amount - The amount in cents
 * @param {string} currency - The currency code
 * @returns {Promise<Object>} The payment intent
 */
export async function createPaymentIntent(amount, currency = 'usd') {
	return apiRequest(`${API.TRANSACTIONS}/payment-intent`, {
		method: 'POST',
		body: JSON.stringify({ amount, currency })
	});
}

/**
 * Get transaction history
 * @param {number} limit - The maximum number of transactions
 * @param {number} offset - The offset for pagination
 * @returns {Promise<Array>} The transaction history
 */
export async function getTransactionHistory(limit = 10, offset = 0) {
	return apiRequest(`${API.TRANSACTIONS}/history?limit=${limit}&offset=${offset}`);
}

export default {
	initSocket,
	getSocket,
	isConnected,
	on,
	off,
	emit,
	apiRequest,
	login,
	register,
	logout,
	getCurrentUser,
	getUserStats,
	getGameHistory,
	getGameDetails,
	joinGame,
	createGame,
	leaveGame,
	sendGameInput,
	getLeaderboard,
	createPaymentIntent,
	getTransactionHistory,
	API
}; 