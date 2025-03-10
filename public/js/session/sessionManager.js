/**
 * Session Manager Module
 * Manages user sessions
 */

// Session storage key
const SESSION_STORAGE_KEY = 'chesstris_session';

// Default session data
const DEFAULT_SESSION = {
	playerId: null,
	username: null,
	walletConnected: false,
	walletAddress: null,
	lastSaved: Date.now()
};

/**
 * Session Manager class
 * Manages user sessions
 */
class SessionManagerClass {
	/**
	 * Initialize or load an existing session
	 * @param {Object} sessionData - Initial session data (optional)
	 * @returns {Object} The session data
	 */
	static initSession(sessionData = null) {
		try {
			// Try to load existing session
			const existingSession = localStorage.getItem(SESSION_STORAGE_KEY);
			
			if (existingSession) {
				const parsedSession = JSON.parse(existingSession);
				console.log(`Loaded existing session: ${parsedSession.playerId}`);
				return parsedSession;
			}
			
			// Create new session if none exists
			const newSession = {
				...DEFAULT_SESSION,
				...sessionData,
				playerId: sessionData?.playerId || `player-${Math.random().toString(16).substring(2)}`,
				username: sessionData?.username || `Player ${Math.floor(Math.random() * 1000)}`,
				lastSaved: Date.now()
			};
			
			// Save to localStorage
			localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
			console.log(`Created new session: ${newSession.playerId}`);
			
			return newSession;
		} catch (error) {
			console.error('Error initializing session:', error);
			return DEFAULT_SESSION;
		}
	}
	
	/**
	 * Get session data
	 * @returns {Object} The session data
	 */
	static getSessionData() {
		try {
			// Try to load existing session
			const existingSession = localStorage.getItem(SESSION_STORAGE_KEY);
			
			if (existingSession) {
				return JSON.parse(existingSession);
			}
			
			// Initialize if no session exists
			return SessionManagerClass.initSession();
		} catch (error) {
			console.error('Error getting session data:', error);
			return DEFAULT_SESSION;
		}
	}
	
	/**
	 * Update session data
	 * @param {Object} newData - New session data to merge
	 * @returns {Object} The updated session data
	 */
	static updateSessionData(newData) {
		try {
			// Get current session data
			const currentSession = SessionManagerClass.getSessionData();
			
			// Merge new data
			const updatedSession = {
				...currentSession,
				...newData,
				lastSaved: Date.now()
			};
			
			// Save to localStorage
			localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedSession));
			
			return updatedSession;
		} catch (error) {
			console.error('Error updating session data:', error);
			return SessionManagerClass.getSessionData();
		}
	}
	
	/**
	 * Clear session data
	 * @returns {boolean} Whether the session was cleared successfully
	 */
	static clearSession() {
		try {
			localStorage.removeItem(SESSION_STORAGE_KEY);
			return true;
		} catch (error) {
			console.error('Error clearing session:', error);
			return false;
		}
	}
}

// Export the SessionManager
export const SessionManager = SessionManagerClass;

// Default export
export default SessionManager; 