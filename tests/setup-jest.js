/**
 * Jest setup file to provide global objects and polyfills needed for tests
 */

// Import required modules
import { TextEncoder, TextDecoder } from 'util';
import nodeFetch from 'node-fetch';
import { jest } from '@jest/globals';

// Provide TextEncoder and TextDecoder globals
if (typeof global.TextEncoder === 'undefined') {
	global.TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
	global.TextDecoder = TextDecoder;
}

// Provide fetch polyfill if needed
if (typeof global.fetch === 'undefined') {
	global.fetch = nodeFetch;
}

// Mock window object for browser-specific code
if (typeof global.window === 'undefined') {
	global.window = {
		addEventListener: jest.fn(),
		removeEventListener: jest.fn(),
		dispatchEvent: jest.fn(),
		localStorage: {
			getItem: jest.fn(),
			setItem: jest.fn(),
			removeItem: jest.fn(),
			clear: jest.fn()
		},
		sessionStorage: {
			getItem: jest.fn(),
			setItem: jest.fn(),
			removeItem: jest.fn(),
			clear: jest.fn()
		},
		location: {
			href: 'http://localhost:3020/',
			pathname: '/',
			search: '',
			hash: ''
		},
		document: {
			getElementById: jest.fn(),
			querySelector: jest.fn(),
			querySelectorAll: jest.fn(),
			createElement: jest.fn(),
			body: {
				appendChild: jest.fn()
			}
		}
	};
}

// Mock document object if needed
if (typeof global.document === 'undefined') {
	global.document = global.window.document;
}

// Mock navigator object
if (typeof global.navigator === 'undefined') {
	global.navigator = {
		userAgent: 'node.js',
		language: 'en-GB'
	};
}

// Mock performance object
if (typeof global.performance === 'undefined') {
	global.performance = {
		now: jest.fn(() => Date.now())
	};
}

// Mock requestAnimationFrame
if (typeof global.requestAnimationFrame === 'undefined') {
	global.requestAnimationFrame = callback => setTimeout(callback, 0);
}

// Mock cancelAnimationFrame
if (typeof global.cancelAnimationFrame === 'undefined') {
	global.cancelAnimationFrame = jest.fn();
}

console.log('Jest setup complete - global objects and polyfills loaded'); 