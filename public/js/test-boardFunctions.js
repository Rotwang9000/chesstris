/**
 * Test script for boardFunctions integration
 */

import { boardFunctions } from './boardFunctions.js';

console.log('Testing boardFunctions integration...');
console.log('boardFunctions loaded:', boardFunctions);

// Mock gameState for testing
const mockGameState = {
	boardBounds: {
		minX: 0,
		maxX: 20,
		minZ: 0,
		maxZ: 20
	},
	currentPlayer: 1,
	chessPieces: [
		{
			type: 'KING',
			player: 1,
			position: { x: 10, z: 10 }
		}
	]
};

// Test creating a tetromino
const tetromino = boardFunctions.createRandomTetromino(mockGameState);
console.log('Created tetromino:', tetromino);

// Test finding king position
const kingPos = boardFunctions.findPlayerKingPosition(mockGameState);
console.log('Found king at:', kingPos);

// Test position validation
const validPosition = boardFunctions.isValidTetrominoPosition(
	mockGameState,
	tetromino.shape,
	tetromino.position
);
console.log('Position is valid:', validPosition);

console.log('Test complete!'); 