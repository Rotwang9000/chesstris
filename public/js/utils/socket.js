/**
 * Socket.io Utility Module
 * 
 * Provides access to the Socket.io client loaded from CDN.
 * This module bridges the gap between the global io object and ES modules.
 */

// Determine environment
const isNodeEnvironment = typeof window === 'undefined';
const isTestEnvironment = isNodeEnvironment && process.env.NODE_ENV === 'test';

let socketIo;

// Create a simple mock socket for tests
function createMockSocket() {
	console.log('Using mock Socket.io in test environment');
	
	// Return a factory function that creates mock sockets
	return () => {
		const eventHandlers = {};
		const emitLog = [];
		
		return {
			id: 'mock-socket-' + Math.random().toString(36).substring(2, 10),
			connected: true,
			// Register event handler
			on: (event, callback) => {
				if (!eventHandlers[event]) {
					eventHandlers[event] = [];
				}
				eventHandlers[event].push(callback);
				return this;
			},
			// Emit event to server
			emit: (event, ...args) => {
				emitLog.push({ event, args });
				return this;
			},
			// Remove event handler
			off: (event, callback) => {
				if (eventHandlers[event]) {
					if (callback) {
						eventHandlers[event] = eventHandlers[event].filter(
							handler => handler !== callback
						);
					} else {
						delete eventHandlers[event];
					}
				}
				return this;
			},
			// Disconnect socket
			disconnect: () => {
				this.connected = false;
				if (eventHandlers['disconnect']) {
					eventHandlers['disconnect'].forEach(callback => callback());
				}
			},
			// For testing - trigger a received event
			_receiveEvent: (event, ...args) => {
				if (eventHandlers[event]) {
					eventHandlers[event].forEach(callback => {
						callback(...args);
					});
				}
			},
			// For testing - get emit log
			_getEmitLog: () => [...emitLog],
			// For testing - clear emit log
			_clearEmitLog: () => { emitLog.length = 0; }
		};
	};
}

// In browser or non-test environment
if (!isTestEnvironment) {
	// Make sure io is available globally
	if (typeof io === 'undefined') {
		console.error('Socket.io client not loaded. Make sure the CDN script is included in the HTML.');
		// Provide a fallback that throws errors when used
		socketIo = () => {
			throw new Error('Socket.io client not available');
		};
	} else {
		socketIo = io;
	}
} else {
	// In Node.js test environment, use our simple mock
	socketIo = createMockSocket();
}

// Export the io object as default
export default socketIo; 