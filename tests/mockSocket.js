/**
 * Mock Socket.io Implementation for Tests
 *
 * This file provides a mock implementation of the socket.io client for testing.
 */

// Create a mock socket.io implementation
class MockSocket {
	constructor() {
		this.eventHandlers = {};
		this.emitLog = [];
		this.connected = true;
		this.id = 'mock-socket-' + Math.random().toString(36).substring(2, 10);
	}

	// Register event handler
	on(event, callback) {
		if (!this.eventHandlers[event]) {
			this.eventHandlers[event] = [];
		}
		this.eventHandlers[event].push(callback);
		return this;
	}

	// Emit event to server
	emit(event, ...args) {
		this.emitLog.push({ event, args });
		return this;
	}

	// Trigger a received event (for testing)
	receiveEvent(event, ...args) {
		if (this.eventHandlers[event]) {
			this.eventHandlers[event].forEach(callback => {
				callback(...args);
			});
		}
	}

	// Remove event handler
	off(event, callback) {
		if (this.eventHandlers[event]) {
			if (callback) {
				this.eventHandlers[event] = this.eventHandlers[event].filter(
					handler => handler !== callback
				);
			} else {
				delete this.eventHandlers[event];
			}
		}
		return this;
	}

	// Disconnect socket
	disconnect() {
		this.connected = false;
		if (this.eventHandlers['disconnect']) {
			this.eventHandlers['disconnect'].forEach(callback => callback());
		}
	}

	// Reset mock state for test isolation
	reset() {
		this.eventHandlers = {};
		this.emitLog = [];
		this.connected = true;
	}
}

// Create the mock io function that returns a socket
const mockIo = (url, options) => {
	return new MockSocket();
};

// Expose mock socket instance for testing
const mockSocketInstance = new MockSocket();

// Add extra methods for testing
mockIo.connect = () => mockSocketInstance;
mockIo.reset = () => mockSocketInstance.reset();
mockIo.mockInstance = mockSocketInstance;

// Export the mock
export default mockIo; 