/**
 * Rate limiting middleware to prevent API abuse
 * Uses a Map to store request counts per IP address
 */

// Store rate limit data in memory
// In a production environment, consider using Redis
const requestCounts = new Map();
const socketRequestCounts = new Map();

// Clear the rate limit data every hour
setInterval(() => {
	requestCounts.clear();
	socketRequestCounts.clear();
}, 1000 * 60 * 60); // 1 hour

/**
 * HTTP rate limiter middleware
 * @param {Object} options - Rate limiter options
 * @param {number} options.maxRequests - Maximum requests per time window (default: 100)
 * @param {number} options.timeWindow - Time window in seconds (default: 60)
 * @returns {function} Express middleware function
 */
function rateLimiter({ maxRequests = 100, timeWindow = 60 } = {}) {
	return (req, res, next) => {
		const ip = req.ip || req.connection.remoteAddress;
		const key = `${ip}-${req.path}`;
		const now = Date.now();
		
		// Get or initialize request data for this IP
		let requestData = requestCounts.get(key) || { 
			count: 0, 
			firstRequest: now,
			blocked: false,
			blockUntil: 0
		};
		
		// Check if IP is blocked
		if (requestData.blocked && now < requestData.blockUntil) {
			return res.status(429).json({
				error: 'Too many requests',
				retryAfter: Math.ceil((requestData.blockUntil - now) / 1000)
			});
		}
		
		// Reset counter if time window has passed
		if (now - requestData.firstRequest > timeWindow * 1000) {
			requestData = { 
				count: 0, 
				firstRequest: now,
				blocked: false,
				blockUntil: 0
			};
		}
		
		// Increment request count
		requestData.count++;
		
		// Check if rate limit exceeded
		if (requestData.count > maxRequests) {
			// Block for twice the time window to penalize abuse
			const blockDuration = timeWindow * 2 * 1000;
			requestData.blocked = true;
			requestData.blockUntil = now + blockDuration;
			
			requestCounts.set(key, requestData);
			
			return res.status(429).json({
				error: 'Too many requests',
				retryAfter: Math.ceil(blockDuration / 1000)
			});
		}
		
		// Store updated request data
		requestCounts.set(key, requestData);
		
		next();
	};
}

/**
 * Socket.io rate limiter
 * @param {Object} socket - Socket.io socket
 * @param {Object} options - Rate limiter options
 * @param {number} options.maxRequests - Maximum requests per time window (default: 50)
 * @param {number} options.timeWindow - Time window in seconds (default: 10)
 * @returns {function} Middleware function that can be used for checking rate limits
 */
function socketRateLimiter(socket, { maxRequests = 50, timeWindow = 10 } = {}) {
	return (event) => {
		const ip = socket.handshake.address;
		const key = `${ip}-${event}`;
		const now = Date.now();
		
		// Get or initialize request data for this IP and event
		let requestData = socketRequestCounts.get(key) || { 
			count: 0, 
			firstRequest: now,
			blocked: false,
			blockUntil: 0
		};
		
		// Check if IP is blocked for this event
		if (requestData.blocked && now < requestData.blockUntil) {
			return false;
		}
		
		// Reset counter if time window has passed
		if (now - requestData.firstRequest > timeWindow * 1000) {
			requestData = { 
				count: 0, 
				firstRequest: now,
				blocked: false,
				blockUntil: 0
			};
		}
		
		// Increment request count
		requestData.count++;
		
		// Check if rate limit exceeded
		if (requestData.count > maxRequests) {
			// Block for twice the time window to penalize abuse
			const blockDuration = timeWindow * 2 * 1000;
			requestData.blocked = true;
			requestData.blockUntil = now + blockDuration;
			
			socketRequestCounts.set(key, requestData);
			
			// Emit rate limit error event to client
			socket.emit('error', {
				type: 'RATE_LIMIT_EXCEEDED',
				message: 'Too many requests',
				retryAfter: Math.ceil(blockDuration / 1000)
			});
			
			return false;
		}
		
		// Store updated request data
		socketRequestCounts.set(key, requestData);
		
		return true;
	};
}

export { rateLimiter, socketRateLimiter }; 