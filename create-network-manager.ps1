/**
 * Network Manager Module - Adapter to Class-based Implementation
 * This file creates a singleton instance of the NetworkManager class
 * and exports its methods to maintain compatibility with existing code.
 */
import NetworkManagerClass from './NetworkManagerClass.js';

// Create a singleton instance of the NetworkManager class
const networkManagerInstance = new NetworkManagerClass();

// Export the instance methods to maintain the same module interface
export function initialize(playerName = "Guest") {
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
    return networkManagerInstance.state.connectionStatus;
}

export function isConnected() {
    return networkManagerInstance.isConnected();
}

export function getPlayerId() {
    return networkManagerInstance.getPlayerId();
}

export function getGameId() {
    return networkManagerInstance.getGameId();
}

export function requestPlayerList() {
    return networkManagerInstance.sendMessage("getPlayerList", { gameId: networkManagerInstance.getGameId() });
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

// Make the instance available globally
if (typeof window !== "undefined") {
    window.NetworkManager = {
        ...networkManagerInstance,
        // Add the module methods directly to maintain backward compatibility
        initialize,
        ensureConnected,
        joinGame,
        leaveGame,
        onMessage,
        addEventListener,
        removeEventListener,
        on,
        sendMessage,
        submitTetrominoPlacement,
        submitChessMove,
        getStatus,
        isConnected,
        getPlayerId,
        getGameId,
        requestPlayerList,
        getGameState,
        getCurrentGameState,
        reconnect,
        getSocket,
        startGameStatePolling,
        stopGameStatePolling
    };
}

// Export the instance as default for modern imports
export default networkManagerInstance; 