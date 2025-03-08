// Username validation and sanitisation utilities

/**
 * Validates and sanitises a username
 * @param {string} username - The username to validate
 * @returns {{ isValid: boolean, sanitised: string | null, error: string | null }}
 */
function validateUsername(username) {
	if (!username || typeof username !== 'string') {
		return {
			isValid: false,
			sanitised: null,
			error: 'Username must be a non-empty string'
		};
	}

	// Remove whitespace from both ends
	const trimmed = username.trim();

	if (trimmed.length < 3) {
		return {
			isValid: false,
			sanitised: null,
			error: 'Username must be at least 3 characters long'
		};
	}

	if (trimmed.length > 20) {
		return {
			isValid: false,
			sanitised: null,
			error: 'Username must be no longer than 20 characters'
		};
	}

	// Only allow alphanumeric characters, underscores, and hyphens
	const sanitised = trimmed.replace(/[^a-zA-Z0-9_-]/g, '');

	if (sanitised !== trimmed) {
		return {
			isValid: false,
			sanitised: null,
			error: 'Username can only contain letters, numbers, underscores, and hyphens'
		};
	}

	return {
		isValid: true,
		sanitised: sanitised,
		error: null
	};
}

module.exports = {
	validateUsername
}; 