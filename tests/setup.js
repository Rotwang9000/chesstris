/**
 * Jest Setup File
 * 
 * This file runs before each test file and sets up global mocks and configuration.
 * It's a good place to add mocks for browser APIs and external dependencies.
 */

// Mock browser globals that might not be available in the test environment
global.requestAnimationFrame = function(callback) {
	return setTimeout(callback, 0);
};

global.cancelAnimationFrame = function(id) {
	clearTimeout(id);
};

// Mock canvas methods if needed
if (!global.HTMLCanvasElement.prototype.getContext) {
	global.HTMLCanvasElement.prototype.getContext = function() {
		return {
			fillRect: function() {},
			clearRect: function() {},
			getImageData: function(x, y, w, h) {
				return {
					data: new Array(w * h * 4)
				};
			},
			putImageData: function() {},
			createImageData: function() { return []; },
			setTransform: function() {},
			drawImage: function() {},
			save: function() {},
			restore: function() {},
			beginPath: function() {},
			moveTo: function() {},
			lineTo: function() {},
			closePath: function() {},
			stroke: function() {},
			translate: function() {},
			scale: function() {},
			rotate: function() {},
			arc: function() {},
			fill: function() {},
			measureText: function() {
				return { width: 0 };
			},
			transform: function() {},
			rect: function() {},
			clip: function() {}
		};
	};
}

// Mock WebSocket if needed
global.WebSocket = class MockWebSocket {
	constructor(url) {
		this.url = url;
		this.readyState = 1; // OPEN
		this.onopen = null;
		this.onclose = null;
		this.onmessage = null;
		this.onerror = null;
		
		// Automatically call onopen in the next tick
		setTimeout(() => {
			if (this.onopen) {
				this.onopen({ target: this });
			}
		}, 0);
	}
	
	send(data) {
		// You can implement mock behavior here if needed
		return true;
	}
	
	close() {
		this.readyState = 3; // CLOSED
		if (this.onclose) {
			this.onclose({ target: this });
		}
	}
	
	// Helper to simulate receiving a message
	mockReceiveMessage(data) {
		if (this.onmessage) {
			this.onmessage({ data: data, target: this });
		}
	}
	
	// Helper to simulate an error
	mockError() {
		if (this.onerror) {
			this.onerror({ target: this });
		}
	}
};

// Mock localStorage if needed
const localStorageMock = (function() {
	let store = {};
	return {
		getItem: function(key) {
			return store[key] || null;
		},
		setItem: function(key, value) {
			store[key] = value.toString();
		},
		removeItem: function(key) {
			delete store[key];
		},
		clear: function() {
			store = {};
		},
		key: function(index) {
			return Object.keys(store)[index] || null;
		},
		get length() {
			return Object.keys(store).length;
		}
	};
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock Audio API if used in the application
global.Audio = class MockAudio {
	constructor(src) {
		this.src = src;
		this.duration = 0;
		this.currentTime = 0;
		this.paused = true;
		this.volume = 1;
		this.oncanplaythrough = null;
		this.onended = null;
		
		// Simulate the audio being ready
		setTimeout(() => {
			this.duration = 100; // Mock duration in seconds
			if (this.oncanplaythrough) {
				this.oncanplaythrough();
			}
		}, 0);
	}
	
	play() {
		this.paused = false;
		// Simulate audio ending after its duration
		setTimeout(() => {
			this.currentTime = this.duration;
			this.paused = true;
			if (this.onended) {
				this.onended();
			}
		}, 10);
		return Promise.resolve();
	}
	
	pause() {
		this.paused = true;
	}
};

// Console error/warn mocks to detect unintentional console calls
// Only enable these if you want to make console errors fail tests
// const originalConsoleError = console.error;
// const originalConsoleWarn = console.warn;

// console.error = function(message) {
//   originalConsoleError.apply(console, arguments);
//   throw new Error(`Console error detected: ${message}`);
// };

// console.warn = function(message) {
//   originalConsoleWarn.apply(console, arguments);
//   throw new Error(`Console warning detected: ${message}`);
// };

// Set up any global variables that should be available in all tests
global.TESTING = true;

// Create a common event for testing
global.mockEvent = (eventType, properties = {}) => {
	const event = new Event(eventType, { bubbles: true, cancelable: true });
	
	// Add properties to the event
	Object.keys(properties).forEach(key => {
		event[key] = properties[key];
	});
	
	// Add stopPropagation and preventDefault methods
	event.stopPropagation = jest.fn();
	event.preventDefault = jest.fn();
	
	return event;
};

// Custom matchers added to expect through setupFilesAfterEnv in jest.config.js
// rather than directly here
// DO NOT add expect extensions here as `expect` is not available in setup files 