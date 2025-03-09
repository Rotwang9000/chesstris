/**
 * UUID Utility Module
 * 
 * Provides access to the UUID library loaded from CDN.
 * This module bridges the gap between the global UUID object and ES modules.
 */

/**
 * Generate a UUID v4
 * @returns {string} A random UUID
 */
export function v4() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

// Default export for compatibility
export default {
	v4
}; 