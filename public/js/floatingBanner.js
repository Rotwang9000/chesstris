/**
 * Floating Banner Ad Component
 * 
 * Creates and manages a rotating banner ad display that shows
 * top advertisers in a non-intrusive corner position.
 */

import { fetchNextSponsor, handleSponsorClick, recordImpression } from '../utils/sponsors.js';

// Banner configuration. We anchor to `bottom-left` because the
// top-right (the prior default) collided with the "Next piece" HUD —
// the user reported "the ad box appears under the next piece". The
// bottom-right is the player-bar / mode toggles. Bottom-left is the
// quietest corner, doesn't fight the camera-reset button on mobile,
// and lets us bump z-index without obscuring critical UI.
const BANNER_CONFIG = {
	rotationInterval: 30000, // Rotate every 30 seconds (was 15 — felt spammy)
	fadeTransition: 500,
	autoHideDelay: 60000,
	position: 'bottom-left',
	maxWidth: 280,
	minimized: false,
};

// State
const bannerState = {
	container: null,
	currentSponsor: null,
	rotationTimer: null,
	isVisible: true,
	isPaused: false,
	lastInteraction: Date.now()
};

/**
 * Create the floating banner container
 */
function createBannerContainer() {
	// Check if container already exists
	if (document.getElementById('floating-banner')) {
		bannerState.container = document.getElementById('floating-banner');
		return bannerState.container;
	}
	
	const container = document.createElement('div');
	container.id = 'floating-banner';
	container.innerHTML = `
		<div class="banner-header">
			<span class="banner-badge">Ad</span>
			<div class="banner-controls">
				<button class="banner-minimize" title="Minimize">−</button>
				<button class="banner-close" title="Close">×</button>
			</div>
		</div>
		<div class="banner-content">
			<img class="banner-image" src="" alt="">
			<div class="banner-text">
				<div class="banner-name"></div>
				<div class="banner-message"></div>
			</div>
		</div>
		<button class="banner-cta">Learn More</button>
	`;
	
	// Apply styles
	applyBannerStyles(container);
	
	// Add to document
	document.body.appendChild(container);
	bannerState.container = container;
	
	// Setup event listeners
	setupBannerEventListeners(container);
	
	return container;
}

/**
 * Apply styles to the banner
 */
function applyBannerStyles(container) {
	const styles = `
		#floating-banner {
			position: fixed;
			${BANNER_CONFIG.position.includes('top') ? 'top: 80px;' : 'bottom: 20px;'}
			${BANNER_CONFIG.position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
			max-width: ${BANNER_CONFIG.maxWidth}px;
			background: linear-gradient(135deg, rgba(15, 15, 25, 0.95) 0%, rgba(30, 25, 40, 0.95) 100%);
			border: 1px solid rgba(255, 204, 0, 0.3);
			border-radius: 12px;
			z-index: 1200;
			font-family: 'Inter', 'Playfair Display', sans-serif;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
			backdrop-filter: blur(10px);
			opacity: 1;
			transform: translateX(0);
			transition: opacity 0.3s, transform 0.3s;
		}
		
		#floating-banner.hidden {
			opacity: 0;
			transform: translateX(${BANNER_CONFIG.position.includes('right') ? '100px' : '-100px'});
			pointer-events: none;
		}
		
		#floating-banner.minimized .banner-content,
		#floating-banner.minimized .banner-cta {
			display: none;
		}
		
		#floating-banner.minimized {
			max-width: 120px;
		}
		
		.banner-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 8px 12px;
			border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		}
		
		.banner-badge {
			font-size: 10px;
			text-transform: uppercase;
			letter-spacing: 1px;
			color: #888;
			background: rgba(255, 204, 0, 0.15);
			padding: 2px 6px;
			border-radius: 3px;
		}
		
		.banner-controls {
			display: flex;
			gap: 8px;
		}
		
		.banner-controls button {
			background: none;
			border: none;
			color: #666;
			font-size: 18px;
			cursor: pointer;
			padding: 0 4px;
			transition: color 0.2s;
			line-height: 1;
		}
		
		.banner-controls button:hover {
			color: #ffcc00;
		}
		
		.banner-content {
			padding: 12px;
			display: flex;
			gap: 12px;
			align-items: center;
		}
		
		.banner-image {
			width: 60px;
			height: 60px;
			object-fit: cover;
			border-radius: 8px;
			border: 1px solid rgba(255, 204, 0, 0.2);
		}
		
		.banner-text {
			flex: 1;
			min-width: 0;
		}
		
		.banner-name {
			color: #ffcc00;
			font-weight: bold;
			font-size: 14px;
			margin-bottom: 4px;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		
		.banner-message {
			color: #aaa;
			font-size: 12px;
			line-height: 1.3;
			display: -webkit-box;
			-webkit-line-clamp: 2;
			-webkit-box-orient: vertical;
			overflow: hidden;
		}
		
		.banner-cta {
			display: block;
			width: calc(100% - 24px);
			margin: 0 12px 12px;
			padding: 8px 16px;
			background: linear-gradient(135deg, #ffcc00 0%, #e6b800 100%);
			color: #000;
			border: none;
			border-radius: 6px;
			font-weight: bold;
			font-size: 13px;
			cursor: pointer;
			transition: transform 0.2s, box-shadow 0.2s;
		}
		
		.banner-cta:hover {
			transform: translateY(-1px);
			box-shadow: 0 4px 12px rgba(255, 204, 0, 0.3);
		}
	`;
	
	// Add styles to document if not already present
	if (!document.getElementById('floating-banner-styles')) {
		const styleEl = document.createElement('style');
		styleEl.id = 'floating-banner-styles';
		styleEl.textContent = styles;
		document.head.appendChild(styleEl);
	}
}

/**
 * Setup event listeners for the banner
 */
function setupBannerEventListeners(container) {
	// Close button
	const closeBtn = container.querySelector('.banner-close');
	if (closeBtn) {
		closeBtn.addEventListener('click', () => {
			hideBanner();
		});
	}
	
	// Minimize button
	const minimizeBtn = container.querySelector('.banner-minimize');
	if (minimizeBtn) {
		minimizeBtn.addEventListener('click', () => {
			toggleMinimize();
		});
	}
	
	// CTA button click
	const ctaBtn = container.querySelector('.banner-cta');
	if (ctaBtn) {
		ctaBtn.addEventListener('click', () => {
			if (bannerState.currentSponsor) {
				handleSponsorClick(bannerState.currentSponsor.id, bannerState.currentSponsor.adUrl);
			}
		});
	}
	
	// Pause rotation on hover
	container.addEventListener('mouseenter', () => {
		bannerState.isPaused = true;
		bannerState.lastInteraction = Date.now();
	});
	
	container.addEventListener('mouseleave', () => {
		bannerState.isPaused = false;
		bannerState.lastInteraction = Date.now();
	});
}

/**
 * Update banner content with a sponsor
 */
async function updateBannerContent(sponsor) {
	if (!bannerState.container || !sponsor) return;
	
	const imageEl = bannerState.container.querySelector('.banner-image');
	const nameEl = bannerState.container.querySelector('.banner-name');
	const messageEl = bannerState.container.querySelector('.banner-message');
	
	// Fade out
	bannerState.container.style.opacity = '0.5';
	
	// Update content after short delay
	setTimeout(() => {
		if (imageEl) imageEl.src = sponsor.image || '';
		if (nameEl) nameEl.textContent = sponsor.name || 'Sponsor';
		if (messageEl) messageEl.textContent = sponsor.adText || '';
		
		// Store current sponsor
		bannerState.currentSponsor = sponsor;
		
		// Record impression
		if (sponsor.id) {
			recordImpression(sponsor.id);
		}
		
		// Fade in
		bannerState.container.style.opacity = '1';
	}, BANNER_CONFIG.fadeTransition / 2);
}

/**
 * Rotate to next sponsor
 */
async function rotateToNextSponsor() {
	if (bannerState.isPaused || !bannerState.isVisible) return;
	
	try {
		const sponsor = await fetchNextSponsor();
		if (sponsor) {
			await updateBannerContent(sponsor);
		}
	} catch (error) {
		console.warn('Failed to rotate banner sponsor:', error);
	}
}

/**
 * Start banner rotation
 */
function startRotation() {
	// Clear any existing timer
	if (bannerState.rotationTimer) {
		clearInterval(bannerState.rotationTimer);
	}
	
	// Start rotation timer
	bannerState.rotationTimer = setInterval(() => {
		rotateToNextSponsor();
	}, BANNER_CONFIG.rotationInterval);
}

/**
 * Stop banner rotation
 */
function stopRotation() {
	if (bannerState.rotationTimer) {
		clearInterval(bannerState.rotationTimer);
		bannerState.rotationTimer = null;
	}
}

/**
 * Show the banner
 */
function showBanner() {
	if (bannerState.container) {
		bannerState.container.classList.remove('hidden');
		bannerState.isVisible = true;
		startRotation();
	}
}

/**
 * Hide the banner
 */
function hideBanner() {
	if (bannerState.container) {
		bannerState.container.classList.add('hidden');
		bannerState.isVisible = false;
		stopRotation();
	}
}

/**
 * Toggle minimize state
 */
function toggleMinimize() {
	if (bannerState.container) {
		bannerState.container.classList.toggle('minimized');
		BANNER_CONFIG.minimized = bannerState.container.classList.contains('minimized');
		
		const minimizeBtn = bannerState.container.querySelector('.banner-minimize');
		if (minimizeBtn) {
			minimizeBtn.textContent = BANNER_CONFIG.minimized ? '+' : '−';
		}
	}
}

/**
 * Initialize the floating banner system
 */
export async function initFloatingBanner() {
	// Create container
	createBannerContainer();
	
	// Load first sponsor
	try {
		const sponsor = await fetchNextSponsor();
		if (sponsor) {
			await updateBannerContent(sponsor);
			showBanner();
		} else {
			// No sponsors available, hide the banner
			console.log('No sponsors available for floating banner');
			hideBanner();
		}
	} catch (error) {
		console.warn('Failed to initialize floating banner:', error);
		hideBanner();
	}
}

/**
 * Clean up the floating banner
 */
export function destroyFloatingBanner() {
	stopRotation();
	
	if (bannerState.container) {
		bannerState.container.remove();
		bannerState.container = null;
	}
	
	// Remove styles
	const styleEl = document.getElementById('floating-banner-styles');
	if (styleEl) {
		styleEl.remove();
	}
}

// Export functions
export {
	showBanner,
	hideBanner,
	toggleMinimize,
	updateBannerContent
};



