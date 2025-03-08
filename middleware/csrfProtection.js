/**
 * CSRF Protection Middleware
 * Implements Double Submit Cookie Pattern
 */

// Store of valid csrf tokens
const csrfTokens = new Map();

// Clear expired tokens every hour
setInterval(() => {
	const now = Date.now();
	
	// Remove tokens older than 2 hours
	csrfTokens.forEach((data, token) => {
		if (now - data.created > 1000 * 60 * 60 * 2) {
			csrfTokens.delete(token);
		}
	});
}, 1000 * 60 * 60); // 1 hour

/**
 * Generates a random token
 * @returns {string} Random token
 */
function generateToken() {
	return Math.random().toString(36).substring(2, 15) + 
		Math.random().toString(36).substring(2, 15);
}

/**
 * Middleware that creates a CSRF token and sets it as a cookie
 * Should be used on GET requests that render forms
 */
function setCsrfToken(req, res, next) {
	// Generate a new token
	const token = generateToken();
	
	// Store token for validation
	csrfTokens.set(token, {
		created: Date.now(),
		used: false
	});
	
	// Set as a cookie - in production use secure and httpOnly
	res.cookie('XSRF-TOKEN', token, {
		sameSite: 'strict',
		path: '/',
		maxAge: 7200000 // 2 hours
	});
	
	// Also attach to response locals for templates to use
	res.locals.csrfToken = token;
	
	next();
}

/**
 * Middleware that validates CSRF token
 * Should be used on all state-changing requests (POST, PUT, DELETE, etc.)
 */
function validateCsrfToken(req, res, next) {
	// Skip validation for GET, HEAD, OPTIONS requests
	const safeMethod = /^(GET|HEAD|OPTIONS)$/i.test(req.method);
	if (safeMethod) {
		return next();
	}
	
	// Get token from request
	const cookieToken = req.cookies['XSRF-TOKEN'];
	const headerToken = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];
	const bodyToken = req.body._csrf;
	
	// Use the token from any available source (in order of preference)
	const token = headerToken || bodyToken || cookieToken;
	
	// Validate token
	if (!token || !csrfTokens.has(token)) {
		return res.status(403).json({
			error: 'CSRF token validation failed'
		});
	}
	
	// Mark token as used
	const tokenData = csrfTokens.get(token);
	tokenData.used = true;
	csrfTokens.set(token, tokenData);
	
	// Generate a new token for the next request
	const newToken = generateToken();
	csrfTokens.set(newToken, {
		created: Date.now(),
		used: false
	});
	
	res.cookie('XSRF-TOKEN', newToken, {
		sameSite: 'strict',
		path: '/',
		maxAge: 7200000 // 2 hours
	});
	
	next();
}

/**
 * Express middleware function that combines setting and validating CSRF tokens
 */
function csrfProtection(req, res, next) {
	// First set a token if needed
	if (!req.cookies['XSRF-TOKEN']) {
		setCsrfToken(req, res, () => {
			// Then validate for non-GET requests
			validateCsrfToken(req, res, next);
		});
	} else {
		// Just validate
		validateCsrfToken(req, res, next);
	}
}

export { csrfProtection, setCsrfToken, validateCsrfToken }; 