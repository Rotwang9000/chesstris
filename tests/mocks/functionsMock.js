/**
 * Functions Mock
 * 
 * A generic mock for utility functions.
 */

// Create a mock function that returns a provided value
const createMockFn = (returnValue) => jest.fn(() => returnValue);

// Mock for various utility functions
module.exports = {
	// Math functions
	add: jest.fn((a, b) => a + b),
	subtract: jest.fn((a, b) => a - b),
	multiply: jest.fn((a, b) => a * b),
	divide: jest.fn((a, b) => a / b),
	
	// String functions
	capitalize: jest.fn(str => str.charAt(0).toUpperCase() + str.slice(1)),
	truncate: jest.fn((str, length) => str.length > length ? str.substring(0, length) + '...' : str),
	formatDate: jest.fn(date => new Date(date).toISOString()),
	
	// Array functions
	shuffle: jest.fn(array => [...array].sort(() => Math.random() - 0.5)),
	chunk: jest.fn((array, size) => {
		const chunked = [];
		for (let i = 0; i < array.length; i += size) {
			chunked.push(array.slice(i, i + size));
		}
		return chunked;
	}),
	
	// Object functions
	merge: jest.fn((obj1, obj2) => ({ ...obj1, ...obj2 })),
	pick: jest.fn((obj, keys) => {
		const result = {};
		keys.forEach(key => {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				result[key] = obj[key];
			}
		});
		return result;
	}),
	
	// ID generation
	generateId: jest.fn(() => Math.random().toString(36).substr(2, 9)),
	uuidv4: jest.fn(() => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	})),
	
	// Validation functions
	isEmail: jest.fn(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
	isNumeric: jest.fn(value => !isNaN(parseFloat(value)) && isFinite(value)),
	
	// Network functions
	fetchData: jest.fn(() => Promise.resolve({})),
	postData: jest.fn(() => Promise.resolve({ success: true })),
	
	// Gaming functions
	calculateScore: jest.fn((base, multiplier) => base * multiplier),
	getLevelFromXp: jest.fn(xp => Math.floor(Math.sqrt(xp / 100)) + 1),
	calculateDamage: jest.fn((attack, defense) => Math.max(1, attack - defense)),
	
	// Default export for any function not explicitly mocked
	__esModule: true,
	default: (name, ...args) => {
		console.warn(`Unmocked function called: ${name}`);
		return null;
	}
}; 