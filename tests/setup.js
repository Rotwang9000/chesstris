/**
 * Jest test setup file
 */

// Add TextEncoder and TextDecoder since they're not available in JSDOM
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

// Configure JSDOM
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

// Create a basic DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
	url: 'http://localhost/'
});

// Mock chai since it's giving us issues with ESM
jest.mock('chai', () => ({
	expect: jest.fn().mockImplementation(value => ({
		to: {
			equal: jest.fn(),
			deep: {
				equal: jest.fn()
			}
		},
		toBe: jest.fn(),
		toEqual: jest.fn(),
		toBeNull: jest.fn(),
		toContain: jest.fn(),
		toBeDefined: jest.fn(),
		toBeUndefined: jest.fn(),
		toBeTrue: jest.fn(),
		toBeFalse: jest.fn()
	}))
}));

// Mock sinon
jest.mock('sinon', () => ({
	stub: jest.fn(() => ({
		returns: jest.fn(),
		callsFake: jest.fn(),
		resolves: jest.fn(),
		rejects: jest.fn(),
		reset: jest.fn(),
		restore: jest.fn(),
		returnsThis: jest.fn().mockReturnThis()
	})),
	spy: jest.fn(),
	mock: jest.fn(),
	fake: jest.fn(),
	restore: jest.fn(),
	reset: jest.fn(),
	resetHistory: jest.fn(),
	createSandbox: jest.fn(() => ({
		stub: jest.fn(),
		spy: jest.fn(),
		mock: jest.fn(),
		restore: jest.fn()
	}))
}));

// Set up global variables to simulate browser environment
global.window = dom.window;
global.document = dom.window.document;
global.navigator = { userAgent: 'node.js' };
global.HTMLElement = dom.window.HTMLElement;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
global.Image = dom.window.Image;
global.Audio = jest.fn().mockImplementation(() => ({
	play: jest.fn().mockReturnValue(Promise.resolve()),
	pause: jest.fn(),
	load: jest.fn(),
	addEventListener: jest.fn((event, callback) => {
		if (event === 'canplaythrough') {
			setTimeout(callback, 0);
		}
	}),
	removeEventListener: jest.fn(),
	muted: false,
	volume: 1.0,
	currentTime: 0,
	loop: false
}));

// Create a proper localStorage mock with jest.fn()
const localStorageMock = (() => {
	let store = {};
	
	return {
		getItem: jest.fn().mockImplementation(key => {
			return store[key] || null;
		}),
		setItem: jest.fn().mockImplementation((key, value) => {
			store[key] = value.toString();
		}),
		clear: jest.fn().mockImplementation(() => {
			store = {};
		}),
		removeItem: jest.fn().mockImplementation(key => {
			delete store[key];
		}),
		key: jest.fn().mockImplementation(index => {
			return Object.keys(store)[index] || null;
		}),
		get length() {
			return Object.keys(store).length;
		},
		// Helper to reset mocks and store
		__resetMocks: () => {
			store = {};
			localStorageMock.getItem.mockClear();
			localStorageMock.setItem.mockClear();
			localStorageMock.removeItem.mockClear();
			localStorageMock.clear.mockClear();
		}
	};
})();

// Use defineProperty to set the localStorage property on window
Object.defineProperty(window, 'localStorage', { 
	value: localStorageMock,
	writable: true,
	configurable: true
});

// Same for sessionStorage
const sessionStorageMock = (() => {
	let store = {};
	
	return {
		getItem: jest.fn().mockImplementation(key => {
			return store[key] || null;
		}),
		setItem: jest.fn().mockImplementation((key, value) => {
			store[key] = value.toString();
		}),
		clear: jest.fn().mockImplementation(() => {
			store = {};
		}),
		removeItem: jest.fn().mockImplementation(key => {
			delete store[key];
		}),
		key: jest.fn().mockImplementation(index => {
			return Object.keys(store)[index] || null;
		}),
		get length() {
			return Object.keys(store).length;
		},
		// Helper to reset mocks and store
		__resetMocks: () => {
			store = {};
			sessionStorageMock.getItem.mockClear();
			sessionStorageMock.setItem.mockClear();
			sessionStorageMock.removeItem.mockClear();
			sessionStorageMock.clear.mockClear();
		}
	};
})();

Object.defineProperty(window, 'sessionStorage', { 
	value: sessionStorageMock,
	writable: true,
	configurable: true
});

// Mock window.matchMedia
window.matchMedia = jest.fn().mockImplementation(query => ({
	matches: false,
	media: query,
	onchange: null,
	addListener: jest.fn(),
	removeListener: jest.fn(),
	addEventListener: jest.fn(),
	removeEventListener: jest.fn(),
	dispatchEvent: jest.fn()
}));

// Mock requestAnimationFrame
global.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0);
global.cancelAnimationFrame = id => clearTimeout(id);

// Create a mock THREE object
global.THREE = {
	Vector3: jest.fn(function(x, y, z) {
		this.x = x || 0;
		this.y = y || 0;
		this.z = z || 0;
		this.clone = jest.fn(() => new global.THREE.Vector3(this.x, this.y, this.z));
		this.copy = jest.fn(v => {
			this.x = v.x;
			this.y = v.y;
			this.z = v.z;
			return this;
		});
	}),
	Color: jest.fn(function() {
		this.r = 1;
		this.g = 1;
		this.b = 1;
	}),
	Mesh: jest.fn(function() {
		this.position = new global.THREE.Vector3();
		this.rotation = new global.THREE.Vector3();
		this.scale = new global.THREE.Vector3(1, 1, 1);
	}),
	Group: jest.fn().mockImplementation(() => ({
		add: jest.fn(),
		remove: jest.fn(),
		children: []
	}))
};

// Mock canvas 2D context
HTMLCanvasElement.prototype.getContext = function() {
	return {
		fillRect: jest.fn(),
		clearRect: jest.fn(),
		getImageData: jest.fn(() => ({ data: new Array(4) })),
		putImageData: jest.fn(),
		drawImage: jest.fn(),
		save: jest.fn(),
		restore: jest.fn(),
		beginPath: jest.fn(),
		moveTo: jest.fn(),
		lineTo: jest.fn(),
		stroke: jest.fn(),
		fill: jest.fn()
	};
};

// Reset mocks before each test
beforeEach(() => {
	// Reset localStorage mock
	if (localStorageMock && localStorageMock.__resetMocks) {
		localStorageMock.__resetMocks();
	}
	
	// Reset sessionStorage mock
	if (sessionStorageMock && sessionStorageMock.__resetMocks) {
		sessionStorageMock.__resetMocks();
	}
	
	// Reset all mocks
	jest.clearAllMocks();
});

