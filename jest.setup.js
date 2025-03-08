// Mock Three.js and Socket.IO since they're browser-specific
global.THREE = {
	Scene: jest.fn(),
	PerspectiveCamera: jest.fn(),
	WebGLRenderer: jest.fn(() => ({
		setSize: jest.fn(),
		render: jest.fn(),
		domElement: document.createElement('canvas')
	})),
	Mesh: jest.fn(),
	Group: jest.fn(() => ({
		add: jest.fn(),
		remove: jest.fn(),
		children: []
	})),
	Color: jest.fn(),
	Vector2: jest.fn(),
	Vector3: jest.fn(),
	Raycaster: jest.fn(),
	MeshPhongMaterial: jest.fn(),
	ShaderMaterial: jest.fn(),
	TextGeometry: jest.fn(),
	FontLoader: jest.fn(() => ({
		load: jest.fn((url, callback) => callback({}))
	}))
};

// Mock Socket.IO
global.io = jest.fn(() => ({
	on: jest.fn(),
	emit: jest.fn()
}));

// Mock DOM elements and functions
global.document = {
	createElement: jest.fn(tag => ({
		style: {},
		classList: {
			add: jest.fn(),
			remove: jest.fn()
		},
		appendChild: jest.fn(),
		addEventListener: jest.fn()
	})),
	getElementById: jest.fn(id => ({
		style: {},
		classList: {
			add: jest.fn(),
			remove: jest.fn()
		},
		appendChild: jest.fn(),
		addEventListener: jest.fn()
	}))
};

global.window = {
	innerWidth: 1024,
	innerHeight: 768,
	addEventListener: jest.fn()
};

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn(callback => setTimeout(callback, 0));

// Reset all mocks before each test
beforeEach(() => {
	jest.clearAllMocks();
}); 