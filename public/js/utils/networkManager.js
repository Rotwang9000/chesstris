/**
 * Network Manager Module - Singleton Implementation
 * This file creates a proper singleton instance of the NetworkManager class
 * and exports its methods to maintain compatibility with existing code.
 */
import NetworkManagerClass from './NetworkManagerClass.js';

// Implement proper singleton pattern
let instance = null;

/**
 * Get singleton instance of NetworkManager
 * @returns {NetworkManagerClass} The singleton instance
 */
function getInstance() {
	if (instance === null) {
		console.log('Creating new NetworkManager instance');
		instance = new NetworkManagerClass();
	}
	return instance;
}

// Get the singleton instance
const networkManagerInstance = getInstance();

// Export the instance methods to maintain the same module interface
export function initialize(playerName = 'Guest') {
	return networkManagerInstance.initialize(playerName);
}

export function ensureConnected(playerNameArg = null, maxAttempts = 3) {
	return networkManagerInstance.ensureConnected(playerNameArg, maxAttempts);
}

export function joinGame(gameIdArg) {
	return networkManagerInstance.joinGame(gameIdArg);
}

export function leaveGame() {
	return networkManagerInstance.leaveGame();
}

export function onMessage(messageType, handler) {
	networkManagerInstance.onMessage(messageType, handler);
}

export function addEventListener(eventType, callback) {
	networkManagerInstance.addEventListener(eventType, callback);
}

export function removeEventListener(eventType, callback) {
	networkManagerInstance.removeEventListener(eventType, callback);
}

export function on(eventType, callback) {
	networkManagerInstance.on(eventType, callback);
}

export function sendMessage(eventType, data) {
	return networkManagerInstance.sendMessage(eventType, data);
}

export function submitTetrominoPlacement(tetromino) {
	return networkManagerInstance.submitTetrominoPlacement(tetromino);
}

export function submitChessMove(move) {
	return networkManagerInstance.submitChessMove(move);
}

export function getStatus() {
	if (networkManagerInstance && typeof networkManagerInstance.getStatus === 'function') {
		return networkManagerInstance.getStatus();
	}
	return 'unknown';
}

export function isConnected() {
	if (networkManagerInstance && typeof networkManagerInstance.isConnected === 'function') {
		// Force a status check and return the result
		return networkManagerInstance.isConnected();
	}
	return false;
}

export function getPlayerId() {
	return networkManagerInstance.getPlayerId();
}

export function getGameId() {
	return networkManagerInstance.getGameId();
}

export function requestPlayerList() {
	return networkManagerInstance.getGameState({
		includePlayers: true,
		includeBoard: false,
		includeChat: false,
		includePhase: false,
		includeChessPieces: false,
		includeTetrominos: false
	});
}

export function getGameState(options = {}) {
	return networkManagerInstance.getGameState(options);
}

export function getCurrentGameState() {
	return networkManagerInstance.getCurrentGameState();
}

export function reconnect(maxAttempts = 5) {
	return networkManagerInstance.ensureConnected(null, maxAttempts);
}

export function getSocket() {
	return networkManagerInstance.getSocket();
}

export function startGameStatePolling() {
	if (networkManagerInstance.startGameStatePolling) {
		return networkManagerInstance.startGameStatePolling();
	}
	return false;
}

export function stopGameStatePolling() {
	if (networkManagerInstance.stopGameStatePolling) {
		return networkManagerInstance.stopGameStatePolling();
	}
	return false;
}

// Export the instance as default for modern imports
export default networkManagerInstance; 