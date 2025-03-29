/**
 * NetworkManager Class Unit Tests
 * This file contains basic unit tests for the NetworkManager class
 */

// Import the NetworkManager class
import NetworkManagerClass from '../NetworkManagerClass.js';

// Mock dependencies
class MockSocket {
	constructor() {
		this.connected = true;
		this.eventHandlers = {};
		this.id = 'mock-socket-id';
	}

	on(event, handler) {
		if (!this.eventHandlers[event]) {
			this.eventHandlers[event] = [];
		}
		this.eventHandlers[event].push(handler);
	}

	off() {
		this.eventHandlers = {};
	}

	emit(event, data, callback) {
		console.log(`MockSocket: Emitted ${event}`, data);
		if (callback) {
			if (event === 'joinGame') {
				callback({
					gameId: 'test-game-id',
					playerId: 'test-player-id',
					success: true
				});
			} else if (event === 'getGameState') {
				callback({
					gameId: 'test-game-id',
					phase: 'TETRIS',
					timestamp: Date.now()
				});
			} else {
				callback({});
			}
		}
	}

	disconnect() {
		this.connected = false;
	}

	// Helper to trigger events for testing
	triggerEvent(event, data) {
		if (this.eventHandlers[event]) {
			this.eventHandlers[event].forEach(handler => handler(data));
		}
	}
}

// Mock io function
global.io = (url, options) => {
	console.log(`MockIO: Creating socket for ${url}`, options);
	return new MockSocket();
};

// Mock document for DOM events
if (typeof document === 'undefined') {
	global.document = {
		dispatchEvent: (event) => {
			console.log(`MockDocument: Dispatched event ${event.type}`);
		},
		addEventListener: (event, handler) => {
			console.log(`MockDocument: Added listener for ${event}`);
		}
	};
}

// Mock window for location
if (typeof window === 'undefined') {
	global.window = {
		location: {
			hostname: 'localhost',
			protocol: 'http:',
			port: '3000',
			origin: 'http://localhost:3000'
		}
	};
}

// Define test runner
const runTests = async () => {
	console.log('Running NetworkManager tests...');
	
	// Test case 1: Initialization
	try {
		console.log('Test 1: Initialization');
		const networkManager = new NetworkManagerClass();
		
		console.assert(networkManager !== undefined, 'NetworkManager instance should be created');
		console.assert(networkManager.state !== undefined, 'NetworkManager state should be initialized');
		console.assert(networkManager.state.connectionStatus === 'disconnected', 'Initial connection status should be disconnected');
		
		console.log('Test 1: Passed');
	} catch (error) {
		console.error('Test 1 failed:', error);
	}
	
	// Test case 2: Connect
	try {
		console.log('Test 2: Connect');
		const networkManager = new NetworkManagerClass();
		
		// Connect
		const connectPromise = networkManager.initialize('TestPlayer');
		
		// Simulate connection success
		networkManager.state.socket = new MockSocket();
		networkManager.state.socket.triggerEvent('connect');
		
		// Wait for connect promise
		await connectPromise;
		
		console.assert(networkManager.isConnected(), 'NetworkManager should be connected');
		console.assert(networkManager.state.playerName === 'TestPlayer', 'Player name should be set');
		
		console.log('Test 2: Passed');
	} catch (error) {
		console.error('Test 2 failed:', error);
	}
	
	// Test case 3: Event listeners
	try {
		console.log('Test 3: Event listeners');
		const networkManager = new NetworkManagerClass();
		
		// Set up event tracking
		let connectFired = false;
		let disconnectFired = false;
		
		// Add event listeners
		networkManager.on('connect', () => {
			connectFired = true;
		});
		
		networkManager.on('disconnect', () => {
			disconnectFired = true;
		});
		
		// Connect
		const connectPromise = networkManager.initialize('TestPlayer');
		
		// Simulate connection success
		networkManager.state.socket = new MockSocket();
		networkManager.state.socket.triggerEvent('connect');
		
		// Wait for connect promise
		await connectPromise;
		
		// Simulate disconnect
		networkManager.state.socket.triggerEvent('disconnect', 'io client disconnect');
		
		console.assert(connectFired, 'Connect event should have fired');
		console.assert(disconnectFired, 'Disconnect event should have fired');
		
		console.log('Test 3: Passed');
	} catch (error) {
		console.error('Test 3 failed:', error);
	}
	
	// Test case 4: Join game
	try {
		console.log('Test 4: Join game');
		const networkManager = new NetworkManagerClass();
		
		// Connect
		const connectPromise = networkManager.initialize('TestPlayer');
		
		// Simulate connection success
		networkManager.state.socket = new MockSocket();
		networkManager.state.socket.triggerEvent('connect');
		
		// Wait for connect promise
		await connectPromise;
		
		// Join game
		const gameData = await networkManager.joinGame();
		
		console.assert(gameData.gameId === 'test-game-id', 'Game ID should be set');
		console.assert(gameData.playerId === 'test-player-id', 'Player ID should be set');
		console.assert(networkManager.state.gameId === 'test-game-id', 'Game ID should be stored in state');
		
		console.log('Test 4: Passed');
	} catch (error) {
		console.error('Test 4 failed:', error);
	}
	
	// Test case 5: Get game state
	try {
		console.log('Test 5: Get game state');
		const networkManager = new NetworkManagerClass();
		
		// Connect
		const connectPromise = networkManager.initialize('TestPlayer');
		
		// Simulate connection success
		networkManager.state.socket = new MockSocket();
		networkManager.state.socket.triggerEvent('connect');
		
		// Wait for connect promise
		await connectPromise;
		
		// Set game ID
		networkManager.state.gameId = 'test-game-id';
		
		// Get game state
		const gameState = await networkManager.getGameState();
		
		console.assert(gameState.gameId === 'test-game-id', 'Game ID should be returned');
		console.assert(gameState.phase === 'TETRIS', 'Game phase should be returned');
		console.assert(networkManager.state.lastUpdateTimestamp > 0, 'Timestamp should be updated');
		
		console.log('Test 5: Passed');
	} catch (error) {
		console.error('Test 5 failed:', error);
	}
	
	console.log('NetworkManager tests completed');
};

// Run tests if in test environment
if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
	runTests().catch(error => {
		console.error('Test runner failed:', error);
	});
}

// Export the test runner
export default runTests; 