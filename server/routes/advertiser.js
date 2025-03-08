/**
 * Advertiser Routes
 * 
 * API endpoints for advertiser management:
 * - Registration
 * - Bid management
 * - Statistics
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import auth from '../middleware/auth.js';
import adminAuth from '../middleware/adminAuth.js';
import { fileURLToPath } from 'url';

// Set up __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Set up multer for image uploads
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		const uploadDir = path.join(__dirname, '../../public/uploads/ads');
		
		// Create directory if it doesn't exist
		if (!fs.existsSync(uploadDir)) {
			fs.mkdirSync(uploadDir, { recursive: true });
		}
		
		cb(null, uploadDir);
	},
	filename: (req, file, cb) => {
		const fileExt = path.extname(file.originalname);
		const fileName = `${uuidv4()}${fileExt}`;
		cb(null, fileName);
	}
});

const upload = multer({
	storage,
	limits: {
		fileSize: 5 * 1024 * 1024 // 5MB limit
	},
	fileFilter: (req, file, cb) => {
		// Accept only image files
		const allowedTypes = /jpeg|jpg|png|gif|webp/;
		const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
		const mimetype = allowedTypes.test(file.mimetype);
		
		if (extname && mimetype) {
			return cb(null, true);
		} else {
			cb(new Error('Only image files are allowed'));
		}
	}
});

/**
 * @route POST /api/advertisers
 * @desc Register a new advertiser
 * @access Public
 */
router.post('/', upload.single('adImage'), async (req, res) => {
	try {
		const { name, email, walletAddress, adText, adLink, bidAmount, cellCount } = req.body;
		
		// Validate required fields
		if (!name || !email || !walletAddress || !adText || !adLink || !bidAmount || !cellCount) {
			return res.status(400).json({ message: 'All fields are required' });
		}
		
		// Validate image upload
		if (!req.file) {
			return res.status(400).json({ message: 'Ad image is required' });
		}
		
		// Create advertiser data
		const advertiserData = {
			name,
			email,
			walletAddress,
			adText,
			adLink,
			adImage: `/uploads/ads/${req.file.filename}`,
			bidAmount: parseFloat(bidAmount),
			cellCount: parseInt(cellCount)
		};
		
		// Register advertiser
		const advertiser = await req.services.advertiserService.registerAdvertiser(advertiserData);
		
		res.status(201).json({
			message: 'Advertiser registered successfully',
			advertiser: {
				id: advertiser._id,
				name: advertiser.name,
				bidAmount: advertiser.bidAmount,
				cellCount: advertiser.cellCount
			}
		});
	} catch (error) {
		console.error('Error registering advertiser:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route GET /api/advertisers
 * @desc Get all advertisers
 * @access Admin
 */
router.get('/', adminAuth, async (req, res) => {
	try {
		const advertisers = await req.services.advertiserService.getActiveAdvertisers();
		res.json(advertisers);
	} catch (error) {
		console.error('Error getting advertisers:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route GET /api/advertisers/:id
 * @desc Get advertiser by ID
 * @access Admin or Advertiser
 */
router.get('/:id', auth, async (req, res) => {
	try {
		const advertiser = await req.services.advertiserService.getAdvertiser(req.params.id);
		
		// Check if user is admin or the advertiser
		if (req.user.role !== 'admin' && req.user.id !== advertiser.walletAddress) {
			return res.status(403).json({ message: 'Not authorized' });
		}
		
		res.json(advertiser);
	} catch (error) {
		console.error('Error getting advertiser:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route GET /api/advertisers/next
 * @desc Get the next advertiser in rotation
 * @access Public
 */
router.get('/next', async (req, res) => {
	try {
		const advertiser = await req.services.advertiserService.getNextAdvertiser();
		
		if (!advertiser) {
			return res.status(404).json({ message: 'No active advertisers found' });
		}
		
		res.json(advertiser);
	} catch (error) {
		console.error('Error getting next advertiser:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route POST /api/advertisers/:id/impression
 * @desc Record an impression for an advertiser
 * @access Public
 */
router.post('/:id/impression', async (req, res) => {
	try {
		await req.services.advertiserService.recordImpression(req.params.id);
		res.status(204).end();
	} catch (error) {
		console.error('Error recording impression:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route POST /api/advertisers/:id/click
 * @desc Record a click for an advertiser
 * @access Public
 */
router.post('/:id/click', async (req, res) => {
	try {
		await req.services.advertiserService.recordClick(req.params.id);
		res.status(204).end();
	} catch (error) {
		console.error('Error recording click:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route PUT /api/advertisers/:id
 * @desc Update advertiser
 * @access Admin or Advertiser
 */
router.put('/:id', auth, upload.single('adImage'), async (req, res) => {
	try {
		const advertiser = await req.services.advertiserService.getAdvertiser(req.params.id);
		
		// Check if user is admin or the advertiser
		if (req.user.role !== 'admin' && req.user.id !== advertiser.walletAddress) {
			return res.status(403).json({ message: 'Not authorized' });
		}
		
		// Prepare update data
		const updateData = {};
		
		// Update fields if provided
		if (req.body.name) updateData.name = req.body.name;
		if (req.body.email) updateData.email = req.body.email;
		if (req.body.adText) updateData.adText = req.body.adText;
		if (req.body.adLink) updateData.adLink = req.body.adLink;
		if (req.body.bidAmount) updateData.bidAmount = parseFloat(req.body.bidAmount);
		if (req.body.cellCount) updateData.cellCount = parseInt(req.body.cellCount);
		if (req.body.bidStatus) updateData.bidStatus = req.body.bidStatus;
		
		// Update image if provided
		if (req.file) {
			// Delete old image if it exists
			if (advertiser.adImage) {
				const oldImagePath = path.join(__dirname, '../../public', advertiser.adImage);
				if (fs.existsSync(oldImagePath)) {
					fs.unlinkSync(oldImagePath);
				}
			}
			
			updateData.adImage = `/uploads/ads/${req.file.filename}`;
		}
		
		// Update advertiser
		const updatedAdvertiser = await req.services.advertiserService.updateAdvertiser(
			req.params.id,
			updateData
		);
		
		res.json({
			message: 'Advertiser updated successfully',
			advertiser: updatedAdvertiser
		});
	} catch (error) {
		console.error('Error updating advertiser:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route GET /api/advertisers/:id/stats
 * @desc Get advertiser statistics
 * @access Admin or Advertiser
 */
router.get('/:id/stats', auth, async (req, res) => {
	try {
		const advertiser = await req.services.advertiserService.getAdvertiser(req.params.id);
		
		// Check if user is admin or the advertiser
		if (req.user.role !== 'admin' && req.user.id !== advertiser.walletAddress) {
			return res.status(403).json({ message: 'Not authorized' });
		}
		
		const stats = await req.services.advertiserService.getAdvertiserStats(req.params.id);
		res.json(stats);
	} catch (error) {
		console.error('Error getting advertiser stats:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

export default router; 