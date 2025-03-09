/**
 * UUID Utility Module
 * 
 * Provides access to the UUID library loaded from CDN.
 * This module bridges the gap between the global UUID object and ES modules.
 */

// Export the v4 function from the global UUID object
export const v4 = function() {
	// Make sure UUID is available globally
	if (typeof uuid === 'undefined') {
		console.error('UUID library not loaded. Make sure the CDN script is included in the HTML.');
		// Return a simple fallback implementation if UUID is not available
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
			const r = Math.random() * 16 | 0;
			const v = c === 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}
	
	// Use the global UUID.v4 function
	return uuid.v4();
};

// Default export for compatibility
export default {
	v4
}; 