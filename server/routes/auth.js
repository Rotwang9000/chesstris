/**
 * Authentication Routes
 * 
 * API endpoints for user authentication:
 * - Login
 * - Registration
 * - Token validation
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

/**
 * @route POST /api/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post('/register', async (req, res) => {
	try {
		const { username, email, password } = req.body;
		
		// Validate input
		if (!username || !email || !password) {
			return res.status(400).json({ message: 'All fields are required' });
		}
		
		// Check if user exists
		const existingUser = await req.services.user.getUserByEmail(email);
		if (existingUser) {
			return res.status(400).json({ message: 'User already exists' });
		}
		
		// Hash password
		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(password, salt);
		
		// Create user
		const user = await req.services.user.createUser({
			username,
			email,
			password: hashedPassword
		});
		
		// Create token
		const token = jwt.sign(
			{ id: user._id, role: user.role },
			process.env.JWT_SECRET || 'secret',
			{ expiresIn: '7d' }
		);
		
		res.status(201).json({
			token,
			user: {
				id: user._id,
				username: user.username,
				email: user.email,
				role: user.role
			}
		});
	} catch (error) {
		console.error('Error registering user:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route POST /api/auth/login
 * @desc Login user
 * @access Public
 */
router.post('/login', async (req, res) => {
	try {
		const { email, password } = req.body;
		
		// Validate input
		if (!email || !password) {
			return res.status(400).json({ message: 'All fields are required' });
		}
		
		// Check if user exists
		const user = await req.services.user.getUserByEmail(email);
		if (!user) {
			return res.status(400).json({ message: 'Invalid credentials' });
		}
		
		// Check password
		const isMatch = await bcrypt.compare(password, user.password);
		if (!isMatch) {
			return res.status(400).json({ message: 'Invalid credentials' });
		}
		
		// Create token
		const token = jwt.sign(
			{ id: user._id, role: user.role },
			process.env.JWT_SECRET || 'secret',
			{ expiresIn: '7d' }
		);
		
		res.json({
			token,
			user: {
				id: user._id,
				username: user.username,
				email: user.email,
				role: user.role
			}
		});
	} catch (error) {
		console.error('Error logging in user:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route POST /api/auth/guest
 * @desc Create a guest account
 * @access Public
 */
router.post('/guest', async (req, res) => {
	try {
		const guestId = uuidv4();
		const username = `Guest_${guestId.slice(0, 8)}`;
		
		// Create token
		const token = jwt.sign(
			{ id: guestId, role: 'guest' },
			process.env.JWT_SECRET || 'secret',
			{ expiresIn: '1d' }
		);
		
		res.json({
			token,
			user: {
				id: guestId,
				username,
				role: 'guest'
			}
		});
	} catch (error) {
		console.error('Error creating guest account:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route GET /api/auth/verify
 * @desc Verify token and get user data
 * @access Private
 */
router.get('/verify', async (req, res) => {
	try {
		const token = req.header('x-auth-token');
		
		if (!token) {
			return res.status(401).json({ message: 'No token, authorization denied' });
		}
		
		// Verify token
		const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
		
		// Check if guest or registered user
		if (decoded.role === 'guest') {
			return res.json({
				user: {
					id: decoded.id,
					username: `Guest_${decoded.id.slice(0, 8)}`,
					role: 'guest'
				}
			});
		}
		
		// Get user data
		const user = await req.services.user.getUserById(decoded.id);
		if (!user) {
			return res.status(401).json({ message: 'Invalid token' });
		}
		
		res.json({
			user: {
				id: user._id,
				username: user.username,
				email: user.email,
				role: user.role
			}
		});
	} catch (error) {
		console.error('Error verifying token:', error);
		res.status(401).json({ message: 'Invalid token' });
	}
});

export default router; 