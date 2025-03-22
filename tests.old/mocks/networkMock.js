/**
 * Standard mock for Network module
 * This can be imported in tests that need to mock network functionality
 * Use: import NetworkMock from '../mocks/NetworkMock';
 */

const NetworkMock = {
	// Connection state
	connected: false,
	connectionId: null,
	socket: null,
	serverUrl: 'http://localhost:3020',
	
	// Event handlers
	eventHandlers: {},
	
	// Methods for connection management
	connect: jest.fn(() => {
		NetworkMock.connected = true;
		NetworkMock.connectionId = `connection-${Date.now()}`;
		NetworkMock._triggerEvent('connect', { id: NetworkMock.connectionId });
		return NetworkMock.connectionId;
	}),
	
	disconnect: jest.fn(() => {
		NetworkMock.connected = false;
		NetworkMock._triggerEvent('disconnect', { reason: 'Client disconnected' });
		return true;
	}),
	
	isConnected: jest.fn(() => NetworkMock.connected),
	
	// Methods for event handling
	on: jest.fn((event, handler) => {
		if (!NetworkMock.eventHandlers[event]) {
			NetworkMock.eventHandlers[event] = [];
		}
		NetworkMock.eventHandlers[event].push(handler);
	}),
	
	off: jest.fn((event, handler) => {
		if (!NetworkMock.eventHandlers[event]) return;
		
		if (handler) {
			NetworkMock.eventHandlers[event] = NetworkMock.eventHandlers[event].filter(h => h !== handler);
		} else {
			delete NetworkMock.eventHandlers[event];
		}
	}),
	
	once: jest.fn((event, handler) => {
		const onceHandler = (...args) => {
			NetworkMock.off(event, onceHandler);
			handler(...args);
		};
		NetworkMock.on(event, onceHandler);
	}),
	
	// Methods for sending data
	emit: jest.fn((event, data, callback) => {
		// Simulate server receiving the event
		setTimeout(() => {
			if (callback) {
				callback({ success: true, event, data });
			}
		}, 10);
		return true;
	}),
	
	send: jest.fn((event, data) => {
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve({ success: true, event, data });
			}, 10);
		});
	}),
	
	// RESTful API methods
	get: jest.fn((endpoint, params = {}) => {
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve({ success: true, endpoint, params, method: 'GET' });
			}, 10);
		});
	}),
	
	post: jest.fn((endpoint, data = {}) => {
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve({ success: true, endpoint, data, method: 'POST' });
			}, 10);
		});
	}),
	
	put: jest.fn((endpoint, data = {}) => {
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve({ success: true, endpoint, data, method: 'PUT' });
			}, 10);
		});
	}),
	
	delete: jest.fn((endpoint, params = {}) => {
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve({ success: true, endpoint, params, method: 'DELETE' });
			}, 10);
		});
	}),
	
	// Test helper methods
	_triggerEvent: (event, data) => {
		if (!NetworkMock.eventHandlers[event]) return;
		
		NetworkMock.eventHandlers[event].forEach(handler => {
			handler(data);
		});
	},
	
	_reset: () => {
		NetworkMock.connected = false;
		NetworkMock.connectionId = null;
		NetworkMock.eventHandlers = {};
		
		// Reset all the mock functions
		NetworkMock.connect.mockClear();
		NetworkMock.disconnect.mockClear();
		NetworkMock.isConnected.mockClear();
		NetworkMock.on.mockClear();
		NetworkMock.off.mockClear();
		NetworkMock.once.mockClear();
		NetworkMock.emit.mockClear();
		NetworkMock.send.mockClear();
		NetworkMock.get.mockClear();
		NetworkMock.post.mockClear();
		NetworkMock.put.mockClear();
		NetworkMock.delete.mockClear();
	}
};

export default NetworkMock; 