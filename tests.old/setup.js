/**
 * Jest setup file for Shaktris tests
 */

// Ensure jest is defined globally
if (typeof global.jest === 'undefined') {
	global.jest = require('@jest/globals').jest;
}

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

// Import our Jest helpers
const jestHelpers = require('./jest-helpers');

// Add helpers to global scope for easier test writing
global.createTestProxy = jestHelpers.createTestProxy;
global.createMockRedisClient = jestHelpers.createMockRedisClient;
global.createMockExpress = jestHelpers.createMockExpress;

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

// Mock browser globals
const localStorageMock = (function() {
	let store = {};
	
	return {
		getItem(key) {
			return store[key] || null;
		},
		setItem(key, value) {
			store[key] = String(value);
		},
		removeItem(key) {
			delete store[key];
		},
		clear() {
			store = {};
		},
		key(idx) {
			return Object.keys(store)[idx] || null;
		},
		get length() {
			return Object.keys(store).length;
		}
	};
})();

const sessionStorageMock = (function() {
	let store = {};
	
	return {
		getItem(key) {
			return store[key] || null;
		},
		setItem(key, value) {
			store[key] = String(value);
		},
		removeItem(key) {
			delete store[key];
		},
		clear() {
			store = {};
		},
		key(idx) {
			return Object.keys(store)[idx] || null;
		},
		get length() {
			return Object.keys(store).length;
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

// Canvas mock
class CanvasRenderingContext2D {
	constructor() {
		this.canvas = document.createElement('canvas');
		this.fillStyle = '#000000';
		this.strokeStyle = '#000000';
		this.lineWidth = 1;
		this.font = '10px sans-serif';
		this.textAlign = 'start';
		this.textBaseline = 'alphabetic';
		this.lineCap = 'butt';
		this.lineJoin = 'miter';
		this.miterLimit = 10;
		this.shadowBlur = 0;
		this.shadowColor = 'rgba(0, 0, 0, 0)';
		this.shadowOffsetX = 0;
		this.shadowOffsetY = 0;
		this.globalAlpha = 1.0;
		this.globalCompositeOperation = 'source-over';
		this.imageSmoothingEnabled = true;
		this._currentPath = [];
	}
	
	// Drawing methods
	beginPath() {}
	closePath() {}
	moveTo() {}
	lineTo() {}
	bezierCurveTo() {}
	quadraticCurveTo() {}
	arc() {}
	arcTo() {}
	ellipse() {}
	rect() {}
	fill() {}
	stroke() {}
	clip() {}
	isPointInPath() { return false; }
	isPointInStroke() { return false; }
	
	// Text methods
	fillText() {}
	strokeText() {}
	measureText() { return { width: 0 }; }
	
	// Image methods
	drawImage() {}
	createImageData() { return { width: 0, height: 0, data: new Uint8ClampedArray() }; }
	getImageData() { return { width: 0, height: 0, data: new Uint8ClampedArray() }; }
	putImageData() {}
	
	// State methods
	save() {}
	restore() {}
	
	// Transformation methods
	scale() {}
	rotate() {}
	translate() {}
	transform() {}
	setTransform() {}
	resetTransform() {}
	
	// Path methods
	clearRect() {}
	fillRect() {}
	strokeRect() {}
	
	// Gradient methods
	createLinearGradient() { return { addColorStop: jest.fn() }; }
	createRadialGradient() { return { addColorStop: jest.fn() }; }
	createPattern() { return {}; }
}

// WebGL mocks
class WebGLRenderingContext {
	constructor() {
		this.canvas = document.createElement('canvas');
	}
	
	// All methods are empty placeholders
	getExtension() { return {}; }
	activeTexture() {}
	attachShader() {}
	bindBuffer() {}
	bindTexture() {}
	blendFunc() {}
	clear() {}
	clearColor() {}
	clearDepth() {}
	compileShader() {}
	createBuffer() { return {}; }
	createProgram() { return {}; }
	createShader() { return {}; }
	createTexture() { return {}; }
	cullFace() {}
	deleteBuffer() {}
	deleteProgram() {}
	deleteShader() {}
	deleteTexture() {}
	depthFunc() {}
	depthMask() {}
	disable() {}
	disableVertexAttribArray() {}
	drawArrays() {}
	drawElements() {}
	enable() {}
	enableVertexAttribArray() {}
	finish() {}
	flush() {}
	framebufferRenderbuffer() {}
	framebufferTexture2D() {}
	frontFace() {}
	generateMipmap() {}
	getActiveAttrib() { return { size: 0, type: 0, name: '' }; }
	getActiveUniform() { return { size: 0, type: 0, name: '' }; }
	getAttribLocation() { return 0; }
	getError() { return 0; }
	getProgramParameter() { return true; }
	getShaderParameter() { return true; }
	getUniformLocation() { return {}; }
	linkProgram() {}
	pixelStorei() {}
	renderbufferStorage() {}
	scissor() {}
	shaderSource() {}
	texImage2D() {}
	texParameteri() {}
	uniform1f() {}
	uniform1i() {}
	uniform2f() {}
	uniform3f() {}
	uniform4f() {}
	uniformMatrix2fv() {}
	uniformMatrix3fv() {}
	uniformMatrix4fv() {}
	useProgram() {}
	vertexAttribPointer() {}
	viewport() {}
}

// Mock for the Socket.IO objects
const socketIOMock = {
	// Socket.IO Client mock
	io: jest.fn(() => ({
		on: jest.fn(),
		emit: jest.fn(),
		connect: jest.fn(),
		disconnect: jest.fn(),
		connected: true,
		id: 'mock-socket-id',
		once: jest.fn(),
		removeListener: jest.fn()
	})),
	// Socket.IO Server mock for server-side tests
	Server: jest.fn(() => ({
		on: jest.fn(),
		emit: jest.fn(),
		to: jest.fn().mockReturnThis(),
		in: jest.fn().mockReturnThis(),
		of: jest.fn().mockReturnThis(),
		close: jest.fn()
	}))
};

// Mock for express
const expressMock = jest.fn(() => ({
	use: jest.fn(),
	get: jest.fn(),
	post: jest.fn(),
	put: jest.fn(),
	delete: jest.fn(),
	listen: jest.fn(),
	static: jest.fn(),
	json: jest.fn()
}));
expressMock.Router = jest.fn(() => ({
	use: jest.fn(),
	get: jest.fn(),
	post: jest.fn(),
	put: jest.fn(),
	delete: jest.fn()
}));

// Add to global scope
global.localStorage = localStorageMock;
global.sessionStorage = sessionStorageMock;
global.HTMLCanvasElement.prototype.getContext = function(contextType) {
	if (contextType === '2d') {
		return new CanvasRenderingContext2D();
	} else if (contextType === 'webgl' || contextType === 'experimental-webgl') {
		return new WebGLRenderingContext();
	}
	return null;
};

// Mock for Web Audio API
global.AudioContext = jest.fn().mockImplementation(() => ({
	createGain: jest.fn().mockImplementation(() => ({
		connect: jest.fn(),
		gain: { value: 1.0 }
	})),
	createOscillator: jest.fn().mockImplementation(() => ({
		connect: jest.fn(),
		start: jest.fn(),
		stop: jest.fn(),
		frequency: { value: 440 }
	})),
	createBufferSource: jest.fn().mockImplementation(() => ({
		connect: jest.fn(),
		start: jest.fn(),
		stop: jest.fn(),
		buffer: null,
		onended: null
	})),
	createBuffer: jest.fn().mockImplementation(() => ({
		getChannelData: jest.fn().mockReturnValue(new Float32Array(1024))
	})),
	decodeAudioData: jest.fn().mockImplementation((arraybuffer, successCallback) => {
		if (successCallback) {
			successCallback({
				getChannelData: jest.fn().mockReturnValue(new Float32Array(1024))
			});
		}
		return Promise.resolve({
			getChannelData: jest.fn().mockReturnValue(new Float32Array(1024))
		});
	}),
	destination: {},
	currentTime: 0
}));

global.webkitAudioContext = global.AudioContext;

// Mock for Web Audio Element
class MockAudio {
	constructor(src) {
		this.src = src;
		this.paused = true;
		this.volume = 1.0;
		this.currentTime = 0;
		this.onloadeddata = null;
		this.onended = null;
		this.onerror = null;
		this.oncanplaythrough = null;
	}
	
	addEventListener(event, callback) {}
	removeEventListener(event, callback) {}
	play() { this.paused = false; return Promise.resolve(); }
	pause() { this.paused = true; }
	load() {}
	
	get duration() { return 100; }
}

global.Audio = MockAudio;

// Create test proxy utility for better test isolation
global.createTestProxy = (originalModule) => {
	const proxy = { ...originalModule };
	proxy._testOverrides = {};
	
	// Automatically wrap each exported function with a mock that allows overrides
	Object.keys(originalModule).forEach(key => {
		if (typeof originalModule[key] === 'function') {
			proxy[key] = jest.fn((...args) => {
				// Check if there's a test override for this function
				if (proxy._testOverrides[key]) {
					return proxy._testOverrides[key](...args);
				}
				// Otherwise call the original
				return originalModule[key](...args);
			});
		}
	});
	
	return proxy;
};

// Mocks for THREE.js to avoid loading the actual implementation
global.THREE = {
	Scene: jest.fn().mockImplementation(() => ({
		add: jest.fn(),
		remove: jest.fn(),
		children: [],
		background: null
	})),
	PerspectiveCamera: jest.fn().mockImplementation(() => ({
		position: { x: 0, y: 0, z: 0 },
		lookAt: jest.fn(),
		updateProjectionMatrix: jest.fn(),
		aspect: 1.0
	})),
	WebGLRenderer: jest.fn().mockImplementation(() => ({
		setSize: jest.fn(),
		render: jest.fn(),
		domElement: document.createElement('canvas'),
		shadowMap: {
			enabled: false,
			type: 'PCFShadowMap'
		}
	})),
	BoxGeometry: jest.fn(),
	MeshStandardMaterial: jest.fn(),
	Mesh: jest.fn().mockImplementation(() => ({
		position: { x: 0, y: 0, z: 0 },
		rotation: { x: 0, y: 0, z: 0 },
		scale: { x: 1, y: 1, z: 1 },
		material: null,
		geometry: null
	})),
	Group: jest.fn().mockImplementation(() => ({
		add: jest.fn(),
		remove: jest.fn(),
		children: [],
		position: { x: 0, y: 0, z: 0 }
	})),
	Vector3: jest.fn().mockImplementation((x, y, z) => ({
		x: x || 0,
		y: y || 0,
		z: z || 0,
		set: jest.fn(),
		clone: jest.fn().mockReturnThis(),
		add: jest.fn().mockReturnThis(),
		sub: jest.fn().mockReturnThis()
	})),
	Color: jest.fn().mockImplementation(() => ({
		r: 1, g: 1, b: 1
	})),
	// Add more THREE.js mocks as needed
	DirectionalLight: jest.fn(),
	AmbientLight: jest.fn(),
	PointLight: jest.fn(),
	GridHelper: jest.fn(),
	OrbitControls: jest.fn().mockImplementation(() => ({
		update: jest.fn(),
		target: { x: 0, y: 0, z: 0 }
	}))
};

// Mock Socket.IO using jest.mock with a factory function
jest.mock('socket.io', () => {
	const mockSocketIO = {
		Server: jest.fn(() => ({
			on: jest.fn(),
			emit: jest.fn(),
			to: jest.fn().mockReturnThis(),
			in: jest.fn().mockReturnThis(),
			of: jest.fn().mockReturnThis(),
			close: jest.fn()
		}))
	};
	return mockSocketIO;
});

// Mock Socket.IO client
global.io = jest.fn(() => ({
	on: jest.fn(),
	emit: jest.fn(),
	connect: jest.fn(),
	disconnect: jest.fn(),
	connected: true,
	id: 'mock-socket-id',
	once: jest.fn(),
	removeListener: jest.fn()
}));

// Mock Express
jest.mock('express', () => {
	const mockExpress = jest.fn(() => ({
		use: jest.fn(),
		get: jest.fn(),
		post: jest.fn(),
		put: jest.fn(),
		delete: jest.fn(),
		listen: jest.fn(),
		static: jest.fn(),
		json: jest.fn()
	}));
	mockExpress.Router = jest.fn(() => ({
		use: jest.fn(),
		get: jest.fn(),
		post: jest.fn(),
		put: jest.fn(),
		delete: jest.fn()
	}));
	return mockExpress;
});

// Mock http module for server tests
jest.mock('http', () => ({
	createServer: jest.fn(() => ({
		listen: jest.fn((port, callback) => {
			if (callback) callback();
			return {
				address: jest.fn(() => ({ port }))
			};
		})
	}))
}));

// Mock UUID for predictable IDs
jest.mock('uuid', () => ({
	v4: jest.fn(() => 'mock-uuid-1234')
}));

// Make sure to configure a path for these mocks in jest.config.js
console.log('Jest setup complete');

