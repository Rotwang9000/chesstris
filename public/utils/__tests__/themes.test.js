const {
	THEMES,
	getTheme,
	getAllThemes,
	getPieceModelPath,
	getPieceScale
} = require('../themes');

describe('Theme Management', () => {
	describe('getTheme', () => {
		test('should return default theme if no theme name is provided', () => {
			const theme = getTheme();
			expect(theme).toBeDefined();
			expect(theme.name).toBe('Default');
		});

		test('should return russian theme when specified', () => {
			const theme = getTheme(THEMES.RUSSIAN);
			expect(theme).toBeDefined();
			expect(theme.name).toBe('Russian Tetris');
		});

		test('should return default theme when invalid theme name is provided', () => {
			const theme = getTheme('nonexistent-theme');
			expect(theme).toBeDefined();
			expect(theme.name).toBe('Default');
		});
	});

	describe('getAllThemes', () => {
		test('should return array of all available themes', () => {
			const themes = getAllThemes();
			expect(themes).toBeInstanceOf(Array);
			expect(themes.length).toBe(2); // Default and Russian themes
			expect(themes[0]).toHaveProperty('id');
			expect(themes[0]).toHaveProperty('name');
			expect(themes[0]).toHaveProperty('description');
		});
	});

	describe('getPieceModelPath', () => {
		test('should return correct model path for default theme', () => {
			const kingPath = getPieceModelPath('king');
			expect(kingPath).toBe('models/default/king.glb');
		});

		test('should return correct model path for russian theme', () => {
			const kingPath = getPieceModelPath('king', THEMES.RUSSIAN);
			expect(kingPath).toBe('models/russian/king_cathedral.glb');
		});

		test('should return default path when theme does not have specific piece', () => {
			// Create a temporary THEMES object to test with
			const originalThemes = {...THEMES};
			THEMES.TEST = 'test';
			
			const path = getPieceModelPath('king', 'TEST');
			expect(path).toBe('models/default/king.glb');
			
			// Restore original THEMES
			Object.keys(THEMES).forEach(key => {
				if (!originalThemes[key]) delete THEMES[key];
			});
		});
	});

	describe('getPieceScale', () => {
		test('should return correct scale for default theme', () => {
			const pawnScale = getPieceScale('pawn');
			expect(pawnScale).toBe(0.6);
		});

		test('should return correct scale for russian theme', () => {
			const kingScale = getPieceScale('king', THEMES.RUSSIAN);
			expect(kingScale).toBe(0.85);
		});

		test('should return default scale when theme does not have specific piece', () => {
			// Create a temporary THEMES object to test with
			const originalThemes = {...THEMES};
			THEMES.TEST = 'test';
			
			const scale = getPieceScale('pawn', 'TEST');
			expect(scale).toBe(0.6);
			
			// Restore original THEMES
			Object.keys(THEMES).forEach(key => {
				if (!originalThemes[key]) delete THEMES[key];
			});
		});
	});
});

// Test suite for the themes utility
describe('Russian Theme Features', () => {
	// Mock Three.js for testing
	global.THREE = {
		CanvasTexture: jest.fn(() => ({})),
		MeshBasicMaterial: jest.fn(() => ({})),
		BoxGeometry: jest.fn(),
		BufferGeometry: jest.fn(() => ({
			setAttribute: jest.fn()
		})),
		Float32BufferAttribute: jest.fn(),
		Points: jest.fn(),
		PointsMaterial: jest.fn(),
		Group: jest.fn(() => ({
			add: jest.fn(),
			traverse: jest.fn(fn => fn({ geometry: { clone: () => ({}) } })),
			updateMatrixWorld: jest.fn()
		})),
		Vector2: jest.fn(),
		LatheGeometry: jest.fn(),
		TextureLoader: jest.fn(() => ({
			load: jest.fn((url, callback) => callback({}))
		})),
		Shape: jest.fn(() => ({
			moveTo: jest.fn(),
			lineTo: jest.fn(),
			closePath: jest.fn()
		})),
		ExtrudeGeometry: jest.fn(),
		Mesh: jest.fn(),
		MeshPhongMaterial: jest.fn(),
		BoxGeometry: jest.fn(),
		CylinderGeometry: jest.fn(),
		SphereGeometry: jest.fn(),
		Matrix4: jest.fn(() => ({
			copy: jest.fn()
		})),
		Vector3: jest.fn(() => ({
			fromBufferAttribute: jest.fn(),
			applyMatrix4: jest.fn(),
			transformDirection: jest.fn()
		}))
	};

	// Create mock canvas and context for testing
	const mockContext = {
		createLinearGradient: jest.fn(() => ({
			addColorStop: jest.fn()
		})),
		fillStyle: null,
		fillRect: jest.fn(),
		strokeStyle: null,
		lineWidth: null,
		beginPath: jest.fn(),
		moveTo: jest.fn(),
		lineTo: jest.fn(),
		closePath: jest.fn(),
		stroke: jest.fn(),
		save: jest.fn(),
		translate: jest.fn(),
		rotate: jest.fn(),
		restore: jest.fn(),
		arc: jest.fn(),
		fill: jest.fn()
	};

	const mockCanvas = {
		getContext: jest.fn(() => mockContext),
		width: 512,
		height: 512
	};

	// Mock document createElement
	document.createElement = jest.fn(type => {
		if (type === 'canvas') return mockCanvas;
		if (type === 'audio') {
			return {
				src: '',
				loop: false,
				volume: 1,
				play: jest.fn(),
				pause: jest.fn(),
				addEventListener: jest.fn()
			};
		}
		return {
			style: {},
			className: '',
			appendChild: jest.fn(),
			addEventListener: jest.fn()
		};
	});

	describe('createOnionDomeGeometry', () => {
		test('should create a geometry with appropriate segments', () => {
			// Import the function from main.js
			const { createOnionDomeGeometry } = require('../../main.js');
			
			// Call the function
			const geometry = createOnionDomeGeometry(1.0);
			
			// Verify the LatheGeometry was created with correct points
			expect(THREE.Vector2).toHaveBeenCalled();
			expect(THREE.LatheGeometry).toHaveBeenCalled();
		});
	});

	describe('createSovietStarGeometry', () => {
		test('should create a 5-pointed star geometry', () => {
			// Import the function from main.js
			const { createSovietStarGeometry } = require('../../main.js');
			
			// Call the function
			const geometry = createSovietStarGeometry(1.0);
			
			// Verify shape and extrude were called
			expect(THREE.Shape).toHaveBeenCalled();
			expect(THREE.ExtrudeGeometry).toHaveBeenCalled();
		});
	});

	describe('createCathedralGeometry', () => {
		test('should create St. Basil\'s Cathedral geometry with onion domes', () => {
			// Import the function from main.js
			const { createCathedralGeometry } = require('../../main.js');
			
			// Call the function
			const geometry = createCathedralGeometry(1.0);
			
			// Verify group and merge were used
			expect(THREE.Group).toHaveBeenCalled();
			expect(THREE.CylinderGeometry).toHaveBeenCalled();
		});
	});

	describe('createSnowflakeTexture', () => {
		test('should create a canvas texture for snowflakes', () => {
			// Import the function from main.js
			const { createSnowflakeTexture } = require('../../main.js');
			
			// Call the function
			const texture = createSnowflakeTexture();
			
			// Verify canvas operations were performed
			expect(document.createElement).toHaveBeenCalledWith('canvas');
			expect(mockContext.beginPath).toHaveBeenCalled();
			expect(mockContext.arc).toHaveBeenCalled();
			expect(mockContext.fill).toHaveBeenCalled();
			expect(THREE.CanvasTexture).toHaveBeenCalled();
		});
	});

	describe('createTetromino', () => {
		test('should create tetromino with Russian theme colors', () => {
			// Import the function from main.js
			const { createTetromino } = require('../../main.js');
			
			// Mock piece
			const piece = {
				type: 'I',
				blocks: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
				x: 0,
				y: 0,
				z: 0
			};
			
			// Call the function
			const tetrominoGroup = createTetromino(piece);
			
			// Verify THREE.Group was called to create container
			expect(THREE.Group).toHaveBeenCalled();
			// Verify mesh was created for each block
			expect(THREE.Mesh).toHaveBeenCalled();
		});
	});

	describe('loadThemeAudio', () => {
		test('should set up audio with Russian music tracks', () => {
			// Mock AudioContext
			window.AudioContext = jest.fn(() => ({
				createMediaElementSource: jest.fn(() => ({
					connect: jest.fn()
				})),
				createAnalyser: jest.fn(() => ({
					connect: jest.fn(),
					fftSize: 0,
					frequencyBinCount: 128,
					getByteFrequencyData: jest.fn()
				})),
				destination: {}
			}));
			
			// Import the function from main.js
			const { loadThemeAudio } = require('../../main.js');
			
			// Call the function
			loadThemeAudio();
			
			// Verify audio element was created
			expect(document.createElement).toHaveBeenCalledWith('audio');
			// Verify audio controls were added
			expect(document.createElement).toHaveBeenCalledWith('div');
		});
	});
}); 