/**
 * Network Module Patch
 * 
 * This file patches the network module with additional functionality.
 */

import * as NetworkOriginal from './network.js';

// Create a new object that wraps the original Network module
const Network = {};

// Copy all properties from the original Network module
for (const key in NetworkOriginal) {
	if (Object.prototype.hasOwnProperty.call(NetworkOriginal, key)) {
		Network[key] = NetworkOriginal[key];
	}
}

// Add isConnected method
Network.isConnected = function() {
	// Try to access the socket from the Network module
	if (NetworkOriginal.getSocket && NetworkOriginal.getSocket()) {
		return NetworkOriginal.getSocket().connected;
	}
	
	// Try to access the socket from the global scope
	if (typeof window !== 'undefined' && window.io && window.io.socket) {
		return window.io.socket.connected;
	}
	
	// Fallback to checking if we have a mock socket
	if (typeof window !== 'undefined' && window.mockSocketConnected !== undefined) {
		return window.mockSocketConnected;
	}
	
	// Default to true in offline mode
	return true;
};

// Add throttling for board updates to prevent flooding
let lastBoardUpdate = 0;
const BOARD_UPDATE_THROTTLE = 2000; // Increase to 2 seconds to reduce updates

// Create a throttled emit function
Network.throttledEmit = function(event, data) {
	// Throttle requestBoardUpdate events
	if (event === 'requestBoardUpdate') {
		const now = Date.now();
		if (now - lastBoardUpdate < BOARD_UPDATE_THROTTLE) {
			return Promise.resolve({ throttled: true });
		}
		lastBoardUpdate = now;
	}
	
	// Call the original emit function
	return NetworkOriginal.emit(event, data);
};

// Expose the socket for debugging
if (NetworkOriginal.getSocket && typeof window !== 'undefined') {
	window.gameSocket = NetworkOriginal.getSocket();
}

// Export the new Network object with our additions
export default Network; 