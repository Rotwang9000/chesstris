/**
 * Internal Modules Mock
 * 
 * A simplified mock implementation of various internal modules.
 */

module.exports = {
	// Debug module
	debug: jest.fn(),
	log: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	
	// Constants
	CONSTANTS: {
		MAX_PLAYERS: 8,
		BOARD_SIZE: {
			WIDTH: 17,
			HEIGHT: 1,
			DEPTH: 17
		},
		COLORS: {
			PLAYER_1: '#FF0000',
			PLAYER_2: '#0000FF',
			PLAYER_3: '#00FF00',
			PLAYER_4: '#FFFF00',
			NEUTRAL: '#CCCCCC'
		},
		TETROMINO_TYPES: ['I', 'O', 'T', 'S', 'Z', 'J', 'L'],
		CHESS_PIECES: ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']
	},
	
	// Event emitter
	EventEmitter: class MockEventEmitter {
		constructor() {
			this.events = {};
		}
		
		on(event, listener) {
			if (!this.events[event]) {
				this.events[event] = [];
			}
			this.events[event].push(listener);
			return this;
		}
		
		emit(event, ...args) {
			if (this.events[event]) {
				this.events[event].forEach(listener => listener(...args));
			}
			return true;
		}
		
		off(event, listener) {
			if (this.events[event]) {
				this.events[event] = this.events[event].filter(l => l !== listener);
			}
			return this;
		}
		
		once(event, listener) {
			const onceWrapper = (...args) => {
				listener(...args);
				this.off(event, onceWrapper);
			};
			return this.on(event, onceWrapper);
		}
	},
	
	// Utils
	utils: {
		generateId: jest.fn(() => Math.random().toString(36).substr(2, 9)),
		cloneDeep: jest.fn(obj => JSON.parse(JSON.stringify(obj))),
		isEmpty: jest.fn(obj => Object.keys(obj).length === 0),
		randomInt: jest.fn((min, max) => Math.floor(Math.random() * (max - min + 1)) + min)
	},
	
	// Path module
	path: {
		join: jest.fn((...args) => args.join('/')),
		resolve: jest.fn((...args) => args.join('/'))
	},
	
	// File system module
	fs: {
		readFileSync: jest.fn(() => '{}'),
		writeFileSync: jest.fn(),
		existsSync: jest.fn(() => true),
		mkdirSync: jest.fn()
	},
	
	// Regular expressions
	re: {
		UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
		PASSWORD: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/
	},
	
	// Network module
	network: {
		sendToClient: jest.fn(),
		broadcastToAll: jest.fn(),
		broadcastToRoom: jest.fn()
	},
	
	// Parser module
	parser: {
		parseMessage: jest.fn(msg => JSON.parse(msg)),
		stringifyMessage: jest.fn(obj => JSON.stringify(obj))
	}
}; 