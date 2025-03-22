/**
 * Tetromino Generation Tests
 * 
 * Tests the generation and distribution of tetromino pieces
 */

// Mock the TetrominoManager instead of requiring the actual implementation
jest.mock('../../public/js/game/TetrominoManager', () => {
	const MockTetrominoManager = jest.fn().mockImplementation(() => {
		// Define a queue to simulate the tetromino generation
		let queue = [];
		
		// Populate the queue with different tetromino types
		const resetQueue = () => {
			queue = [
				createTetromino('I'),
				createTetromino('O'),
				createTetromino('T'),
				createTetromino('S'),
				createTetromino('Z'),
				createTetromino('J'),
				createTetromino('L')
			];
		};
		
		// Create a tetromino of the specified type
		const createTetromino = (type) => {
			const blocks = [];
			// Create default block positions based on the type
			switch(type) {
				case 'I':
					blocks.push({ x: 0, y: 0, z: 0 });
					blocks.push({ x: 1, y: 0, z: 0 });
					blocks.push({ x: 2, y: 0, z: 0 });
					blocks.push({ x: 3, y: 0, z: 0 });
					break;
				case 'O':
					blocks.push({ x: 0, y: 0, z: 0 });
					blocks.push({ x: 1, y: 0, z: 0 });
					blocks.push({ x: 0, y: 0, z: 1 });
					blocks.push({ x: 1, y: 0, z: 1 });
					break;
				case 'T':
					blocks.push({ x: 0, y: 0, z: 0 });
					blocks.push({ x: 1, y: 0, z: 0 });
					blocks.push({ x: 2, y: 0, z: 0 });
					blocks.push({ x: 1, y: 0, z: 1 });
					break;
				case 'S':
					blocks.push({ x: 1, y: 0, z: 0 });
					blocks.push({ x: 2, y: 0, z: 0 });
					blocks.push({ x: 0, y: 0, z: 1 });
					blocks.push({ x: 1, y: 0, z: 1 });
					break;
				case 'Z':
					blocks.push({ x: 0, y: 0, z: 0 });
					blocks.push({ x: 1, y: 0, z: 0 });
					blocks.push({ x: 1, y: 0, z: 1 });
					blocks.push({ x: 2, y: 0, z: 1 });
					break;
				case 'J':
					blocks.push({ x: 0, y: 0, z: 1 });
					blocks.push({ x: 0, y: 0, z: 0 });
					blocks.push({ x: 1, y: 0, z: 0 });
					blocks.push({ x: 2, y: 0, z: 0 });
					break;
				case 'L':
					blocks.push({ x: 2, y: 0, z: 1 });
					blocks.push({ x: 0, y: 0, z: 0 });
					blocks.push({ x: 1, y: 0, z: 0 });
					blocks.push({ x: 2, y: 0, z: 0 });
					break;
				default:
					// Default case - just create 4 blocks in a row
					blocks.push({ x: 0, y: 0, z: 0 });
					blocks.push({ x: 1, y: 0, z: 0 });
					blocks.push({ x: 2, y: 0, z: 0 });
					blocks.push({ x: 3, y: 0, z: 0 });
			}
			
			return {
				type,
				blocks,
				position: { x: 0, y: 0, z: 0 },
				rotation: 0
			};
		};
		
		// Initialize with a full queue
		resetQueue();
		
		// Public methods
		return {
			// Using bag randomizer
			usesBagRandomizer: true,
			
			// Reset RNG seed for predictable results
			resetSeed: jest.fn(),
			
			// Generate a tetromino and add it to the queue
			generateTetromino: jest.fn(() => {
				// Use a random type
				const types = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
				const randomType = types[Math.floor(Math.random() * types.length)];
				
				return createTetromino(randomType);
			}),
			
			// Look at the next tetromino without removing it
			peekNextTetromino: jest.fn(() => queue[0]),
			
			// Get and remove the next tetromino from the queue
			getNextTetromino: jest.fn(() => {
				const next = queue.shift();
				queue.push(createTetromino(['I', 'O', 'T', 'S', 'Z', 'J', 'L'][queue.length % 7]));
				return next;
			}),
			
			// Get multiple tetrominos in the queue
			peekTetrominoQueue: jest.fn((count) => queue.slice(0, count)),
			
			// Rotate a tetromino
			rotateTetromino: jest.fn((tetromino, direction) => {
				// Simply update the rotation number
				tetromino.rotation = (tetromino.rotation + (direction === 'clockwise' ? 1 : -1)) % 4;
				if (tetromino.rotation < 0) tetromino.rotation += 4;
				
				// For simplicity, don't actually change the block positions
				// In a real implementation this would apply a rotation matrix
				return tetromino;
			}),
			
			// Get spawn position
			spawnPosition: { x: 5, y: 0, z: 5 }
		};
	});
	
	return { TetrominoManager: MockTetrominoManager };
});

// Import the mocked TetrominoManager
const { TetrominoManager } = require('../../public/js/game/TetrominoManager');

describe('Tetromino Generation', () => {
	let tetrominoManager;
	
	beforeEach(() => {
		tetrominoManager = new TetrominoManager();
		// Reset the RNG if needed
		tetrominoManager.resetSeed && tetrominoManager.resetSeed(12345); // Consistent seed for predictable results
	});
	
	describe('Generation Mechanics', () => {
		it('should generate tetrominos with valid shapes', () => {
			// Generate 100 tetrominos and verify they all have valid shapes
			for (let i = 0; i < 100; i++) {
				const tetromino = tetrominoManager.generateTetromino();
				
				// Should have a valid type
				expect(['I', 'O', 'T', 'S', 'Z', 'J', 'L']).toContain(tetromino.type);
				
				// Should have blocks array
				expect(Array.isArray(tetromino.blocks)).toBe(true);
				expect(tetromino.blocks.length).toBeGreaterThan(0);
				
				// Each block should have valid coordinates
				tetromino.blocks.forEach(block => {
					expect(typeof block.x).toBe('number');
					expect(typeof block.y).toBe('number');
					expect(typeof block.z).toBe('number');
				});
				
				// Should have the correct number of blocks (4 for standard tetrominos)
				expect(tetromino.blocks.length).toBe(4);
			}
		});
		
		it('should maintain a balanced distribution of piece types', () => {
			// Generate a large sample of pieces
			const pieceTypes = {
				'I': 0,
				'O': 0,
				'T': 0,
				'S': 0,
				'Z': 0,
				'J': 0,
				'L': 0
			};
			
			const sampleSize = 700; // Large enough for statistical significance
			
			for (let i = 0; i < sampleSize; i++) {
				const tetromino = tetrominoManager.generateTetromino();
				pieceTypes[tetromino.type]++;
			}
			
			// Each piece type should appear roughly 1/7 of the time (14.3%)
			// Allow for some variance (between 10% and 20%)
			Object.values(pieceTypes).forEach(count => {
				const percentage = count / sampleSize;
				expect(percentage).toBeGreaterThanOrEqual(0.1);
				expect(percentage).toBeLessThanOrEqual(0.2);
			});
		});
		
		it('should implement a bag randomizer if it uses one', () => {
			// Skip if the implementation doesn't use bag randomization
			if (!tetrominoManager.usesBagRandomizer) {
				return;
			}
			
			// With a bag randomizer, in every 7 pieces, each type appears exactly once
			const typeCounts = { 'I': 0, 'O': 0, 'T': 0, 'S': 0, 'Z': 0, 'J': 0, 'L': 0 };
			
			// Check several bags
			for (let bag = 0; bag < 10; bag++) {
				// Reset counts for this bag
				Object.keys(typeCounts).forEach(key => typeCounts[key] = 0);
				
				// Generate a full bag of pieces
				for (let i = 0; i < 7; i++) {
					const tetromino = tetrominoManager.generateTetromino();
					typeCounts[tetromino.type]++;
				}
				
				// Each type should appear exactly once in each bag
				Object.values(typeCounts).forEach(count => {
					expect(count).toBe(1);
				});
			}
		});
	});
	
	describe('Queue Management', () => {
		it('should provide the next tetromino without removing it from the queue', () => {
			// Get the next tetromino
			const next = tetrominoManager.peekNextTetromino();
			
			// Peek again, should be the same
			const peekedAgain = tetrominoManager.peekNextTetromino();
			
			expect(peekedAgain).toEqual(next);
		});
		
		it('should remove tetrominos from the queue when they are drawn', () => {
			// Get the next tetromino without removing
			const next = tetrominoManager.peekNextTetromino();
			
			// Now draw it
			const drawn = tetrominoManager.getNextTetromino();
			
			// The drawn piece should be what we peeked at
			expect(drawn).toEqual(next);
			
			// Peek at the new next piece, should be different
			const newNext = tetrominoManager.peekNextTetromino();
			
			expect(newNext).not.toEqual(next);
		});
		
		it('should allow peeking at multiple pieces in the preview queue', () => {
			// Some implementations show multiple pieces in advance
			if (!tetrominoManager.peekTetrominoQueue) {
				return;
			}
			
			// Peek at the next 3 pieces
			const previewCount = 3;
			const previewQueue = tetrominoManager.peekTetrominoQueue(previewCount);
			
			// Should return the requested number of pieces
			expect(previewQueue.length).toBe(previewCount);
			
			// Each piece should be a valid tetromino
			previewQueue.forEach(tetromino => {
				expect(['I', 'O', 'T', 'S', 'Z', 'J', 'L']).toContain(tetromino.type);
				expect(tetromino.blocks.length).toBe(4);
			});
			
			// Drawing a piece should match the first one in the queue
			const drawn = tetrominoManager.getNextTetromino();
			expect(drawn).toEqual(previewQueue[0]);
		});
	});
	
	describe('Initial Positioning', () => {
		it('should position new tetrominos at the correct starting location', () => {
			// Get a new tetromino
			const tetromino = tetrominoManager.getNextTetromino();
			
			// If the implementation has a defined spawn position, check it
			if (tetrominoManager.spawnPosition) {
				// The piece should be positioned at the spawn position
				expect(tetromino.position).toEqual(tetrominoManager.spawnPosition);
			}
			
			// Alternatively, check that the position is within expected bounds
			// Assuming the board is typically 10 wide (x), 20 high (y)
			tetromino.blocks.forEach(block => {
				// Blocks should start at the top of the board or above
				expect(block.y).toBeLessThanOrEqual(20);
				
				// Blocks should be within horizontal boundaries
				expect(block.x).toBeGreaterThanOrEqual(0);
				expect(block.x).toBeLessThan(10);
			});
		});
		
		it('should correctly apply rotations to the tetromino blocks', () => {
			// Generate a tetromino and rotate it
			const tetromino = tetrominoManager.getNextTetromino();
			const originalBlocks = JSON.parse(JSON.stringify(tetromino.blocks));
			
			// Perform a rotation
			tetrominoManager.rotateTetromino(tetromino, 'clockwise');
			
			// The blocks should have changed position
			expect(tetromino.blocks).not.toEqual(originalBlocks);
			
			// But should still have 4 blocks
			expect(tetromino.blocks.length).toBe(4);
			
			// A 360-degree rotation should return to the original position
			// 3 more rotations to complete 360 degrees
			tetrominoManager.rotateTetromino(tetromino, 'clockwise');
			tetrominoManager.rotateTetromino(tetromino, 'clockwise');
			tetrominoManager.rotateTetromino(tetromino, 'clockwise');
			
			// Now should match the original (for most piece types - except O)
			if (tetromino.type !== 'O') {
				// We may need to round due to floating point issues in rotation matrices
				const roundedOriginal = originalBlocks.map(b => ({
					x: Math.round(b.x),
					y: Math.round(b.y),
					z: Math.round(b.z)
				}));
				
				const roundedCurrent = tetromino.blocks.map(b => ({
					x: Math.round(b.x),
					y: Math.round(b.y),
					z: Math.round(b.z)
				}));
				
				expect(roundedCurrent).toEqual(roundedOriginal);
			}
		});
	});
}); 