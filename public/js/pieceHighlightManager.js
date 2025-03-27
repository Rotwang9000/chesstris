/**
 * Chess Piece Highlight Manager
 * 
 * This module handles highlighting of chess pieces without circular dependencies.
 */

import { getTHREE } from './enhanced-gameCore';



// Global reference to chess pieces group
let chessPiecesGroup = null;

/**
 * Set the chess pieces group for highlight operations
 * @param {THREE.Group} group - The chess pieces group
 */
export function setChessPiecesGroup(group) {
	chessPiecesGroup = group;
}

/**
 * Highlight a chess piece
 * @param {Object} piece - The piece to highlight
 * @param {boolean} isHighlighted - Whether to highlight or unhighlight
 */
function highlightChessPiece(piece, isHighlighted) {
	if (!piece) return;

	// Handle array of pieces
	if (Array.isArray(piece)) {
		piece.forEach(p => highlightChessPiece(p, isHighlighted));
		return;
	}

	// Skip if the piece doesn't have a material
	if (!piece.material) return;

	// Store original material if not already stored
	if (isHighlighted && !piece.userData.originalMaterial) {
		piece.userData.originalMaterial = piece.material.clone();
	}

	if (isHighlighted) {
		// Apply highlight material
		const highlightMaterial = new THREE.MeshBasicMaterial({
			color: 0xffff00,
			transparent: true,
			opacity: 0.8
		});
		piece.material = highlightMaterial;
	} else {
		// Restore original material
		if (piece.userData.originalMaterial) {
			piece.material.dispose();
			piece.material = piece.userData.originalMaterial;
			delete piece.userData.originalMaterial;
		}
	}
}

/**
 * Highlight the current player's pieces in red
 * @param {string} currentPlayerId - The current player's ID
 */
export function highlightCurrentPlayerPieces(currentPlayerId) {
	const THREE = getTHREE();
	// If no chess pieces group, return
	if (!chessPiecesGroup) return;

	// Remove any existing highlights first
	removePlayerPiecesHighlight();

	// Apply highlight to current player's pieces
	chessPiecesGroup.children.forEach(piece => {
		if (piece.userData && String(piece.userData.player) === String(currentPlayerId)) {
			// Create red highlight
			try {
				const geometry = new THREE.RingGeometry(0.5, 0.6, 32);
				const material = new THREE.MeshBasicMaterial({
					color: 0xAA0000, // Red color for current player
					transparent: true,
					opacity: 0.8,
					side: THREE.DoubleSide
				});

				const highlight = new THREE.Mesh(geometry, material);
				highlight.name = 'hover-highlight';
				highlight.rotation.x = -Math.PI / 2; // Lay flat
				highlight.position.y = -0.65; // Positioned below the piece

				// Create glow effect
				const glowGeometry = new THREE.RingGeometry(0.7, 0.9, 32);
				const glowMaterial = new THREE.MeshBasicMaterial({
					color: 0xAA0000,
					transparent: true,
					opacity: 0.4,
					side: THREE.DoubleSide
				});
				const glow = new THREE.Mesh(glowGeometry, glowMaterial);
				glow.name = 'hover-glow';
				glow.rotation.x = -Math.PI / 2; // Lay flat
				glow.position.y = -0.67; // Positioned just below the highlight

				piece.add(highlight);
				piece.add(glow);

				// Pulsing animation
				if (window.TWEEN) {
					const scaleData = { value: 1.0 };
					const scaleTween = new TWEEN.Tween(scaleData)
						.to({ value: 1.1 }, 800)
						.easing(TWEEN.Easing.Quadratic.InOut)
						.yoyo(true)
						.repeat(Infinity)
						.onUpdate(() => {
							if (highlight && highlight.scale) {
								highlight.scale.set(scaleData.value, scaleData.value, 1);
							}
							if (glow && glow.scale) {
								glow.scale.set(scaleData.value * 1.1, scaleData.value * 1.1, 1);
							}
						})
						.start();

					highlight.userData.tween = scaleTween;
				} else {
					// Fallback animation
					const startTime = Date.now();
					highlight.userData.animation = function () {
						const elapsed = (Date.now() - startTime) / 1000;
						const scale = 1 + 0.1 * Math.sin(elapsed * 3);
						highlight.scale.set(scale, scale, 1);
						glow.scale.set(scale * 1.1, scale * 1.1, 1);
					};

					if (!window._highlightAnimations) {
						window._highlightAnimations = [];

						if (!window._highlightAnimationLoop) {
							window._highlightAnimationLoop = function () {
								if (window._highlightAnimations && window._highlightAnimations.length > 0) {
									window._highlightAnimations.forEach(anim => {
										if (typeof anim === 'function') {
											try {
												anim();
											} catch (e) {
												console.warn('Error in highlight animation:', e);
											}
										}
									});
								}
								requestAnimationFrame(window._highlightAnimationLoop);
							};
							window._highlightAnimationLoop();
						}
					}

					window._highlightAnimations.push(highlight.userData.animation);
				}
			} catch (error) {
				console.error('Error creating highlight effect for current player:', error);
			}
		}
	});
}

/**
 * Highlight all pieces belonging to a specific player
 * @param {string} playerId - Player ID
 */
export function highlightPlayerPieces(playerId) {
	// If no chess pieces group, return
	if (!chessPiecesGroup) return;

	// Apply highlight to matching pieces
	chessPiecesGroup.children.forEach(piece => {
		if (piece.userData && String(piece.userData.player) === String(playerId)) {
			highlightSinglePiece(piece);
		}
	});
}

/**
 * Remove highlights from all chess pieces
 */
export function removePlayerPiecesHighlight() {
	// If no chess pieces group, return
	if (!chessPiecesGroup) return;

	// Remove highlights from all pieces
	chessPiecesGroup.children.forEach(piece => {
		// Clean up previous highlight elements
		const existingHighlight = piece.getObjectByName('hover-highlight');
		const existingGlow = piece.getObjectByName('hover-glow');

		// Remove animations
		if (existingHighlight && existingHighlight.userData && existingHighlight.userData.animation) {
			if (window._highlightAnimations) {
				const index = window._highlightAnimations.indexOf(existingHighlight.userData.animation);
				if (index > -1) {
					window._highlightAnimations.splice(index, 1);
				}
			}
		}

		// Remove meshes
		if (existingHighlight) {
			piece.remove(existingHighlight);
			if (existingHighlight.geometry) existingHighlight.geometry.dispose();
			if (existingHighlight.material) existingHighlight.material.dispose();
		}

		if (existingGlow) {
			piece.remove(existingGlow);
			if (existingGlow.geometry) existingGlow.geometry.dispose();
			if (existingGlow.material) existingGlow.material.dispose();
		}

		// Reset scale
		piece.scale.set(1, 1, 1);
	});
}

/**
 * Highlight a single chess piece with a hover effect
 */
export function highlightSinglePiece(piece) {
	const THREE = getTHREE();
	// Safety check - if piece is null or undefined, don't proceed
	if (!piece) {
		console.warn('Attempted to highlight null/undefined piece');
		return;
	}

	// Clean up previous highlight elements if they exist
	const existingHighlight = piece.getObjectByName('hover-highlight');
	const existingGlow = piece.getObjectByName('hover-glow');

	// Remove old elements from animation loop first
	if (existingHighlight && existingHighlight.userData && existingHighlight.userData.animation) {
		if (window._highlightAnimations) {
			const index = window._highlightAnimations.indexOf(existingHighlight.userData.animation);
			if (index > -1) {
				window._highlightAnimations.splice(index, 1);
			}
		}
	}

	// Remove old highlight meshes
	if (existingHighlight) {
		piece.remove(existingHighlight);
		if (existingHighlight.geometry) existingHighlight.geometry.dispose();
		if (existingHighlight.material) existingHighlight.material.dispose();
	}

	if (existingGlow) {
		piece.remove(existingGlow);
		if (existingGlow.geometry) existingGlow.geometry.dispose();
		if (existingGlow.material) existingGlow.material.dispose();
	}

	// Create new highlight
	try {
		const geometry = new THREE.RingGeometry(0.5, 0.6, 32);
		const material = new THREE.MeshBasicMaterial({
			color: 0xFFFFFF,
			transparent: true,
			opacity: 0.6,
			side: THREE.DoubleSide
		});

		const highlight = new THREE.Mesh(geometry, material);
		highlight.name = 'hover-highlight';
		highlight.rotation.x = -Math.PI / 2; // Lay flat
		highlight.position.y = -0.65; // Positioned below the piece, adjusted for new height

		// Create glow effect - add a larger, fainter ring
		const glowGeometry = new THREE.RingGeometry(0.7, 0.9, 32);
		const glowMaterial = new THREE.MeshBasicMaterial({
			color: 0xFFFFFF,
			transparent: true,
			opacity: 0.3,
			side: THREE.DoubleSide
		});
		const glow = new THREE.Mesh(glowGeometry, glowMaterial);
		glow.name = 'hover-glow';
		glow.rotation.x = -Math.PI / 2; // Lay flat
		glow.position.y = -0.67; // Positioned just below the highlight, adjusted for new height

		piece.add(highlight);
		piece.add(glow);

		// Add animation using TWEEN for better performance if available
		if (window.TWEEN) {
			const scaleData = { value: 1.0 };
			const scaleTween = new TWEEN.Tween(scaleData)
				.to({ value: 1.1 }, 800)
				.easing(TWEEN.Easing.Quadratic.InOut)
				.yoyo(true)
				.repeat(Infinity)
				.onUpdate(() => {
					if (highlight && highlight.scale) {
						highlight.scale.set(scaleData.value, scaleData.value, 1);
					}
					if (glow && glow.scale) {
						glow.scale.set(scaleData.value * 1.1, scaleData.value * 1.1, 1);
					}
				})
				.start();

			// Store reference to the tween for later cleanup
			highlight.userData.tween = scaleTween;
		} else {
			// Fallback to traditional animation loop
			const startTime = Date.now();
			highlight.userData.animation = function () {
				const elapsed = (Date.now() - startTime) / 1000;
				const scale = 1 + 0.1 * Math.sin(elapsed * 3);
				highlight.scale.set(scale, scale, 1);
				glow.scale.set(scale * 1.1, scale * 1.1, 1);
			};

			// Add to animation loop
			if (!window._highlightAnimations) {
				window._highlightAnimations = [];

				// Set up animation loop if not already running
				if (!window._highlightAnimationLoop) {
					window._highlightAnimationLoop = function () {
						if (window._highlightAnimations && window._highlightAnimations.length > 0) {
							window._highlightAnimations.forEach(anim => {
								if (typeof anim === 'function') {
									try {
										anim();
									} catch (e) {
										console.warn('Error in highlight animation:', e);
									}
								}
							});
						}
						requestAnimationFrame(window._highlightAnimationLoop);
					};
					window._highlightAnimationLoop();
				}
			}

			window._highlightAnimations.push(highlight.userData.animation);
		}

		// Scale piece slightly
		piece.scale.set(1.1, 1.1, 1.1);
	} catch (error) {
		console.error('Error creating highlight effect:', error);
	}
} 