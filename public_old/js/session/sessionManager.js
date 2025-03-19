/**
 * Session Manager Module
 * Handles user sessions and authentication
 */

// Session data
const sessionData = {
	userId: null,
	username: 'Guest',
	isAuthenticated: false,
	preferences: {
		theme: 'default',
		soundEnabled: true,
		musicEnabled: true
	}
};

/**
 * Initialize the session
 * @param {Object} options - Session initialization options
 * @returns {Boolean} Success status
 */
export function initSession(options = {}) {
	console.log('Initializing session with options:', options);
	
	// Try to load session from localStorage
	try {
		const savedSession = localStorage.getItem('chesstris_session');
		if (savedSession) {
			const parsedSession = JSON.parse(savedSession);
			Object.assign(sessionData, parsedSession);
			console.log('Loaded session from localStorage');
		}
	} catch (error) {
		console.warn('Failed to load session from localStorage:', error);
	}
	
	// Override with any provided options
	if (options.userId) sessionData.userId = options.userId;
	if (options.username) sessionData.username = options.username;
	if (options.isAuthenticated !== undefined) sessionData.isAuthenticated = options.isAuthenticated;
	if (options.preferences) Object.assign(sessionData.preferences, options.preferences);
	
	return true;
}

/**
 * Get the current session data
 * @returns {Object} The session data
 */
export function getSessionData() {
	return { ...sessionData };
}

/**
 * Update the session data
 * @param {Object} updates - Updates to apply to the session data
 * @returns {Object} The updated session data
 */
export function updateSessionData(updates) {
	Object.assign(sessionData, updates);
	
	// Save to localStorage
	try {
		localStorage.setItem('chesstris_session', JSON.stringify(sessionData));
	} catch (error) {
		console.warn('Failed to save session to localStorage:', error);
	}
	
	return { ...sessionData };
}

/**
 * Clear the session data
 * @returns {Boolean} Success status
 */
export function clearSession() {
	// Reset to defaults
	sessionData.userId = null;
	sessionData.username = 'Guest';
	sessionData.isAuthenticated = false;
	sessionData.preferences = {
		theme: 'default',
		soundEnabled: true,
		musicEnabled: true
	};
	
	// Remove from localStorage
	try {
		localStorage.removeItem('chesstris_session');
	} catch (error) {
		console.warn('Failed to remove session from localStorage:', error);
	}
	
	return true;
}

// Export SessionManager object for compatibility
export const SessionManager = {
	initSession,
	getSessionData,
	updateSessionData,
	clearSession
}; 