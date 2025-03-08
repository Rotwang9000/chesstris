/**
 * Sponsors Utility Module
 * 
 * Handles sponsor-related functionality such as adding sponsors to tetrominos,
 * tracking impressions and clicks, and managing the bidding system.
 */

/**
 * Add a sponsor to a tetromino based on the bidding system
 * @param {Object} tetromino - The tetromino to add a sponsor to
 * @returns {Object} The tetromino with sponsor information
 */
export async function addSponsorToTetromino(tetromino) {
	try {
		// Fetch the next sponsor from the server
		const response = await fetch('/api/advertisers/next');
		
		if (!response.ok) {
			console.warn('Failed to fetch sponsor:', response.statusText);
			return tetromino;
		}
		
		const sponsor = await response.json();
		
		if (!sponsor) {
			return tetromino;
		}
		
		// Add sponsor to the tetromino
		tetromino.sponsor = {
			id: sponsor._id,
			name: sponsor.name,
			image: sponsor.adImage,
			adUrl: sponsor.adLink,
			adText: sponsor.adText
		};
		
		// Record impression
		recordImpression(sponsor._id);
		
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
async function recordImpression(sponsorId) {
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
 */
export async function handleSponsorClick(sponsorId) {
	try {
		await fetch(`/api/advertisers/${sponsorId}/click`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		});
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
		
		return await response.json();
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
	const adContainer = document.getElementById('sponsor-ad');
	document.getElementById('sponsor-name').textContent = sponsor.name;
	document.getElementById('sponsor-image').src = sponsor.image;
	document.getElementById('sponsor-message').textContent = sponsor.adText;
	document.getElementById('sponsor-link').onclick = () => {
		window.open(sponsor.adUrl, '_blank');
		handleSponsorClick(sponsor.id);
		adContainer.style.display = 'none';
	};
	adContainer.style.display = 'block';
} 