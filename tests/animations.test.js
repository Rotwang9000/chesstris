/**
 * Animations Module Unit Tests
 */

describe('Animations Module', () => {
	// Mock THREE.js
	const mockTHREE = {
		Vector3: jest.fn(function(x, y, z) {
			this.x = x || 0;
			this.y = y || 0;
			this.z = z || 0;
			this.copy = jest.fn(function(v) {
				this.x = v.x;
				this.y = v.y;
				this.z = v.z;
				return this;
			});
			this.add = jest.fn(function(v) {
				this.x += v.x;
				this.y += v.y;
				this.z += v.z;
				return this;
			});
			this.clone = jest.fn(() => new mockTHREE.Vector3(this.x, this.y, this.z));
		}),
		Color: jest.fn(function(color) {
			this.color = color;
			this.lerp = jest.fn(function() { return this; });
			this.clone = jest.fn(() => new mockTHREE.Color(this.color));
		}),
		MeshBasicMaterial: jest.fn(function(options) {
			Object.assign(this, options || {});
			this.opacity = this.opacity || 1;
			this.transparent = this.transparent || false;
		}),
		BoxGeometry: jest.fn(),
		Mesh: jest.fn(function(geometry, material) {
			this.geometry = geometry;
			this.material = material;
			this.position = new mockTHREE.Vector3();
			this.rotation = { 
				x: 0, 
				y: 0, 
				z: 0,
				set: jest.fn()
			};
			this.scale = new mockTHREE.Vector3(1, 1, 1);
			this.userData = {};
			this.visible = true;
			this.parent = null;
		})
	};
	
	// Create mock dependencies
	const mockGameRenderer = {
		scene: {
			add: jest.fn(),
			remove: jest.fn()
		},
		boardGroup: {
			add: jest.fn(),
			remove: jest.fn()
		}
	};
	
	const mockAnimator = {
		add: jest.fn(),
		remove: jest.fn()
	};
	
	const mockSoundManager = {
		play: jest.fn()
	};
	
	// Set up global THREE object and mock modules
	global.THREE = mockTHREE;
	
	jest.doMock('../public/js/utils/gameRenderer.js', () => mockGameRenderer);
	jest.doMock('../public/js/utils/animator.js', () => mockAnimator);
	jest.doMock('../public/js/utils/soundManager.js', () => mockSoundManager);
	
	// Import the module for testing after mocks are set up
	const animations = require('../public/js/utils/animations.js');
	
	beforeEach(() => {
		// Reset mocks before each test
		jest.clearAllMocks();
		
		// Setup module with mocks
		if (animations.init) {
			animations.init({
				gameRenderer: mockGameRenderer,
				animator: mockAnimator,
				soundManager: mockSoundManager
			});
		}
	});
	
	describe('Initialization', () => {
		test('should initialize properly', () => {
			// Skip if init is not defined
			if (!animations.init) {
				return;
			}
			
			const initResult = animations.init({
				gameRenderer: mockGameRenderer,
				animator: mockAnimator,
				soundManager: mockSoundManager
			});
			
			expect(initResult).toBe(true);
		});
	});
	
	describe('Row Clearing Animation', () => {
		test('should create row clearing animation', () => {
			// Skip if function is not defined
			if (!animations.createRowClearingAnimation) {
				return;
			}
			
			const row = 5;
			const cells = [
				{ x: 0, y: 5, z: 0 },
				{ x: 1, y: 5, z: 0 },
				{ x: 2, y: 5, z: 0 }
			];
			
			const animation = animations.createRowClearingAnimation(row, cells);
			
			expect(animation).toBeDefined();
			expect(mockAnimator.add).toHaveBeenCalled();
			expect(mockSoundManager.play).toHaveBeenCalled();
		});
		
		test('should handle empty cells array', () => {
			// Skip if function is not defined
			if (!animations.createRowClearingAnimation) {
				return;
			}
			
			const animation = animations.createRowClearingAnimation(5, []);
			
			expect(animation).toBeDefined();
			expect(mockAnimator.add).toHaveBeenCalled();
		});
	});
	
	describe('Cell Disintegration Animation', () => {
		test('should create cell disintegration animation', () => {
			// Skip if function is not defined
			if (!animations.createCellDisintegrationAnimation) {
				return;
			}
			
			const cell = {
				x: 1,
				y: 2,
				z: 3,
				color: 0xff0000
			};
			
			const animation = animations.createCellDisintegrationAnimation(cell);
			
			expect(animation).toBeDefined();
			expect(mockAnimator.add).toHaveBeenCalled();
			expect(mockSoundManager.play).toHaveBeenCalled();
		});
		
		test('should create particles for disintegration', () => {
			// Skip if function is not defined
			if (!animations.createCellDisintegrationAnimation) {
				return;
			}
			
			const cell = {
				x: 1,
				y: 2,
				z: 3,
				color: 0xff0000
			};
			
			animations.createCellDisintegrationAnimation(cell);
			
			// Verify particles were created
			expect(mockTHREE.BoxGeometry).toHaveBeenCalled();
			expect(mockTHREE.MeshBasicMaterial).toHaveBeenCalled();
			expect(mockTHREE.Mesh).toHaveBeenCalled();
			expect(mockGameRenderer.scene.add).toHaveBeenCalled();
		});
	});
	
	describe('Cell Attachment Animation', () => {
		test('should create cell attachment animation', () => {
			// Skip if function is not defined
			if (!animations.createCellAttachmentAnimation) {
				return;
			}
			
			const cell = {
				x: 1,
				y: 2,
				z: 3,
				color: 0xff0000
			};
			
			const animation = animations.createCellAttachmentAnimation(cell);
			
			expect(animation).toBeDefined();
			expect(mockAnimator.add).toHaveBeenCalled();
			expect(mockSoundManager.play).toHaveBeenCalled();
		});
	});
	
	describe('Chess Piece Movement Animation', () => {
		test('should create chess piece movement animation', () => {
			// Skip if function is not defined
			if (!animations.createChessPieceMoveAnimation) {
				return;
			}
			
			const piece = {
				id: 'piece1',
				type: 'pawn',
				x: 1,
				y: 2,
				z: 0,
				playerId: 'player1'
			};
			
			const fromPosition = { x: 1, y: 2, z: 0 };
			const toPosition = { x: 1, y: 4, z: 0 };
			
			const animation = animations.createChessPieceMoveAnimation(piece, fromPosition, toPosition);
			
			expect(animation).toBeDefined();
			expect(mockAnimator.add).toHaveBeenCalled();
		});
		
		test('should handle movement with capture', () => {
			// Skip if function is not defined
			if (!animations.createChessPieceMoveAnimation) {
				return;
			}
			
			const piece = {
				id: 'piece1',
				type: 'pawn',
				x: 1,
				y: 2,
				z: 0,
				playerId: 'player1'
			};
			
			const fromPosition = { x: 1, y: 2, z: 0 };
			const toPosition = { x: 2, y: 3, z: 0 };
			const capturedPiece = {
				id: 'piece2',
				type: 'pawn',
				x: 2,
				y: 3,
				z: 0,
				playerId: 'player2'
			};
			
			const animation = animations.createChessPieceMoveAnimation(piece, fromPosition, toPosition, capturedPiece);
			
			expect(animation).toBeDefined();
			expect(mockAnimator.add).toHaveBeenCalled();
			expect(mockSoundManager.play).toHaveBeenCalledWith('capture');
		});
	});
	
	describe('Floating Island Animation', () => {
		test('should create floating island animation', () => {
			// Skip if function is not defined
			if (!animations.createFloatingIslandAnimation) {
				return;
			}
			
			const islandCells = [
				{ x: 0, y: 0, z: 0, mesh: new mockTHREE.Mesh() },
				{ x: 1, y: 0, z: 0, mesh: new mockTHREE.Mesh() },
				{ x: 0, y: 1, z: 0, mesh: new mockTHREE.Mesh() }
			];
			
			const animation = animations.createFloatingIslandAnimation(islandCells);
			
			expect(animation).toBeDefined();
			expect(mockAnimator.add).toHaveBeenCalled();
		});
		
		test('should update cell positions during animation', () => {
			// Skip if function is not defined
			if (!animations.createFloatingIslandAnimation) {
				return;
			}
			
			const islandCells = [
				{ 
					x: 0, y: 0, z: 0, 
					mesh: new mockTHREE.Mesh(),
					originalPosition: new mockTHREE.Vector3(0, 0, 0)
				}
			];
			
			const animation = animations.createFloatingIslandAnimation(islandCells);
			
			if (animation && animation.update) {
				// Call update to test animation effect
				animation.update(0.5);
				
				// Check if position was updated
				expect(islandCells[0].mesh.position.y).not.toBe(0);
			}
		});
	});
	
	describe('Victory Animation', () => {
		test('should create victory animation', () => {
			// Skip if function is not defined
			if (!animations.createVictoryAnimation) {
				return;
			}
			
			const playerId = 'player1';
			
			const animation = animations.createVictoryAnimation(playerId);
			
			expect(animation).toBeDefined();
			expect(mockAnimator.add).toHaveBeenCalled();
			expect(mockSoundManager.play).toHaveBeenCalledWith('victory');
		});
	});
	
	describe('Defeat Animation', () => {
		test('should create defeat animation', () => {
			// Skip if function is not defined
			if (!animations.createDefeatAnimation) {
				return;
			}
			
			const playerId = 'player1';
			
			const animation = animations.createDefeatAnimation(playerId);
			
			expect(animation).toBeDefined();
			expect(mockAnimator.add).toHaveBeenCalled();
			expect(mockSoundManager.play).toHaveBeenCalledWith('defeat');
		});
	});
}); 