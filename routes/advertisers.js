/**
 * Advertiser Routes (CommonJS version)
 * 
 * API endpoints for advertiser management:
 * - Registration
 * - Bid management
 * - Statistics
 * - Ad rotation
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sanitizeHtml = require('sanitize-html');

const router = express.Router();

// Persistent storage for advertisers. We keep an in-memory `Map` for fast
// access plus a flat JSON file on disk so that ads survive server restarts.
// (A heavier backend like Redis/Postgres can later wrap these helpers.)
const ADVERTISERS_FILE = path.join(__dirname, '../advertisers.json');
const advertisers = new Map();
const bidRanking = [];
let rotationIndex = 0;
let persistTimer = null;

function loadAdvertisersFromDisk() {
	try {
		if (!fs.existsSync(ADVERTISERS_FILE)) return;
		const raw = fs.readFileSync(ADVERTISERS_FILE, 'utf8');
		const parsed = JSON.parse(raw);
		if (!parsed || !Array.isArray(parsed.advertisers)) return;
		for (const adv of parsed.advertisers) {
			if (adv && adv.id) advertisers.set(adv.id, adv);
		}
		updateBidRankings();
		console.log(`[Advertisers] Restored ${advertisers.size} advertiser(s) from disk.`);
	} catch (err) {
		console.warn('[Advertisers] Failed to load persisted advertisers:', err.message);
	}
}

function writeAdvertisersSync() {
	try {
		const payload = JSON.stringify({
			version: 1,
			savedAt: new Date().toISOString(),
			advertisers: Array.from(advertisers.values()),
		}, null, '\t');
		fs.writeFileSync(ADVERTISERS_FILE, payload, 'utf8');
	} catch (err) {
		console.warn('[Advertisers] Failed to persist advertisers:', err.message);
	}
}

function schedulePersist() {
	if (persistTimer) return;
	persistTimer = setTimeout(() => {
		persistTimer = null;
		writeAdvertisersSync();
	}, 250);
	if (persistTimer.unref) persistTimer.unref();
}

function flushAdvertisersSync() {
	if (persistTimer) {
		clearTimeout(persistTimer);
		persistTimer = null;
	}
	writeAdvertisersSync();
}

// Set up multer for image uploads
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		const uploadDir = path.join(__dirname, '../public/uploads/ads');
		
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
 * Sanitize text to prevent XSS
 */
function sanitizeText(text) {
	return sanitizeHtml(text, {
		allowedTags: [],
		allowedAttributes: {}
	});
}

/**
 * Update bid rankings based on cost per cell
 */
function updateBidRankings() {
	// Get all active advertisers
	const activeAdvertisers = Array.from(advertisers.values())
		.filter(adv => adv.bidStatus === 'active');
	
	// Sort by cost per cell (bid amount / cell count) in descending order
	activeAdvertisers.sort((a, b) => {
		const aCostPerCell = a.bidAmount / a.cellCount;
		const bCostPerCell = b.bidAmount / b.cellCount;
		return bCostPerCell - aCostPerCell;
	});
	
	// Update ranking array
	bidRanking.length = 0;
	activeAdvertisers.forEach(advertiser => {
		bidRanking.push({
			id: advertiser.id,
			name: advertiser.name,
			costPerCell: advertiser.bidAmount / advertiser.cellCount,
			remainingCells: advertiser.cellCount - advertiser.cellsSponsored
		});
	});
	
	// Reset rotation index if needed
	if (rotationIndex >= bidRanking.length) {
		rotationIndex = 0;
	}
}

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
			return res.status(400).json({ 
				success: false,
				message: 'All fields are required' 
			});
		}
		
		// Validate image upload
		if (!req.file) {
			return res.status(400).json({ 
				success: false,
				message: 'Ad image is required' 
			});
		}
		
		// Create advertiser
		const advertiser = {
			id: uuidv4(),
			name: sanitizeText(name),
			email: sanitizeText(email),
			walletAddress: sanitizeText(walletAddress),
			adText: sanitizeText(adText),
			adLink: sanitizeText(adLink),
			adImage: `/uploads/ads/${req.file.filename}`,
			bidAmount: parseFloat(bidAmount),
			cellCount: parseInt(cellCount),
			bidStatus: 'pending', // Start as pending until payment confirmed
			impressions: 0,
			clicks: 0,
			cellsSponsored: 0,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};
		
		advertisers.set(advertiser.id, advertiser);
		schedulePersist();

		res.status(201).json({
			success: true,
			message: 'Advertiser registered successfully. Activate by sending payment.',
			advertiser: {
				id: advertiser.id,
				name: advertiser.name,
				bidAmount: advertiser.bidAmount,
				cellCount: advertiser.cellCount,
				bidStatus: advertiser.bidStatus,
				walletAddress: advertiser.walletAddress
			}
		});
	} catch (error) {
		console.error('Error registering advertiser:', error);
		res.status(500).json({ 
			success: false,
			message: 'Server error' 
		});
	}
});

/**
 * @route POST /api/advertisers/:id/activate
 * @desc Activate an advertiser after payment verification
 * @access Public (requires transaction signature)
 */
router.post('/:id/activate', async (req, res) => {
	try {
		const { id } = req.params;
		const { transactionSignature } = req.body;
		
		const advertiser = advertisers.get(id);
		
		if (!advertiser) {
			return res.status(404).json({ 
				success: false,
				message: 'Advertiser not found' 
			});
		}
		
		if (advertiser.bidStatus === 'active') {
			return res.status(400).json({ 
				success: false,
				message: 'Advertiser is already active' 
			});
		}
		
		// TODO: Verify transaction on Solana blockchain
		// For now, we'll accept any transaction signature as valid
		// In production, this should verify the transaction amount and recipient
		if (!transactionSignature) {
			return res.status(400).json({ 
				success: false,
				message: 'Transaction signature is required' 
			});
		}
		
		advertiser.bidStatus = 'active';
		advertiser.transactionSignature = transactionSignature;
		advertiser.activatedAt = new Date().toISOString();
		advertiser.updatedAt = new Date().toISOString();

		updateBidRankings();
		schedulePersist();
		
		res.json({
			success: true,
			message: 'Advertiser activated successfully',
			advertiser: {
				id: advertiser.id,
				name: advertiser.name,
				bidStatus: advertiser.bidStatus
			}
		});
	} catch (error) {
		console.error('Error activating advertiser:', error);
		res.status(500).json({ 
			success: false,
			message: 'Server error' 
		});
	}
});

/**
 * @route GET /api/advertisers
 * @desc Get all advertisers
 * @access Public (should be admin-only in production)
 */
router.get('/', async (req, res) => {
	try {
		const allAdvertisers = Array.from(advertisers.values()).map(adv => ({
			id: adv.id,
			name: adv.name,
			bidAmount: adv.bidAmount,
			cellCount: adv.cellCount,
			bidStatus: adv.bidStatus,
			impressions: adv.impressions,
			clicks: adv.clicks,
			cellsSponsored: adv.cellsSponsored,
			createdAt: adv.createdAt
		}));
		
		res.json({
			success: true,
			advertisers: allAdvertisers
		});
	} catch (error) {
		console.error('Error getting advertisers:', error);
		res.status(500).json({ 
			success: false,
			message: 'Server error' 
		});
	}
});

/**
 * @route GET /api/advertisers/next
 * @desc Get the next advertiser in rotation for sponsoring
 * @access Public
 */
router.get('/next', async (req, res) => {
	try {
		// Update rankings if empty
		if (bidRanking.length === 0) {
			updateBidRankings();
		}
		
		if (bidRanking.length === 0) {
			return res.status(404).json({ 
				success: false,
				message: 'No active advertisers found' 
			});
		}
		
		// Find next advertiser with remaining cells
		let advertiserFound = false;
		const startIndex = rotationIndex;
		
		do {
			// Check if current advertiser has remaining cells
			if (bidRanking[rotationIndex] && bidRanking[rotationIndex].remainingCells > 0) {
				advertiserFound = true;
				break;
			}
			
			// Move to next advertiser
			rotationIndex = (rotationIndex + 1) % bidRanking.length;
		} while (rotationIndex !== startIndex);
		
		if (!advertiserFound) {
			return res.status(404).json({ 
				success: false,
				message: 'No advertisers with remaining cells' 
			});
		}
		
		// Get full advertiser data
		const advertiserId = bidRanking[rotationIndex].id;
		const advertiser = advertisers.get(advertiserId);
		
		// Update rotation index for next time
		rotationIndex = (rotationIndex + 1) % bidRanking.length;
		
		res.json({
			success: true,
			_id: advertiser.id,
			id: advertiser.id,
			name: advertiser.name,
			adImage: advertiser.adImage,
			adLink: advertiser.adLink,
			adText: advertiser.adText,
			bidAmount: advertiser.bidAmount
		});
	} catch (error) {
		console.error('Error getting next advertiser:', error);
		res.status(500).json({ 
			success: false,
			message: 'Server error' 
		});
	}
});

/**
 * @route GET /api/advertisers/:id
 * @desc Get advertiser by ID
 * @access Public
 */
router.get('/:id', async (req, res) => {
	try {
		const advertiser = advertisers.get(req.params.id);
		
		if (!advertiser) {
			return res.status(404).json({ 
				success: false,
				message: 'Advertiser not found' 
			});
		}
		
		res.json({
			success: true,
			advertiser
		});
	} catch (error) {
		console.error('Error getting advertiser:', error);
		res.status(500).json({ 
			success: false,
			message: 'Server error' 
		});
	}
});

/**
 * @route POST /api/advertisers/:id/impression
 * @desc Record an impression for an advertiser
 * @access Public
 */
router.post('/:id/impression', async (req, res) => {
	try {
		const advertiser = advertisers.get(req.params.id);
		
		if (!advertiser) {
			return res.status(404).json({ 
				success: false,
				message: 'Advertiser not found' 
			});
		}
		
		advertiser.impressions += 1;
		advertiser.cellsSponsored += 1;
		advertiser.updatedAt = new Date().toISOString();

		if (advertiser.cellsSponsored >= advertiser.cellCount) {
			advertiser.bidStatus = 'expired';
			updateBidRankings();
		}
		schedulePersist();

		res.status(204).end();
	} catch (error) {
		console.error('Error recording impression:', error);
		res.status(500).json({ 
			success: false,
			message: 'Server error' 
		});
	}
});

/**
 * @route POST /api/advertisers/:id/click
 * @desc Record a click for an advertiser
 * @access Public
 */
router.post('/:id/click', async (req, res) => {
	try {
		const advertiser = advertisers.get(req.params.id);
		
		if (!advertiser) {
			return res.status(404).json({ 
				success: false,
				message: 'Advertiser not found' 
			});
		}
		
		advertiser.clicks += 1;
		advertiser.updatedAt = new Date().toISOString();
		schedulePersist();

		res.status(204).end();
	} catch (error) {
		console.error('Error recording click:', error);
		res.status(500).json({ 
			success: false,
			message: 'Server error' 
		});
	}
});

/**
 * @route PUT /api/advertisers/:id
 * @desc Update advertiser
 * @access Public (should be authenticated in production)
 */
router.put('/:id', upload.single('adImage'), async (req, res) => {
	try {
		const advertiser = advertisers.get(req.params.id);
		
		if (!advertiser) {
			return res.status(404).json({ 
				success: false,
				message: 'Advertiser not found' 
			});
		}
		
		// Update fields if provided
		if (req.body.name) advertiser.name = sanitizeText(req.body.name);
		if (req.body.email) advertiser.email = sanitizeText(req.body.email);
		if (req.body.adText) advertiser.adText = sanitizeText(req.body.adText);
		if (req.body.adLink) advertiser.adLink = sanitizeText(req.body.adLink);
		if (req.body.bidAmount) advertiser.bidAmount = parseFloat(req.body.bidAmount);
		if (req.body.cellCount) advertiser.cellCount = parseInt(req.body.cellCount);
		if (req.body.bidStatus) advertiser.bidStatus = req.body.bidStatus;
		
		// Update image if provided
		if (req.file) {
			// Delete old image if it exists
			if (advertiser.adImage) {
				const oldImagePath = path.join(__dirname, '../public', advertiser.adImage);
				if (fs.existsSync(oldImagePath)) {
					try {
						fs.unlinkSync(oldImagePath);
					} catch (err) {
						console.warn('Could not delete old image:', err);
					}
				}
			}
			
			advertiser.adImage = `/uploads/ads/${req.file.filename}`;
		}
		
		advertiser.updatedAt = new Date().toISOString();

		updateBidRankings();
		schedulePersist();

		res.json({
			success: true,
			message: 'Advertiser updated successfully',
			advertiser: {
				id: advertiser.id,
				name: advertiser.name,
				bidStatus: advertiser.bidStatus
			}
		});
	} catch (error) {
		console.error('Error updating advertiser:', error);
		res.status(500).json({ 
			success: false,
			message: 'Server error' 
		});
	}
});

/**
 * @route GET /api/advertisers/:id/stats
 * @desc Get advertiser statistics
 * @access Public
 */
router.get('/:id/stats', async (req, res) => {
	try {
		const advertiser = advertisers.get(req.params.id);
		
		if (!advertiser) {
			return res.status(404).json({ 
				success: false,
				message: 'Advertiser not found' 
			});
		}
		
		const stats = {
			impressions: advertiser.impressions,
			clicks: advertiser.clicks,
			cellsSponsored: advertiser.cellsSponsored,
			clickThroughRate: advertiser.impressions > 0 
				? ((advertiser.clicks / advertiser.impressions) * 100).toFixed(2) + '%'
				: '0%',
			remainingCells: advertiser.cellCount - advertiser.cellsSponsored,
			costPerCell: (advertiser.bidAmount / advertiser.cellCount).toFixed(4),
			bidStatus: advertiser.bidStatus
		};
		
		res.json({
			success: true,
			stats
		});
	} catch (error) {
		console.error('Error getting advertiser stats:', error);
		res.status(500).json({ 
			success: false,
			message: 'Server error' 
		});
	}
});

/**
 * @route DELETE /api/advertisers/:id
 * @desc Delete an advertiser
 * @access Public (should be admin-only in production)
 */
router.delete('/:id', async (req, res) => {
	try {
		const advertiser = advertisers.get(req.params.id);
		
		if (!advertiser) {
			return res.status(404).json({ 
				success: false,
				message: 'Advertiser not found' 
			});
		}
		
		// Delete ad image if it exists
		if (advertiser.adImage) {
			const imagePath = path.join(__dirname, '../public', advertiser.adImage);
			if (fs.existsSync(imagePath)) {
				try {
					fs.unlinkSync(imagePath);
				} catch (err) {
					console.warn('Could not delete image:', err);
				}
			}
		}
		
		advertisers.delete(req.params.id);
		updateBidRankings();
		schedulePersist();

		res.json({
			success: true,
			message: 'Advertiser deleted successfully'
		});
	} catch (error) {
		console.error('Error deleting advertiser:', error);
		res.status(500).json({ 
			success: false,
			message: 'Server error' 
		});
	}
});

/**
 * @route GET /api/advertisers/ranking/current
 * @desc Get current bid ranking
 * @access Public
 */
router.get('/ranking/current', async (req, res) => {
	try {
		updateBidRankings();
		
		res.json({
			success: true,
			ranking: bidRanking,
			totalActive: bidRanking.length
		});
	} catch (error) {
		console.error('Error getting ranking:', error);
		res.status(500).json({ 
			success: false,
			message: 'Server error' 
		});
	}
});

loadAdvertisersFromDisk();

module.exports = router;
module.exports.loadAdvertisersFromDisk = loadAdvertisersFromDisk;
module.exports.flushAdvertisersSync = flushAdvertisersSync;



