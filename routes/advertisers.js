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

// Admin gate for mutating / sensitive endpoints. In production an
// `ADMIN_TOKEN` env var MUST be set, and the caller must supply it via
// either an `x-admin-token` header or an `adminToken` query parameter.
// In development the gate is open so local workflows aren't disturbed.
function requireAdmin(req, res, next) {
	const isProduction = process.env.NODE_ENV === 'production';
	if (!isProduction) return next();

	const expected = process.env.ADMIN_TOKEN;
	if (!expected) {
		return res.status(503).json({
			success: false,
			message: 'Admin endpoints are disabled (ADMIN_TOKEN not configured on this server).',
		});
	}

	const provided = req.get('x-admin-token') || req.query.adminToken;
	if (!provided || provided !== expected) {
		return res.status(401).json({
			success: false,
			message: 'Admin token required.',
		});
	}
	next();
}

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

// Image uploads. Originally these went straight to disk on
// registration — that turned out to be a spam/abuse magnet (anyone
// could POST 5 MB images to /api/advertisers without paying first
// and the bytes would sit in `public/uploads/ads/` forever). We now
// hold the bytes in memory until the advertiser is actually
// activated by an admin, at which point they're written to disk.
// Pending advertisers older than `PENDING_TTL_MS` are GC'd along
// with their cached image bytes so a flood of registrations can't
// OOM the server.
const ADS_DIR = path.join(__dirname, '../public/uploads/ads');
if (!fs.existsSync(ADS_DIR)) {
	fs.mkdirSync(ADS_DIR, { recursive: true });
}
const PENDING_TTL_MS = 60 * 60 * 1000;          // drop pending ads after 1 h
const REGISTRATION_RATE_WINDOW_MS = 10 * 60 * 1000;
const REGISTRATION_RATE_LIMIT = 3;              // 3 registrations per IP per window
const ALLOWED_IMAGE_RE = /jpeg|jpg|png|gif|webp/;

const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 5 * 1024 * 1024,
		files: 1,
	},
	fileFilter: (req, file, cb) => {
		const extOk = ALLOWED_IMAGE_RE.test(path.extname(file.originalname).toLowerCase());
		const mimeOk = ALLOWED_IMAGE_RE.test(file.mimetype);
		if (extOk && mimeOk) cb(null, true);
		else cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'));
	},
});

// In-memory rate limit (IP → [timestamps]) so a single attacker
// can't drown the server in pending registrations.
const _registrationHits = new Map();
function registrationRateLimit(req, res, next) {
	const ip = req.ip || req.connection?.remoteAddress || 'unknown';
	const now = Date.now();
	const hits = (_registrationHits.get(ip) || []).filter(t => now - t < REGISTRATION_RATE_WINDOW_MS);
	if (hits.length >= REGISTRATION_RATE_LIMIT) {
		return res.status(429).json({
			success: false,
			message: 'Too many advertiser registrations from your IP. Please try again later.',
		});
	}
	hits.push(now);
	_registrationHits.set(ip, hits);
	next();
}

// Periodic GC for pending advertisers that never paid. Frees the
// in-memory image buffer too so the heap doesn't grow without
// bound when bots blast the endpoint.
const _pendingGcHandle = setInterval(() => {
	const cutoff = Date.now() - PENDING_TTL_MS;
	let dropped = 0;
	for (const adv of Array.from(advertisers.values())) {
		if (adv.bidStatus !== 'pending') continue;
		const createdAt = new Date(adv.createdAt).getTime();
		if (Number.isFinite(createdAt) && createdAt < cutoff) {
			advertisers.delete(adv.id);
			dropped++;
		}
	}
	if (dropped > 0) {
		console.log(`[Advertisers] GC'd ${dropped} unpaid pending registration(s).`);
		schedulePersist();
	}
}, 5 * 60 * 1000);
if (_pendingGcHandle.unref) _pendingGcHandle.unref();

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
 * Write an uploaded image buffer to disk with a safe filename.
 * @returns {string|null} public URL path or null on failure
 */
function persistAdImageFile(advertiserId, file) {
	if (!file || !file.buffer) return null;
	const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^a-z0-9.]/g, '') || '.png';
	if (!ALLOWED_IMAGE_RE.test(ext.replace('.', ''))) return null;
	const filename = `${advertiserId}${ext}`;
	const filepath = path.join(ADS_DIR, filename);
	fs.writeFileSync(filepath, file.buffer);
	return `/uploads/ads/${filename}`;
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
router.post('/', registrationRateLimit, upload.single('adImage'), async (req, res) => {
	try {
		const { name, email, walletAddress, adText, adLink, bidAmount, cellCount } = req.body;

		if (!name || !email || !walletAddress || !adText || !adLink || !bidAmount || !cellCount) {
			return res.status(400).json({
				success: false,
				message: 'All fields are required',
			});
		}
		if (!req.file) {
			return res.status(400).json({
				success: false,
				message: 'Ad image is required',
			});
		}

		// Image bytes are held in memory ONLY until the advertiser is
		// activated by an admin. They never touch disk for unpaid
		// registrations — this was the previous abuse vector.
		const pendingImage = {
			buffer: req.file.buffer,
			ext: path.extname(req.file.originalname).toLowerCase(),
			mimetype: req.file.mimetype,
			receivedAt: Date.now(),
		};

		const advertiser = {
			id: uuidv4(),
			name: sanitizeText(name),
			email: sanitizeText(email),
			walletAddress: sanitizeText(walletAddress),
			adText: sanitizeText(adText).slice(0, 64),
			adLink: sanitizeText(adLink),
			adImage: null, // populated on activation
			bidAmount: parseFloat(bidAmount),
			cellCount: parseInt(cellCount, 10),
			bidStatus: 'pending',
			impressions: 0,
			clicks: 0,
			cellsSponsored: 0,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		// Stash pending image bytes on a non-enumerable property so it
		// doesn't sneak into JSON persistence or REST responses.
		Object.defineProperty(advertiser, 'pendingImage', {
			value: pendingImage,
			enumerable: false,
			writable: true,
			configurable: true,
		});

		advertisers.set(advertiser.id, advertiser);
		schedulePersist();

		res.status(201).json({
			success: true,
			message: 'Advertiser registered. Your image will be published once payment is confirmed.',
			advertiser: {
				id: advertiser.id,
				name: advertiser.name,
				bidAmount: advertiser.bidAmount,
				cellCount: advertiser.cellCount,
				bidStatus: advertiser.bidStatus,
				walletAddress: advertiser.walletAddress,
			},
		});
	} catch (error) {
		console.error('Error registering advertiser:', error);
		res.status(500).json({
			success: false,
			message: 'Server error',
		});
	}
});

/**
 * @route POST /api/advertisers/:id/activate
 * @desc Activate an advertiser after payment verification
 * @access Public (requires transaction signature)
 */
router.post('/:id/activate', requireAdmin, async (req, res) => {
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

		// Flush the pending image bytes to disk now that the
		// advertiser has actually paid. The buffer was held
		// in-memory on the (non-enumerable) `pendingImage` field; we
		// drop the reference once written so it can be GC'd.
		if (advertiser.pendingImage && advertiser.pendingImage.buffer) {
			try {
				const ext = (advertiser.pendingImage.ext || '.png').replace(/[^a-z0-9.]/g, '');
				const filename = `${advertiser.id}${ext}`;
				const filepath = path.join(ADS_DIR, filename);
				fs.writeFileSync(filepath, advertiser.pendingImage.buffer);
				advertiser.adImage = `/uploads/ads/${filename}`;
			} catch (writeErr) {
				console.error('[Advertisers] Failed to persist activated image:', writeErr.message);
			}
			advertiser.pendingImage = null;
		}

		updateBidRankings();
		schedulePersist();

		res.json({
			success: true,
			message: 'Advertiser activated successfully',
			advertiser: {
				id: advertiser.id,
				name: advertiser.name,
				bidStatus: advertiser.bidStatus,
				adImage: advertiser.adImage,
			},
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
router.get('/', requireAdmin, async (req, res) => {
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
router.put('/:id', requireAdmin, upload.single('adImage'), async (req, res) => {
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
		
		// Update image if provided (memory storage — must write explicitly)
		if (req.file) {
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
			const saved = persistAdImageFile(advertiser.id, req.file);
			if (!saved) {
				return res.status(400).json({
					success: false,
					message: 'Invalid image upload',
				});
			}
			advertiser.adImage = saved;
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
router.get('/:id/stats', requireAdmin, async (req, res) => {
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
router.delete('/:id', requireAdmin, async (req, res) => {
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

/**
 * Public helper consumed by the server-side BoatManager
 * (`server/world/boats.js`). Returns a sanitised advertiser blob
 * suitable for putting on the sail of a Viking longship, or `null`
 * when there are no active advertisers in the bid ranking.
 *
 * The function maintains its own rotation index so it doesn't
 * interfere with the existing `/api/advertisers/next` endpoint
 * (which is used elsewhere for sponsored-cell rotation).
 *
 * @returns {{id: string, name: string, adImage: string|null, adLink: string|null, adText: string|null}|null}
 */
// Shown on any boat sail when no paid advertisers are active so the
// fleet doesn't sail past empty — gives a visible "advertise here"
// call-to-action that links back to the advertiser sign-up flow.
const PLACEHOLDER_SAIL_AD = Object.freeze({
	id: 'sail-placeholder',
	name: 'Your Ad Here',
	adImage: null,
	adLink: '/advertise',
	adText: 'Advertise on a Tetches sail →',
	placeholder: true,
});

let boatRotationIndex = 0;
function pickAdvertiserForBoat() {
	if (bidRanking.length === 0) {
		updateBidRankings();
		if (bidRanking.length === 0) return PLACEHOLDER_SAIL_AD;
	}
	const entry = bidRanking[boatRotationIndex % bidRanking.length];
	boatRotationIndex = (boatRotationIndex + 1) % bidRanking.length;
	if (!entry) return PLACEHOLDER_SAIL_AD;
	const advertiser = advertisers.get(entry.id);
	if (!advertiser) return PLACEHOLDER_SAIL_AD;
	return {
		id: advertiser.id,
		name: advertiser.name || null,
		adImage: advertiser.adImage || null,
		adLink: advertiser.adLink || null,
		adText: advertiser.adText || null,
		placeholder: false,
	};
}

module.exports = router;
module.exports.loadAdvertisersFromDisk = loadAdvertisersFromDisk;
module.exports.flushAdvertisersSync = flushAdvertisersSync;
module.exports.pickAdvertiserForBoat = pickAdvertiserForBoat;
// Test-only: clear the in-process IP→hits map so suites that run
// register multiple times don't trip the rate limit on each other.
module.exports.__resetRegistrationRateLimit = function () {
	_registrationHits.clear();
};



