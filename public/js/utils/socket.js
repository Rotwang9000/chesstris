/**
 * Socket.io Utility Module
 * 
 * Provides access to the Socket.io client loaded from CDN.
 * This module bridges the gap between the global io object and ES modules.
 */

// Make sure io is available globally
if (typeof io === 'undefined') {
	console.error('Socket.io client not loaded. Make sure the CDN script is included in the HTML.');
}

// Export the global io object as default
export default io; 