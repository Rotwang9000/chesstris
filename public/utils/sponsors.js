/**
 * Sponsors Utility Module
 * 
 * Handles sponsor-related functionality such as adding sponsors to tetrominos,
 * tracking impressions and clicks, and managing the bidding system.
 */

// Sponsor cache to avoid excessive API calls. We DELIBERATELY use a
// short cache (700 ms — long enough to share a sponsor across the
// near-simultaneous calls a single placement triggers, short enough
// that subsequent placements get a fresh roll of the rotation dice).
const sponsorCache = {
	currentSponsor: null,
	lastFetch: 0,
	cacheDuration: 700,

	isValid() {
		return this.currentSponsor && (Date.now() - this.lastFetch) < this.cacheDuration;
	},

	set(sponsor) {
		this.currentSponsor = sponsor;
		this.lastFetch = Date.now();
	},

	get() {
		return this.isValid() ? this.currentSponsor : null;
	},

	clear() {
		this.currentSponsor = null;
		this.lastFetch = 0;
	},
};

/**
 * Fetch the next sponsor from the server
 * @returns {Promise<Object|null>} Sponsor data or null if not available
 */
export async function fetchNextSponsor() {
	// Check cache first
	const cached = sponsorCache.get();
	if (cached) {
		return cached;
	}
	
	try {
		const response = await fetch('/api/advertisers/next');

		// 204 No Content means "no ad this time" — the server
		// throttles ads so they don't appear on every placement.
		// We deliberately do NOT cache "no ad", so the next request
		// has a fresh roll of the dice.
		if (response.status === 204) {
			return null;
		}

		if (!response.ok) {
			if (response.status === 404) {
				return null;
			}
			console.warn('Failed to fetch sponsor:', response.statusText);
			return null;
		}

		const data = await response.json();

		if (!data || !data.success) {
			return null;
		}
		
		// Format sponsor data
		const sponsor = {
			id: data.id || data._id,
			name: data.name,
			image: data.adImage,
			adUrl: data.adLink,
			adText: data.adText,
			bidAmount: data.bidAmount
		};
		
		// Cache the sponsor
		sponsorCache.set(sponsor);
		
		return sponsor;
	} catch (error) {
		console.error('Error fetching sponsor:', error);
		return null;
	}
}

/**
 * Add a sponsor to a tetromino based on the bidding system
 * @param {Object} tetromino - The tetromino to add a sponsor to
 * @returns {Promise<Object>} The tetromino with sponsor information
 */
export async function addSponsorToTetromino(tetromino) {
	try {
		const sponsor = await fetchNextSponsor();
		
		if (!sponsor) {
			return tetromino;
		}
		
		// Add sponsor to the tetromino
		tetromino.sponsor = sponsor;
		
		// Record impression
		recordImpression(sponsor.id);
		
		// Clear cache so next tetromino can get a different sponsor
		sponsorCache.clear();
		
		return tetromino;
	} catch (error) {
		console.error('Error adding sponsor to tetromino:', error);
		return tetromino;
	}
}

/**
 * Record an impression for a sponsor. `cells` is the cell-weight
 * the impression spans (1 for a single decal, 2 for a wide image
 * spread across two flank cells). The server charges the campaign
 * accordingly.
 * @param {string} sponsorId
 * @param {number} [cells=1]
 */
export async function recordImpression(sponsorId, cells = 1) {
	if (!sponsorId) return;

	try {
		await fetch(`/api/advertisers/${sponsorId}/impression`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ cells }),
		});
	} catch (error) {
		console.error('Error recording impression:', error);
	}
}

/**
 * Fetch the full pool of eligible sponsors. Cached for 30 s on the
 * client because rotation rarely changes that fast and the in-game
 * cell-decoration loop calls this every frame the board updates.
 */
const _activeCache = { list: null, fetchedAt: 0, ms: 30000 };
export async function fetchActiveSponsors() {
	if (_activeCache.list && (Date.now() - _activeCache.fetchedAt) < _activeCache.ms) {
		return _activeCache.list;
	}
	try {
		const res = await fetch('/api/advertisers/active');
		if (!res.ok) return _activeCache.list || [];
		const data = await res.json();
		const list = (data && data.advertisers) || [];
		_activeCache.list = list;
		_activeCache.fetchedAt = Date.now();
		return list;
	} catch (err) {
		console.warn('fetchActiveSponsors error:', err);
		return _activeCache.list || [];
	}
}

export function invalidateActiveSponsorsCache() {
	_activeCache.list = null;
	_activeCache.fetchedAt = 0;
}

/**
 * Handle a sponsor click
 * @param {string} sponsorId - The sponsor ID
 * @param {string} adUrl - The URL to open
 */
export async function handleSponsorClick(sponsorId, adUrl) {
	if (!sponsorId) return;
	
	try {
		// Record the click
		await fetch(`/api/advertisers/${sponsorId}/click`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		});
		
		// Open the ad URL if provided
		if (adUrl) {
			window.open(adUrl, '_blank', 'noopener,noreferrer');
		}
	} catch (error) {
		console.error('Error recording click:', error);
	}
}

/**
 * Get sponsor statistics
 * @param {string} sponsorId - The sponsor ID
 * @returns {Promise<Object>} Sponsor statistics
 */
export async function getSponsorStats(sponsorId) {
	try {
		const response = await fetch(`/api/advertisers/${sponsorId}/stats`);
		
		if (!response.ok) {
			throw new Error(`Failed to fetch sponsor stats: ${response.statusText}`);
		}
		
		const data = await response.json();
		return data.stats || data;
	} catch (error) {
		console.error('Error getting sponsor stats:', error);
		throw error;
	}
}

// How long the click-driven popup stays open before fading out.
// User: "the sponsor message should only come up with a click or
// tap of the cell and go away after a while."
const AD_POPUP_AUTOHIDE_MS = 12000;
let _adAutoHideTimer = null;

/**
 * Display sponsor information in the popup. Click-driven only — the
 * popup opens when the player clicks a sponsored cell (see
 * `chessInteraction.js#showCellInfo`) and auto-hides after
 * `AD_POPUP_AUTOHIDE_MS`. The fresh call resets the timer so a
 * second click within the window keeps it visible.
 * @param {Object} sponsor — sponsor object with id/name/image/adText/adUrl
 */
export function displaySponsorInfo(sponsor) {
	if (!sponsor) return;

	const adContainer = document.getElementById('sponsor-ad');
	if (!adContainer) {
		console.warn('Sponsor ad container not found');
		return;
	}

	const nameEl = document.getElementById('sponsor-name');
	const imageEl = document.getElementById('sponsor-image');
	const messageEl = document.getElementById('sponsor-message');
	const linkEl = document.getElementById('sponsor-link');

	if (nameEl) nameEl.textContent = sponsor.name || 'Sponsor';
	if (imageEl) imageEl.src = sponsor.image || sponsor.adImage || '';
	if (messageEl) messageEl.textContent = sponsor.adText || '';

	if (linkEl) {
		linkEl.onclick = () => {
			handleSponsorClick(sponsor.id, sponsor.adUrl || sponsor.adLink);
			hideSponsorAd();
		};
	}

	adContainer.style.display = 'block';
	if (_adAutoHideTimer) clearTimeout(_adAutoHideTimer);
	_adAutoHideTimer = setTimeout(() => {
		hideSponsorAd();
		_adAutoHideTimer = null;
	}, AD_POPUP_AUTOHIDE_MS);
}

/**
 * Hide the sponsor ad container and cancel any pending auto-hide
 * timer so it doesn't fire on a popup that's already gone.
 */
export function hideSponsorAd() {
	const adContainer = document.getElementById('sponsor-ad');
	if (adContainer) {
		adContainer.style.display = 'none';
	}
	if (_adAutoHideTimer) {
		clearTimeout(_adAutoHideTimer);
		_adAutoHideTimer = null;
	}
}

/**
 * Hook called when a tetromino with a sponsor is placed.
 * NO-OP: we used to auto-display the popup here, but the user asked
 * for the ad box to only show on click. The sponsor info is now
 * surfaced when the player clicks a sponsored cell (see
 * `chessInteraction.js#showCellInfo`).
 * @param {Object} _tetromino
 */
export function onTetrominoPlaced(_tetromino) {
	// Intentionally empty. Kept exported so existing call sites in
	// the legacy spawn / placement flow can be safely no-ops without
	// a refactor.
}

/**
 * Initialize sponsor system
 * Preload the first sponsor and set up event listeners
 */
export async function initSponsorSystem() {
	// Preload first sponsor
	await fetchNextSponsor();
	
	// Set up close button listener if exists
	const closeBtn = document.querySelector('#sponsor-ad .sponsor-close');
	if (closeBtn) {
		closeBtn.addEventListener('click', hideSponsorAd);
	}
	
	console.log('Sponsor system initialized');
}
