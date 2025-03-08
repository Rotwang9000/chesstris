/**
 * Admin Authentication Middleware
 * 
 * Middleware for verifying JWT tokens and authenticating admin users.
 */

import jwt from 'jsonwebtoken';

/**
 * Middleware to authenticate admin users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const adminAuth = (req, res, next) => {
	// Get token from header
	const token = req.header('x-auth-token');
	
	// Check if no token
	if (!token) {
		return res.status(401).json({ message: 'No token, authorization denied' });
	}
	
	try {
		// Verify token
		const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
		
		// Check if user is admin
		if (decoded.role !== 'admin') {
			return res.status(403).json({ message: 'Access denied, admin privileges required' });
		}
		
		// Add user to request
		req.user = decoded;
		next();
	} catch (error) {
		res.status(401).json({ message: 'Token is not valid' });
	}
};

export default adminAuth; 