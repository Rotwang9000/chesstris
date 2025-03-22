/**
 * Creates a test proxy that wraps a mock object
 * @param {Object} implementation - The mock implementation
 * @returns {Proxy} A proxy object that forwards calls to the implementation
 */
export function createTestProxy(implementation) {
	return new Proxy(implementation, {
		get(target, prop) {
			// Return the implementation's property if it exists
			if (prop in target) {
				return target[prop];
			}
			
			// For functions not implemented, return a stub function
			if (typeof prop === 'string' && !prop.startsWith('_')) {
				return (...args) => {
					console.warn(`Method ${prop} was called but not implemented in mock`);
					return undefined;
				};
			}
			
			return undefined;
		}
	});
}

/**
 * Creates mock game state for testing
 * @param {Object} options - Custom options for the mock
 * @returns {Object} Mock game state
 */
export function createMockGameState(options = {}) {
	return {
		board: Array(10).fill().map(() => Array(20).fill(null)),
		players: {
			player1: { id: 'player1', username: 'TestPlayer1', score: 0, ...options.player1 },
			player2: options.player2 ? { id: 'player2', username: 'TestPlayer2', score: 0, ...options.player2 } : undefined
		},
		pieces: {
			player1: options.player1Pieces || [],
			player2: options.player2Pieces || []
		},
		fallingPiece: options.fallingPiece || null,
		gameId: options.gameId || 'test-game-123',
		...options
	};
}

/**
 * Waits for a specified time
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after the specified time
 */
export function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
} 