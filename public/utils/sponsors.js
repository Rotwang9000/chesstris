/**
 * Sponsors Utility Module
 * 
 * Handles sponsor-related functionality such as adding sponsors to tetrominos,
 * tracking impressions and clicks, and managing the bidding system.
 */

// Sponsor cache to avoid excessive API calls
const sponsorCache = {
	currentSponsor: null,
	lastFetch: 0,
	cacheDuration: 5000, // Cache for 5 seconds
	
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
	}
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
		
		if (!response.ok) {
			if (response.status === 404) {
				// No sponsors available
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
 * Record an impression for a sponsor
 * @param {string} sponsorId - The sponsor ID
 */
export async function recordImpression(sponsorId) {
	if (!sponsorId) return;
	
	try {
		await fetch(`/api/advertisers/${sponsorId}/impression`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		});
	} catch (error) {
		console.error('Error recording impression:', error);
	}
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

/**
 * Display sponsor information in the UI
 * @param {Object} sponsor - The sponsor object
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
	if (imageEl) imageEl.src = sponsor.image || '';
	if (messageEl) messageEl.textContent = sponsor.adText || '';
	
	if (linkEl) {
		linkEl.onclick = () => {
			handleSponsorClick(sponsor.id, sponsor.adUrl);
			hideSponsorAd();
		};
	}
	
	adContainer.style.display = 'block';
	
	// Auto-hide after 10 seconds
	setTimeout(() => {
		hideSponsorAd();
	}, 10000);
}

/**
 * Hide the sponsor ad container
 */
export function hideSponsorAd() {
	const adContainer = document.getElementById('sponsor-ad');
	if (adContainer) {
		adContainer.style.display = 'none';
	}
}

/**
 * Show sponsor ad when tetromino is placed
 * Call this function when a tetromino with a sponsor is placed on the board
 * @param {Object} tetromino - The placed tetromino (may have sponsor property)
 */
export function onTetrominoPlaced(tetromino) {
	if (tetromino && tetromino.sponsor) {
		displaySponsorInfo(tetromino.sponsor);
	}
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
