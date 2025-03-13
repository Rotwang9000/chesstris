/**
 * Sponsors Utility Module
 * 
 * Handles sponsor-related functionality such as adding sponsors to tetrominos,
 * tracking impressions and clicks, and managing the bidding system.
 */

import * as Network from './network.js';

// Flag to determine if we should attempt to use the sponsors API
const USE_SPONSORS = false;  // Set to false to disable sponsor functionality

/**
 * Add a sponsor to a tetromino
 * @param {Object} tetromino - The tetromino to add a sponsor to
 * @returns {Object} The tetromino with sponsor added
 */
export async function addSponsorToTetromino(tetromino) {
	if (!USE_SPONSORS) {
		return tetromino;
	}
	
	try {
		// Get a sponsor from the server
		const sponsor = await Network.getNextSponsor().catch(() => null);
		
		if (!sponsor) {
			return tetromino;
		}
		
		// Add sponsor to tetromino
		tetromino.sponsor = {
			id: sponsor.id,
			name: sponsor.name,
			logo: sponsor.logo,
			color: sponsor.color || getDefaultColorForShape(tetromino.type),
			clickUrl: sponsor.clickUrl,
			impressionRecorded: false
		};
		
		// Record an impression
		recordImpression(sponsor.id).catch(console.error);
		
		return tetromino;
	} catch (error) {
		console.error('Error adding sponsor to tetromino:', error);
		return tetromino;
	}
}

/**
 * Record an impression of a sponsor
 * @param {string} sponsorId - The sponsor ID
 * @returns {Promise<boolean>} Whether the impression was recorded successfully
 */
async function recordImpression(sponsorId) {
	if (!USE_SPONSORS) {
		return true;
	}
	
	try {
		await Network.recordSponsorImpression(sponsorId);
		return true;
	} catch (error) {
		console.error('Error recording sponsor impression:', error);
		return false;
	}
}

/**
 * Handle a click on a sponsored tetromino
 * @param {string} sponsorId - The sponsor ID
 * @returns {Promise<boolean>} Whether the click was recorded successfully
 */
export async function handleSponsorClick(sponsorId) {
	if (!USE_SPONSORS) {
		return true;
	}
	
	try {
		// Record the click
		await Network.recordSponsorClick(sponsorId);
		
		// Get the sponsor data
		const sponsors = JSON.parse(localStorage.getItem('sponsors') || '{}');
		const sponsor = sponsors[sponsorId];
		
		if (!sponsor || !sponsor.clickUrl) {
			return false;
		}
		
		// Open the sponsor's website in a new tab
		window.open(sponsor.clickUrl, '_blank');
		
		return true;
	} catch (error) {
		console.error('Error handling sponsor click:', error);
		return false;
	}
}

/**
 * Get stats for a sponsor
 * @param {string} sponsorId - The sponsor ID
 * @returns {Promise<Object>} The sponsor stats
 */
export async function getSponsorStats(sponsorId) {
	if (!USE_SPONSORS) {
		return {
			impressions: 0,
			clicks: 0,
			clickThroughRate: 0
		};
	}
	
	try {
		// Get sponsor stats from the server
		const response = await fetch(`${Network.API.SPONSORS}/${sponsorId}/stats`);
		
		if (!response.ok) {
			throw new Error('Failed to get sponsor stats');
		}
		
		return await response.json();
	} catch (error) {
		console.error('Error getting sponsor stats:', error);
		
		// Return default stats
		return {
			impressions: 0,
			clicks: 0,
			clickThroughRate: 0
		};
	}
}

/**
 * Display sponsor information
 * @param {Object} sponsor - The sponsor data
 */
export function displaySponsorInfo(sponsor) {
	if (!USE_SPONSORS || !sponsor) {
		return;
	}
	
	// Create or get sponsor info element
	let sponsorInfo = document.getElementById('sponsor-info');
	
	if (!sponsorInfo) {
		sponsorInfo = document.createElement('div');
		sponsorInfo.id = 'sponsor-info';
		sponsorInfo.style.position = 'absolute';
		sponsorInfo.style.top = '10px';
		sponsorInfo.style.right = '10px';
		sponsorInfo.style.padding = '10px';
		sponsorInfo.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
		sponsorInfo.style.color = 'white';
		sponsorInfo.style.borderRadius = '5px';
		sponsorInfo.style.zIndex = '1000';
		document.body.appendChild(sponsorInfo);
	}
	
	// Create sponsor content
	sponsorInfo.innerHTML = `
		<div>
			<strong>Sponsored by:</strong>
			<div>${sponsor.name}</div>
			${sponsor.logo ? `<img src="${sponsor.logo}" alt="${sponsor.name}" style="max-width: 100px; max-height: 50px;">` : ''}
		</div>
	`;
	
	// Add click event
	sponsorInfo.style.cursor = 'pointer';
	sponsorInfo.addEventListener('click', () => {
		handleSponsorClick(sponsor.id);
	});
}

/**
 * Get a default color for a tetromino shape
 * @param {string} shape - The tetromino shape (I, O, T, J, L, S, Z)
 * @returns {number} A hex color value
 */
function getDefaultColorForShape(shape) {
	const colors = {
		I: 0x00f0f0, // cyan
		O: 0xf0f000, // yellow
		T: 0xa000f0, // purple
		J: 0x0000f0, // blue
		L: 0xf0a000, // orange
		S: 0x00f000, // green
		Z: 0xf00000  // red
	};
	
	return colors[shape] || 0xcccccc;
} 