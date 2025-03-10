/**
 * Sponsors Utility Module
 * 
 * Handles sponsor-related functionality such as adding sponsors to tetrominos,
 * tracking impressions and clicks, and managing the bidding system.
 */

import * as Network from './network.js';

// Flag to determine if we should attempt to use the sponsors API
// Set to false by default to prevent errors when API is not available
const SPONSORS_API_ENABLED = false;

// Mock sponsor data for development
const MOCK_SPONSORS = [
	{
		id: 'mock-sponsor-1',
		name: 'Development Sponsor',
		message: 'This is a mock sponsor for development',
		imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
		url: 'https://example.com'
	}
];

/**
 * Add a sponsor to a tetromino based on the bidding system
 * @param {Object} tetromino - The tetromino to add a sponsor to
 * @returns {Object} The tetromino with sponsor information
 */
export async function addSponsorToTetromino(tetromino) {
	// Return early if sponsors API is disabled
	if (!SPONSORS_API_ENABLED) {
		// Optionally use mock sponsor data
		// tetromino.hasSponsor = true;
		// tetromino.sponsor = MOCK_SPONSORS[0];
		// tetromino.sponsor.impressionTime = Date.now();
		return tetromino;
	}
	
	try {
		// Fetch the next sponsor from the server
		const response = await Network.apiRequest('/api/sponsors/next', {
			method: 'GET'
		});
		
		if (response && response.sponsor) {
			// Record the impression
			recordImpression(response.sponsor.id);
			
			// Add sponsor info to the tetromino
			tetromino.hasSponsor = true;
			tetromino.sponsor = response.sponsor;
			tetromino.sponsor.impressionTime = Date.now();
			
			console.log(`Added sponsor ${response.sponsor.name} to tetromino`);
			
			return tetromino;
		}
	} catch (error) {
		// Log error only once per session to avoid spam
		if (!window.sponsorErrorLogged) {
			console.error('Failed to fetch sponsor:', error.message);
			window.sponsorErrorLogged = true;
		}
	}
	
	// Return the original tetromino if no sponsor was added
	return tetromino;
}

/**
 * Record an impression for a sponsor
 * @param {string} sponsorId - The ID of the sponsor
 */
async function recordImpression(sponsorId) {
	if (!SPONSORS_API_ENABLED) return;
	
	try {
		await Network.apiRequest('/api/sponsors/impression', {
			method: 'POST',
			body: { sponsorId }
		});
	} catch (error) {
		// Log error only once per session
		if (!window.sponsorImpressionErrorLogged) {
			console.error('Failed to record impression:', error.message);
			window.sponsorImpressionErrorLogged = true;
		}
	}
}

/**
 * Handle a click on a sponsored element
 * @param {string} sponsorId - The ID of the sponsor
 */
export async function handleSponsorClick(sponsorId) {
	if (!SPONSORS_API_ENABLED) {
		// For development, just open a mock URL
		window.open('https://example.com', '_blank');
		return;
	}
	
	try {
		// Record the click
		await Network.apiRequest('/api/sponsors/click', {
			method: 'POST',
			body: { sponsorId }
		});
		
		// Get the sponsor info
		const response = await Network.apiRequest(`/api/sponsors/${sponsorId}`, {
			method: 'GET'
		});
		
		if (response && response.sponsor && response.sponsor.url) {
			window.open(response.sponsor.url, '_blank');
		}
	} catch (error) {
		console.error('Failed to handle sponsor click:', error.message);
	}
}

/**
 * Get statistics for a sponsor
 * @param {string} sponsorId - The ID of the sponsor
 * @returns {Object} Sponsor statistics
 */
export async function getSponsorStats(sponsorId) {
	if (!SPONSORS_API_ENABLED) {
		return {
			impressions: 0,
			clicks: 0,
			ctr: 0,
			cellsSponsored: 0
		};
	}
	
	try {
		const response = await Network.apiRequest(`/api/sponsors/${sponsorId}/stats`, {
			method: 'GET'
		});
		
		return response;
	} catch (error) {
		console.error('Error getting sponsor stats:', error);
		throw new Error(`Failed to fetch sponsor stats: ${error.message}`);
	}
}

/**
 * Display sponsor information in the UI
 * @param {Object} sponsor - The sponsor object
 */
export function displaySponsorInfo(sponsor) {
	const sponsorAd = document.getElementById('sponsor-ad');
	const sponsorName = document.getElementById('sponsor-name');
	const sponsorImage = document.getElementById('sponsor-image');
	const sponsorMessage = document.getElementById('sponsor-message');
	const sponsorLink = document.getElementById('sponsor-link');
	
	if (sponsorAd && sponsorName && sponsorImage && sponsorMessage && sponsorLink) {
		sponsorName.textContent = sponsor.name;
		sponsorImage.src = sponsor.imageUrl;
		sponsorMessage.textContent = sponsor.message || 'Check out our sponsor!';
		
		sponsorLink.addEventListener('click', () => handleSponsorClick(sponsor.id));
		
		// Show the sponsor ad
		sponsorAd.style.display = 'block';
		
		// Add close button functionality
		const closeBtn = sponsorAd.querySelector('.close-btn');
		if (closeBtn) {
			closeBtn.addEventListener('click', () => {
				sponsorAd.style.display = 'none';
			});
		}
	}
} 