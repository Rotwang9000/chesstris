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
const { requireWalletSession } = require('./walletAuth');

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

// Anti-repetition memory: the last advertiser id we handed out via
// `/next`. We avoid serving the same advertiser back-to-back whenever
// there's at least one other eligible advertiser. The user reported
// "there are far too many ads.. don't repeat the same one often at
// all".
let lastServedAdvertiserId = null;

// Only ~1 in `AD_SHOW_RATE_INVERSE` placements actually returns a
// sponsor — the rest get a "no ad" answer so the game world isn't
// covered in advert decals. With one or two registered advertisers
// the old "every placement is sponsored" behaviour felt like spam.
const AD_SHOW_RATE_INVERSE = 3;

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
const ADS_PENDING_DIR = path.join(__dirname, '../advertiser-pending-images');
if (!fs.existsSync(ADS_DIR)) {
	fs.mkdirSync(ADS_DIR, { recursive: true });
}
// `pending` is private — outside `public/` so unapproved images
// cannot be hot-linked. Admin preview reads them via the gated
// `/admin/preview-image` endpoint instead.
if (!fs.existsSync(ADS_PENDING_DIR)) {
	fs.mkdirSync(ADS_PENDING_DIR, { recursive: true });
}

function pendingImagePathFor(advertiserId, ext) {
	const safeExt = (ext || '.png').replace(/[^a-z0-9.]/gi, '').toLowerCase() || '.png';
	return path.join(ADS_PENDING_DIR, `${advertiserId}${safeExt}`);
}

function findPendingImageOnDisk(advertiserId) {
	for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.webp']) {
		const p = pendingImagePathFor(advertiserId, ext);
		if (fs.existsSync(p)) return { path: p, ext };
	}
	return null;
}

function writePendingImageToDisk(advertiserId, file) {
	if (!file || !file.buffer) return null;
	// Sweep any stale on-disk pending image with a different
	// extension first so we never accumulate orphans for the same
	// advertiser id.
	const stale = findPendingImageOnDisk(advertiserId);
	if (stale) {
		try { fs.unlinkSync(stale.path); } catch (_e) { /* ignore */ }
	}
	const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
	const target = pendingImagePathFor(advertiserId, ext);
	fs.writeFileSync(target, file.buffer);
	return { path: target, ext };
}

function loadPendingImageBufferFromDisk(advertiserId) {
	const found = findPendingImageOnDisk(advertiserId);
	if (!found) return null;
	try {
		const buf = fs.readFileSync(found.path);
		// Best-effort mimetype from extension.
		const extMime = {
			'.png': 'image/png',
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.gif': 'image/gif',
			'.webp': 'image/webp',
		};
		return {
			buffer: buf,
			ext: found.ext,
			mimetype: extMime[found.ext] || 'application/octet-stream',
		};
	} catch (_e) {
		return null;
	}
}

function deletePendingImageFromDisk(advertiserId) {
	const found = findPendingImageOnDisk(advertiserId);
	if (found) {
		try { fs.unlinkSync(found.path); } catch (_e) { /* ignore */ }
	}
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

		// Image bytes are held in memory ONLY until the advertiser
		// actually pays. They never touch disk for unpaid
		// registrations — this was the previous abuse vector. Once
		// payment lands we flush them to a private `pending/` dir so
		// they survive PM2 restarts during the review window.
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
 * @access Public — the advertiser themselves must supply the transaction
 *   signature for their pending registration. Future hardening should verify
 *   the signature against the Solana network (see TODO below), but this
 *   endpoint MUST NOT be admin-only — that breaks the self-serve flow.
 */
router.post('/:id/activate', async (req, res) => {
	try {
		const { id } = req.params;
		const { transactionSignature } = req.body;

		const advertiser = advertisers.get(id);

		if (!advertiser) {
			return res.status(404).json({
				success: false,
				message: 'Advertiser not found',
			});
		}

		if (advertiser.bidStatus === 'active') {
			return res.status(400).json({
				success: false,
				message: 'Advertiser is already active',
			});
		}

		if (advertiser.bidStatus === 'pending_review') {
			return res.status(400).json({
				success: false,
				message: 'Already paid — awaiting review.',
			});
		}

		// TODO: Verify transaction on Solana blockchain (amount,
		// recipient, confirmations). For now we accept any signature
		// the user supplies and remember it; the admin reviewer can
		// cross-check it against the blockchain manually before
		// approving.
		if (!transactionSignature) {
			return res.status(400).json({
				success: false,
				message: 'Transaction signature is required',
			});
		}

		// Paid + awaiting moderator approval. The image bytes get
		// flushed to a private `advertiser-pending-images/` dir
		// (outside `public/`) so they survive PM2 restarts but can't
		// be hot-linked. Previously we wrote the image to the public
		// dir and went live immediately on payment, which left zero
		// safety net against inappropriate content.
		advertiser.bidStatus = 'pending_review';
		advertiser.transactionSignature = transactionSignature;
		advertiser.paidAt = new Date().toISOString();
		advertiser.updatedAt = new Date().toISOString();

		if (advertiser.pendingImage && advertiser.pendingImage.buffer) {
			try {
				writePendingImageToDisk(advertiser.id, {
					buffer: advertiser.pendingImage.buffer,
					originalname: `ad${advertiser.pendingImage.ext || '.png'}`,
				});
				advertiser.pendingImage = null;
			} catch (writeErr) {
				console.error('[Advertisers] activate: failed to write pending image:', writeErr.message);
				return res.status(500).json({
					success: false,
					message: 'Failed to persist pending image',
				});
			}
		}

		schedulePersist();

		res.json({
			success: true,
			message: 'Payment received. Your ad is now awaiting moderator review (typically <24 h). You\'ll be able to check its status using the advertiser ID below.',
			advertiser: {
				id: advertiser.id,
				name: advertiser.name,
				bidStatus: advertiser.bidStatus,
			},
		});
	} catch (error) {
		console.error('Error activating advertiser:', error);
		res.status(500).json({
			success: false,
			message: 'Server error',
		});
	}
});

/**
 * @route POST /api/advertisers/:id/admin-review
 * @desc Admin approves or rejects a pending_review advertiser.
 *       On approval, the image buffer is written to disk and the
 *       advertiser becomes `active`. On rejection, status flips to
 *       `rejected` with the supplied reason; the advertiser can
 *       then revise (re-upload) and re-submit for review.
 * @access Admin only
 *
 * Body: { action: 'approve' | 'reject', reason?: string }
 */
router.post('/:id/admin-review', requireAdmin, async (req, res) => {
	try {
		const { id } = req.params;
		const { action, reason } = req.body || {};
		const advertiser = advertisers.get(id);
		if (!advertiser) {
			return res.status(404).json({ success: false, message: 'Advertiser not found' });
		}
		if (advertiser.bidStatus !== 'pending_review') {
			return res.status(400).json({
				success: false,
				message: `Cannot review an advertiser in status ${advertiser.bidStatus}`,
			});
		}

		if (action === 'approve') {
			// Pull the image from wherever it lives: in-memory
			// `pendingImage` (just paid), private pending dir
			// (typical case after a restart) or the already-public
			// `adImage` (revise without new artwork).
			let pendingDiskImage = null;
			if (advertiser.pendingImage && advertiser.pendingImage.buffer) {
				pendingDiskImage = advertiser.pendingImage;
			} else {
				pendingDiskImage = loadPendingImageBufferFromDisk(advertiser.id);
			}

			if (pendingDiskImage && pendingDiskImage.buffer) {
				try {
					const ext = (pendingDiskImage.ext || '.png').replace(/[^a-z0-9.]/g, '');
					const filename = `${advertiser.id}${ext}`;
					const filepath = path.join(ADS_DIR, filename);
					fs.writeFileSync(filepath, pendingDiskImage.buffer);
					advertiser.adImage = `/uploads/ads/${filename}`;
				} catch (writeErr) {
					console.error('[Advertisers] approve: failed to write image:', writeErr.message);
					return res.status(500).json({
						success: false,
						message: 'Failed to persist ad image',
					});
				}
				advertiser.pendingImage = null;
				deletePendingImageFromDisk(advertiser.id);
			} else if (!advertiser.adImage) {
				return res.status(400).json({
					success: false,
					message: 'No image to approve — advertiser must re-upload first.',
				});
			}
			advertiser.bidStatus = 'active';
			advertiser.activatedAt = new Date().toISOString();
			advertiser.rejectionReason = null;
			advertiser.updatedAt = new Date().toISOString();
			updateBidRankings();
			schedulePersist();
			return res.json({
				success: true,
				message: 'Advertiser approved',
				advertiser: {
					id: advertiser.id,
					bidStatus: advertiser.bidStatus,
					adImage: advertiser.adImage,
				},
			});
		}

		if (action === 'reject') {
			const cleanReason = sanitizeText(String(reason || '').slice(0, 500))
				|| 'Did not meet our content guidelines.';
			advertiser.bidStatus = 'rejected';
			advertiser.rejectionReason = cleanReason;
			advertiser.rejectedAt = new Date().toISOString();
			advertiser.updatedAt = new Date().toISOString();
			schedulePersist();
			return res.json({
				success: true,
				message: 'Advertiser rejected',
				advertiser: {
					id: advertiser.id,
					bidStatus: advertiser.bidStatus,
					rejectionReason: advertiser.rejectionReason,
				},
			});
		}

		return res.status(400).json({
			success: false,
			message: 'action must be "approve" or "reject"',
		});
	} catch (error) {
		console.error('Error reviewing advertiser:', error);
		res.status(500).json({ success: false, message: 'Server error' });
	}
});

/**
 * @route GET /api/advertisers/:id/status
 * @desc Public status check by advertiser id (no auth — the id is
 *       handed to the advertiser at registration time and acts as a
 *       per-advertiser secret). Returns enough information for the
 *       advertiser to know what to do next without exposing PII or
 *       letting random visitors enumerate the queue.
 * @access Public (id required, acts as a bearer-style secret)
 */
router.get('/:id/status', async (req, res) => {
	try {
		const { id } = req.params;
		const advertiser = advertisers.get(id);
		if (!advertiser) {
			return res.status(404).json({ success: false, message: 'Advertiser not found' });
		}
		res.json({
			success: true,
			advertiser: {
				id: advertiser.id,
				name: advertiser.name,
				bidStatus: advertiser.bidStatus,
				adImage: advertiser.adImage,
				adText: advertiser.adText,
				adLink: advertiser.adLink,
				rejectionReason: advertiser.rejectionReason || null,
				paidAt: advertiser.paidAt || null,
				activatedAt: advertiser.activatedAt || null,
				rejectedAt: advertiser.rejectedAt || null,
				walletAddress: advertiser.walletAddress,
			},
		});
	} catch (error) {
		console.error('Error getting advertiser status:', error);
		res.status(500).json({ success: false, message: 'Server error' });
	}
});

/**
 * @route GET /api/advertisers/mine
 * @desc List every advertiser registration associated with the
 *       signed-in wallet (see `routes/walletAuth.js` for the
 *       challenge/verify flow). The session token must include the
 *       same address as the advertiser's `walletAddress`. This is
 *       how a returning advertiser discovers their pending ads after
 *       clearing their browser storage or moving devices.
 * @access Wallet session required
 */
router.get('/mine', requireWalletSession, (req, res) => {
	try {
		const wallet = String(req.walletAddress || '');
		const mine = Array.from(advertisers.values())
			.filter(adv => adv && String(adv.walletAddress || '') === wallet)
			.map(adv => ({
				id: adv.id,
				name: adv.name,
				bidStatus: adv.bidStatus,
				adImage: adv.adImage,
				adText: adv.adText,
				adLink: adv.adLink,
				bidAmount: adv.bidAmount,
				cellCount: adv.cellCount,
				rejectionReason: adv.rejectionReason || null,
				paidAt: adv.paidAt || null,
				activatedAt: adv.activatedAt || null,
				rejectedAt: adv.rejectedAt || null,
				createdAt: adv.createdAt,
				updatedAt: adv.updatedAt,
			}));
		res.json({ success: true, walletAddress: wallet, advertisers: mine });
	} catch (err) {
		console.error('[Advertisers] /mine failed:', err);
		res.status(500).json({ success: false, message: 'Server error' });
	}
});

/**
 * @route POST /api/advertisers/:id/revise
 * @desc Re-upload an ad image / update ad text after rejection.
 *       The session wallet must match the advertiser's wallet.
 *       Returns the advertiser to `pending_review` so the next admin
 *       review covers the new image.
 * @access Wallet session required (must own the advertiser)
 */
router.post('/:id/revise', requireWalletSession, upload.single('adImage'), (req, res) => {
	try {
		const { id } = req.params;
		const advertiser = advertisers.get(id);
		if (!advertiser) {
			return res.status(404).json({ success: false, message: 'Advertiser not found' });
		}
		if (String(advertiser.walletAddress || '') !== String(req.walletAddress || '')) {
			return res.status(403).json({ success: false, message: 'Wallet does not own this advertiser' });
		}
		if (advertiser.bidStatus !== 'rejected' && advertiser.bidStatus !== 'pending_review') {
			return res.status(400).json({
				success: false,
				message: `Cannot revise an advertiser in status ${advertiser.bidStatus}`,
			});
		}

		// Replace image if a new file came through. Bytes go to
		// the private pending dir so they survive PM2 restarts. The
		// old activated image (if any) on disk is untouched until
		// approval lands, so the live ad doesn't disappear during
		// the revise loop.
		if (req.file && req.file.buffer) {
			try {
				writePendingImageToDisk(advertiser.id, req.file);
				advertiser.pendingImage = null;
			} catch (writeErr) {
				console.error('[Advertisers] revise: failed to write pending image:', writeErr.message);
				return res.status(500).json({ success: false, message: 'Failed to save new image' });
			}
		}

		if (typeof req.body?.adText === 'string') {
			advertiser.adText = sanitizeText(req.body.adText).slice(0, 64);
		}
		if (typeof req.body?.adLink === 'string') {
			advertiser.adLink = sanitizeText(req.body.adLink);
		}

		advertiser.bidStatus = 'pending_review';
		advertiser.rejectionReason = null;
		advertiser.updatedAt = new Date().toISOString();
		schedulePersist();

		res.json({
			success: true,
			message: 'Revision submitted — back in the review queue.',
			advertiser: {
				id: advertiser.id,
				bidStatus: advertiser.bidStatus,
			},
		});
	} catch (err) {
		console.error('[Advertisers] revise failed:', err);
		res.status(500).json({ success: false, message: 'Server error' });
	}
});

/**
 * @route GET /api/advertisers/admin/pending
 * @desc Admin queue — all advertisers awaiting moderator review.
 * @access Admin only
 */
router.get('/admin/pending', requireAdmin, (req, res) => {
	const list = Array.from(advertisers.values())
		.filter(adv => adv.bidStatus === 'pending_review')
		.map(adv => {
			const hasPendingImage = !!(adv.pendingImage && adv.pendingImage.buffer);
			return {
				id: adv.id,
				name: adv.name,
				adText: adv.adText,
				adLink: adv.adLink,
				bidAmount: adv.bidAmount,
				cellCount: adv.cellCount,
				walletAddress: adv.walletAddress,
				paidAt: adv.paidAt,
				createdAt: adv.createdAt,
				hasPendingImage,
				previewUrl: hasPendingImage ? `/api/advertisers/${adv.id}/admin/preview-image?adminToken=${encodeURIComponent(process.env.ADMIN_TOKEN || '')}` : null,
			};
		});
	res.json({ success: true, advertisers: list });
});

/**
 * @route GET /api/advertisers/:id/admin/preview-image
 * @desc Stream the in-memory pending image for an advertiser awaiting
 *       review. Image isn't on disk yet (deliberate — see notes on
 *       `pendingImage`), so we serve it directly from the buffer.
 * @access Admin only
 */
router.get('/:id/admin/preview-image', requireAdmin, (req, res) => {
	const advertiser = advertisers.get(req.params.id);
	if (!advertiser) return res.status(404).end();
	const inMem = advertiser.pendingImage;
	const img = (inMem && inMem.buffer) ? inMem : loadPendingImageBufferFromDisk(req.params.id);
	if (!img || !img.buffer) return res.status(404).end();
	res.set('Content-Type', img.mimetype || 'application/octet-stream');
	res.set('Cache-Control', 'no-store');
	res.send(img.buffer);
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
/**
 * @route GET /api/advertisers/active
 * @desc List every advertiser eligible to be shown right now.
 *       Used by the in-world cell decoration loop, which needs to
 *       see the *whole* pool so it can apply geometric constraints
 *       (no duplicate within 20 cells, pair wide images across two
 *       cells, etc.) that the simple `/next` rotation cannot
 *       express. Public; carries the same fields `/next` does plus
 *       the costPerCell weight used for client-side rotation.
 * @access Public
 */
router.get('/active', async (req, res) => {
	try {
		updateBidRankings();
		const out = bidRanking
			.filter(entry => entry.remainingCells > 0)
			.map(entry => {
				const adv = advertisers.get(entry.id);
				if (!adv) return null;
				return {
					id: adv.id,
					name: adv.name,
					adImage: adv.adImage,
					adLink: adv.adLink,
					adText: adv.adText,
					bidAmount: adv.bidAmount,
					costPerCell: entry.costPerCell,
					cellCount: adv.cellCount,
					cellsSponsored: adv.cellsSponsored,
					remainingCells: entry.remainingCells,
				};
			})
			.filter(Boolean);
		res.set('Cache-Control', 'no-store');
		res.json({ success: true, advertisers: out });
	} catch (err) {
		console.error('[Advertisers] /active failed:', err);
		res.status(500).json({ success: false, message: 'Server error' });
	}
});

router.get('/next', async (req, res) => {
	try {
		// Rate-limit how often we hand out an advertiser. The client
		// asks for one on every placement; we only return ~1 in
		// AD_SHOW_RATE_INVERSE so the world isn't smothered in ads.
		// Tests / admin previews can bypass this by passing
		// `?force=1`.
		if (req.query.force !== '1' && Math.random() * AD_SHOW_RATE_INVERSE >= 1) {
			return res.status(204).end();
		}

		// Always refresh the ranking so `remainingCells` reflects the
		// latest `cellsSponsored` counter. Cheap because the
		// advertiser map is small.
		updateBidRankings();
		if (bidRanking.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'No active advertisers found',
			});
		}

		// Build the eligible pool (has remaining cells) with weights
		// proportional to costPerCell (higher bid → more frequent
		// rotation, but still bounded so a single big bidder doesn't
		// totally dominate). Approved-only — `requiresApproval` is
		// surfaced through `bidStatus === 'active'`; pending/rejected
		// never enter `bidRanking`.
		const eligible = bidRanking.filter(entry => entry.remainingCells > 0);
		if (eligible.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'No advertisers with remaining cells',
			});
		}

		// Anti-repetition: if there's more than one eligible bidder,
		// drop the most-recently-served one from the pool. Stops the
		// same ad turning up twice in a row even when it's the
		// highest bidder.
		let pool = eligible;
		if (eligible.length > 1 && lastServedAdvertiserId) {
			const filtered = eligible.filter(e => e.id !== lastServedAdvertiserId);
			if (filtered.length > 0) pool = filtered;
		}

		// Weighted selection by costPerCell. Clamp the weight so a
		// 1000x bid only gets ~10x the slots — keeps the wide-bottom
		// of the bidder market visible.
		const weights = pool.map(entry => Math.min(10, Math.max(0.1, entry.costPerCell || 0.1)));
		const totalWeight = weights.reduce((sum, w) => sum + w, 0);
		let pick = Math.random() * totalWeight;
		let chosenIdx = 0;
		for (let i = 0; i < weights.length; i++) {
			pick -= weights[i];
			if (pick <= 0) { chosenIdx = i; break; }
		}
		const chosen = pool[chosenIdx];
		const advertiser = advertisers.get(chosen.id);
		if (!advertiser) {
			return res.status(404).json({
				success: false,
				message: 'Advertiser not found',
			});
		}

		lastServedAdvertiserId = chosen.id;

		res.json({
			success: true,
			_id: advertiser.id,
			id: advertiser.id,
			name: advertiser.name,
			adImage: advertiser.adImage,
			adLink: advertiser.adLink,
			adText: advertiser.adText,
			bidAmount: advertiser.bidAmount,
		});
	} catch (error) {
		console.error('Error getting next advertiser:', error);
		res.status(500).json({
			success: false,
			message: 'Server error',
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
				message: 'Advertiser not found',
			});
		}

		// Cell-weight: wide-aspect ads spread across 2 cells charge
		// for 2 cells per impression. Clamp 1..4 so a malicious
		// client can't drain a campaign in one request.
		const requestedCount = Number(req.body?.cells || req.query?.cells || 1);
		const cellWeight = Math.max(1, Math.min(4,
			Number.isFinite(requestedCount) ? Math.round(requestedCount) : 1));

		advertiser.impressions += 1;
		advertiser.cellsSponsored += cellWeight;
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



