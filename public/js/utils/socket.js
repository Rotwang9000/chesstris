/**
 * Socket.io Utility Module
 * 
 * Provides access to the Socket.io client loaded from CDN.
 * This module bridges the gap between the global io object and ES modules.
 */

// Import mock socket for test environment
import mockIo from '../../../tests/mockSocket.js';

// Determine if we're in a test environment
const isTestEnvironment = process.env.NODE_ENV === 'test';

let socketIo;

// Use the mock in test environment, otherwise use global io
if (isTestEnvironment) {
	console.log('Using mock Socket.io in test environment');
	socketIo = mockIo;
} else {
	// Make sure io is available globally
	if (typeof io === 'undefined') {
		console.error('Socket.io client not loaded. Make sure the CDN script is included in the HTML.');
		// Provide a fallback that throws errors when used
		socketIo = () => {
			throw new Error('Socket.io client not available');
		};
	} else {
		socketIo = io;
	}
}

// Export the io object as default
export default socketIo; 