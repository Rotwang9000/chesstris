/**
 * Tetromino visual effects: drop animation, explosions, sand-dissolve
 * falls, placement bursts, cleared-line highlights.
 *
 * Each function takes `gameState` explicitly rather than reaching into a
 * shared singleton so the same effects can be reused for spectator
 * overlays in the future.
 */

import { getTHREE, getPlayerColors } from '../gameContext.js';
import { translatePosition } from '../centreBoardMarker.js';

const PLAYER_COLORS = getPlayerColors();

const MAX_ACTIVE_EXPLOSIONS = 6;
const activeExplosionIds = new Set();

function safePlaySound(name) {
	if (typeof playSound === 'function') {
		try { playSound(name); } catch (_e) { /* sound is best-effort */ }
	}
}

export function showDropAnimation() {
	const animElement = document.createElement('div');
	Object.assign(animElement.style, {
		position: 'fixed',
		top: '50%',
		left: '50%',
		transform: 'translate(-50%, -50%)',
		color: 'cyan',
		fontSize: '48px',
		fontWeight: 'bold',
		textShadow: '0 0 10px rgba(0,200,255,0.8)',
		zIndex: '1000',
		pointerEvents: 'none',
		opacity: '0',
		transition: 'all 0.3s',
	});
	animElement.textContent = 'DROP!';
	document.body.appendChild(animElement);

	setTimeout(() => {
		animElement.style.opacity = '1';
		animElement.style.fontSize = '72px';
	}, 50);
	setTimeout(() => { animElement.style.opacity = '0'; }, 400);
	setTimeout(() => { document.body.removeChild(animElement); }, 700);
}

export function showExplosionAnimation(x, z, gameState) {
	const THREE = getTHREE();
	if (!THREE || !gameState?.scene) return;
	if (activeExplosionIds.size >= MAX_ACTIVE_EXPLOSIONS) return;

	const effectId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	activeExplosionIds.add(effectId);

	const particleGroup = new THREE.Group();
	particleGroup.name = `explosion-${effectId}`;
	gameState.scene.add(particleGroup);

	safePlaySound('explosion');

	const isLowProfile = !!gameState.lowQuality
		|| gameState.renderProfile === 'cute'
		|| !!gameState.retroMode
		|| gameState.renderProfile === 'retro';
	const particleCount = isLowProfile ? 10 : 18;
	const particles = [];
	const absolutePos = translatePosition({ x, z }, gameState, true);
	const centerX = absolutePos.x;
	const centerZ = absolutePos.z;

	for (let i = 0; i < particleCount; i++) {
		const size = Math.random() * 0.22 + 0.08;
		const geometry = new THREE.BoxGeometry(size, size, size);
		const usePlayerColor = Math.random() > 0.5;
		const color = (usePlayerColor && gameState.currentPlayer && PLAYER_COLORS[gameState.currentPlayer])
			? new THREE.Color(PLAYER_COLORS[gameState.currentPlayer])
			: new THREE.Color().setHSL(Math.random() * 0.1 + 0.05, 0.8, 0.6);
		const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
		const particle = new THREE.Mesh(geometry, material);
		particle.position.set(
			centerX + Math.random() * 1.2 - 0.6,
			Math.random() * 1.3 + 0.3,
			centerZ + Math.random() * 1.2 - 0.6
		);
		particle.userData.velocity = {
			x: Math.random() * 0.22 - 0.11,
			y: Math.random() * 0.28 + 0.16,
			z: Math.random() * 0.22 - 0.11,
		};
		particle.userData.rotation = {
			x: (Math.random() - 0.5) * 0.14,
			y: (Math.random() - 0.5) * 0.14,
			z: (Math.random() - 0.5) * 0.14,
		};
		particleGroup.add(particle);
		particles.push(particle);
	}

	const flashGeometry = new THREE.SphereGeometry(0.7, 10, 8);
	const flashMaterial = new THREE.MeshBasicMaterial({
		color: 0xFFFFFF,
		transparent: true,
		opacity: 0.8,
		wireframe: true,
	});
	const flash = new THREE.Mesh(flashGeometry, flashMaterial);
	flash.position.set(centerX, 0.6, centerZ);
	flash.scale.set(1.05, 0.55, 1.05);
	particleGroup.add(flash);
	particles.push(flash);

	let lifetime = 0;
	let animationFrameId = null;
	const maxLifetime = isLowProfile ? 16 : 22;
	const startTime = Date.now();

	const cleanup = () => {
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		activeExplosionIds.delete(effectId);
		if (!particleGroup || !gameState.scene) return;
		gameState.scene.remove(particleGroup);
		for (const particle of particles) {
			if (particle.geometry) particle.geometry.dispose();
			if (particle.material) {
				if (Array.isArray(particle.material)) particle.material.forEach(m => m.dispose());
				else particle.material.dispose();
			}
		}
		particles.length = 0;
	};

	const animate = () => {
		if (Date.now() - startTime > 1400) {
			cleanup();
			return;
		}
		lifetime++;
		for (const particle of particleGroup.children) {
			if (particle === flash) {
				particle.material.opacity = 0.8 * Math.max(0, 1 - (lifetime * 2 / 30));
				particle.scale.multiplyScalar(1.02);
				continue;
			}
			particle.position.x += particle.userData.velocity.x;
			particle.position.y += particle.userData.velocity.y;
			particle.position.z += particle.userData.velocity.z;
			if (particle.userData.rotation) {
				particle.rotation.x += particle.userData.rotation.x;
				particle.rotation.y += particle.userData.rotation.y;
				particle.rotation.z += particle.userData.rotation.z;
			}
			particle.userData.velocity.y -= 0.017;
			if (particle.material) {
				particle.material.opacity = 0.9 * (1 - lifetime / maxLifetime);
			}
		}
		if (lifetime < maxLifetime) {
			animationFrameId = requestAnimationFrame(animate);
		} else {
			cleanup();
		}
	};

	animate();
	setTimeout(() => { if (animationFrameId) cleanup(); }, 1800);
}

export function showSandDissolveFallAnimation(x, z, shape, gameState) {
	const THREE = getTHREE();
	if (!gameState?.scene || !shape) return;

	const particleGroup = new THREE.Group();
	particleGroup.name = `sand-dissolve-${Date.now()}`;
	gameState.scene.add(particleGroup);

	const absPos = translatePosition({ x, z }, gameState, true);
	const particles = [];
	const sandPalette = [0xE5D3A1, 0xD9C58A, 0xBDA469, 0x9F8754];

	for (let row = 0; row < shape.length; row++) {
		for (let col = 0; col < shape[row].length; col++) {
			if (shape[row][col] !== 1) continue;
			const cellX = absPos.x + col + 0.5;
			const cellZ = absPos.z + row + 0.5;
			for (let i = 0; i < 16; i++) {
				const size = 0.05 + Math.random() * 0.06;
				const geo = new THREE.BoxGeometry(size, size, size);
				const mat = new THREE.MeshBasicMaterial({
					color: sandPalette[Math.floor(Math.random() * sandPalette.length)],
					transparent: true,
					opacity: 0.95,
				});
				const p = new THREE.Mesh(geo, mat);
				p.position.set(
					cellX + (Math.random() - 0.5) * 0.85,
					0.4 + Math.random() * 0.5,
					cellZ + (Math.random() - 0.5) * 0.85
				);
				p.userData.velocity = {
					x: (Math.random() - 0.5) * 0.045,
					y: -(0.08 + Math.random() * 0.08),
					z: (Math.random() - 0.5) * 0.045,
				};
				p.userData.spin = {
					x: (Math.random() - 0.5) * 0.12,
					y: (Math.random() - 0.5) * 0.12,
					z: (Math.random() - 0.5) * 0.12,
				};
				particleGroup.add(p);
				particles.push(p);
			}
		}
	}

	let frame = 0;
	const maxFrames = 65;
	let animationFrameId = null;

	const cleanup = () => {
		if (animationFrameId) cancelAnimationFrame(animationFrameId);
		if (gameState.scene) gameState.scene.remove(particleGroup);
		for (const p of particles) {
			if (p.geometry) p.geometry.dispose();
			if (p.material) p.material.dispose();
		}
		particles.length = 0;
	};

	// Sand-dissolves used to call `renderer.render(scene, camera)` on
	// every RAF tick. With a row of cells decaying at once (40+ in the
	// island-decay throttle) that meant 40+ extra render passes per
	// frame — which is exactly the lag the user noticed when "lots of
	// dissolving was going on". The main game loop renders the scene
	// once per frame, which already includes every particle in it.
	// Skipping the local re-render here means a 40-cell decay costs
	// roughly 40× LESS GPU than before.
	const animate = () => {
		frame++;
		const t = frame / maxFrames;
		for (const p of particles) {
			p.position.x += p.userData.velocity.x;
			p.position.y += p.userData.velocity.y;
			p.position.z += p.userData.velocity.z;
			p.userData.velocity.y -= 0.0045;
			p.userData.velocity.x *= 0.985;
			p.userData.velocity.z *= 0.985;
			p.rotation.x += p.userData.spin.x;
			p.rotation.y += p.userData.spin.y;
			p.rotation.z += p.userData.spin.z;
			if (p.material) p.material.opacity = Math.max(0, 0.95 * (1 - t));
			p.scale.multiplyScalar(0.992);
		}

		if (frame < maxFrames) {
			animationFrameId = requestAnimationFrame(animate);
		} else {
			cleanup();
		}
	};

	animate();
	setTimeout(cleanup, 2500);
}

export function showPlacementEffect(x, z, gameState) {
	const THREE = getTHREE();
	if (!THREE) return;
	const targetScene = gameState?.scene;
	if (!targetScene) return;

	const absPos = translatePosition({ x, z }, gameState, true);
	const effectX = absPos.x;
	const effectZ = absPos.z;

	const particleCount = 12;
	const particleGroup = new THREE.Group();
	targetScene.add(particleGroup);

	const playerColour = gameState.playerColor || 0x44AAFF;

	for (let i = 0; i < particleCount; i++) {
		const size = Math.random() * 0.12 + 0.05;
		const geometry = new THREE.BoxGeometry(size, size, size);
		const material = new THREE.MeshBasicMaterial({
			color: playerColour,
			transparent: true,
			opacity: 0.7,
		});

		const particle = new THREE.Mesh(geometry, material);
		particle.position.set(
			effectX + Math.random() - 0.5,
			0.5,
			effectZ + Math.random() - 0.5
		);
		particle.userData.velocity = {
			x: (Math.random() - 0.5) * 0.1,
			y: Math.random() * 0.25 + 0.1,
			z: (Math.random() - 0.5) * 0.1,
		};
		particleGroup.add(particle);
	}

	let lifetime = 0;
	const animate = () => {
		lifetime++;
		for (const particle of particleGroup.children) {
			particle.position.x += particle.userData.velocity.x;
			particle.position.y += particle.userData.velocity.y;
			particle.position.z += particle.userData.velocity.z;
			particle.userData.velocity.y -= 0.012;
			if (particle.material) {
				particle.material.opacity = Math.max(0, 0.7 - (lifetime / 18));
			}
		}
		if (lifetime < 18) {
			requestAnimationFrame(animate);
		} else {
			try {
				targetScene.remove(particleGroup);
				for (const p of particleGroup.children) {
					if (p.geometry) p.geometry.dispose();
					if (p.material) p.material.dispose();
				}
			} catch (_e) { /* cleanup best effort */ }
		}
	};
	animate();
}

// Maximum length (in cells) of any cleared-line highlight bar.
// A row clear only requires 8 consecutive filled cells, so clamping the
// flash to roughly that length keeps it visually tied to the action
// instead of stretching across the entire shared-world board.
const CLEARED_LINE_MAX_LENGTH = 12;

/**
 * Briefly highlight rows / columns that the server has just cleared.
 * Used by the `row_cleared` socket handler.
 *
 * The bar is drawn around the local player's king (if known) so it is
 * always visible to the player who triggered the clear, and it is
 * clamped to a short length so it doesn't span the whole shared world.
 */
export function highlightClearedLines(rowIndices, colIndices, gameState) {
	const THREE = getTHREE();
	const scene = gameState?.scene;
	if (!THREE || !scene) return;

	// Centre the flash on the local king if available — otherwise fall
	// back to the camera target / board centre so it still appears in
	// the viewport.
	const king = (typeof gameState?.localPlayerId === 'string')
		? findLocalKing(gameState)
		: null;
	const camera = gameState?.camera;
	const fallbackX = king?.x ?? camera?.position?.x ?? 0;
	const fallbackZ = king?.z ?? camera?.position?.z ?? 0;
	const board = gameState?.board || {};
	const halfLen = CLEARED_LINE_MAX_LENGTH / 2;

	const spawnBar = (axis, lineCoord) => {
		const along = axis === 'row' ? fallbackX : fallbackZ;
		const minAlong = axis === 'row'
			? (board.minX ?? along - halfLen)
			: (board.minZ ?? along - halfLen);
		const maxAlong = axis === 'row'
			? (board.maxX ?? along + halfLen)
			: (board.maxZ ?? along + halfLen);
		const start = Math.max(minAlong, along - halfLen);
		const end = Math.min(maxAlong, along + halfLen);
		const length = Math.max(end - start + 1, 1);
		const centreAlong = (start + end) / 2;

		const sizeX = axis === 'row' ? length : 0.9;
		const sizeZ = axis === 'row' ? 0.9 : length;
		const px = axis === 'row' ? centreAlong : lineCoord;
		const pz = axis === 'row' ? lineCoord : centreAlong;

		const geometry = new THREE.PlaneGeometry(sizeX, sizeZ);
		const material = new THREE.MeshBasicMaterial({
			color: 0x00ffff,
			transparent: true,
			opacity: 0.4,
			side: THREE.DoubleSide,
			depthWrite: false,
		});
		const highlight = new THREE.Mesh(geometry, material);
		highlight.position.set(px, 0.12, pz);
		highlight.rotation.x = -Math.PI / 2;
		scene.add(highlight);

		const startTime = Date.now();
		const duration = 600;
		const tick = () => {
			const elapsed = Date.now() - startTime;
			if (elapsed < duration) {
				material.opacity = 0.4 * (1 - elapsed / duration);
				requestAnimationFrame(tick);
			} else {
				scene.remove(highlight);
				geometry.dispose();
				material.dispose();
			}
		};
		tick();
	};

	(rowIndices || []).forEach(z => spawnBar('row', z));
	(colIndices || []).forEach(x => spawnBar('col', x));
}

function findLocalKing(gameState) {
	const pieces = Array.isArray(gameState?.chessPieces) ? gameState.chessPieces : [];
	const local = String(gameState.localPlayerId);
	for (const piece of pieces) {
		if (!piece) continue;
		const type = String(piece.type || piece.pieceType || '').toUpperCase();
		if (type === 'KING' && String(piece.player) === local) return piece;
	}
	return null;
}

export function highlightClearedRows(rowIndices, gameState) {
	highlightClearedLines(rowIndices || [], [], gameState);
}

/**
 * Pre-clear flash: pulses each cell that's *about* to be cleared a few
 * times so the player can see what's going to disappear before it
 * actually goes. Driven by the server's `cells_clearing` event.
 *
 * @param {Array<{x:number,z:number}>} cells
 * @param {number} durationMs
 * @param {Object} gameState
 */
export function flashCellsBeforeClear(cells, durationMs, gameState) {
	const THREE = getTHREE();
	const scene = gameState?.scene;
	if (!THREE || !scene || !Array.isArray(cells) || cells.length === 0) return;

	const duration = Math.max(200, Number(durationMs) || 700);
	const meshes = [];

	for (const cell of cells) {
		if (!cell) continue;
		const x = Number(cell.x);
		const z = Number(cell.z);
		if (!Number.isFinite(x) || !Number.isFinite(z)) continue;

		const translated = translatePosition({ x, z }, gameState, true);
		const px = translated?.x ?? x;
		const pz = translated?.z ?? z;

		const geometry = new THREE.BoxGeometry(0.95, 0.6, 0.95);
		const material = new THREE.MeshBasicMaterial({
			color: 0xffe066,
			transparent: true,
			opacity: 0.65,
			depthWrite: false,
		});
		const mesh = new THREE.Mesh(geometry, material);
		mesh.position.set(px, 0.55, pz);
		scene.add(mesh);
		meshes.push({ mesh, geometry, material });
	}

	if (meshes.length === 0) return;

	const startTime = Date.now();
	const pulses = 3;
	const tick = () => {
		const elapsed = Date.now() - startTime;
		const progress = elapsed / duration;
		if (progress >= 1) {
			for (const { mesh, geometry, material } of meshes) {
				scene.remove(mesh);
				geometry.dispose();
				material.dispose();
			}
			return;
		}

		const pulseProgress = (progress * pulses) % 1;
		const pulse = Math.sin(pulseProgress * Math.PI);
		const opacity = 0.25 + 0.55 * pulse;

		for (const { material, mesh } of meshes) {
			material.opacity = opacity;
			mesh.scale.y = 0.6 + 0.6 * pulse;
		}

		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}

/**
 * Capture VFX: a quick red flash + dark burst at the captured cell, plus
 * a short fade-out of the *actual mesh* (when supplied) so the user
 * sees their piece *being captured* at the precise server cell instead
 * of just blinking out.
 *
 * Wired to the new server-side `chess_capture` socket event (see
 * `server/sockets/chess.js`), which carries the authoritative capture
 * position. The animation never relies on the client's stale piece
 * cache for positioning — the `(x, z)` come straight from the server.
 *
 * @param {number} x                    Server-authoritative cell x
 * @param {number} z                    Server-authoritative cell z
 * @param {Object} gameState
 * @param {Object} [options]
 * @param {Object} [options.pieceMesh]  Optional captured-piece THREE.Object3D.
 *                                      If provided, it fades out in place;
 *                                      otherwise we just play the burst.
 * @param {number} [options.color=0xff5544]  Tint for the flash.
 * @param {number} [options.lifeMs=900]      Total animation duration.
 */
export function showChessCaptureAnimation(x, z, gameState, options = {}) {
	const THREE = getTHREE();
	const scene = gameState?.scene;
	if (!THREE || !scene) return;
	if (!Number.isFinite(x) || !Number.isFinite(z)) return;

	const lifeMs = Math.max(200, Number(options.lifeMs) || 900);
	const color = Number.isFinite(options.color) ? options.color : 0xff5544;
	const absolute = translatePosition({ x, z }, gameState, true);
	const cx = absolute?.x ?? x;
	const cz = absolute?.z ?? z;

	safePlaySound('capture');

	const group = new THREE.Group();
	group.name = `chess-capture-${Date.now()}`;
	scene.add(group);

	const flashGeo = new THREE.SphereGeometry(0.55, 12, 10);
	const flashMat = new THREE.MeshBasicMaterial({
		color: 0xffffff,
		transparent: true,
		opacity: 0.95,
		depthWrite: false,
	});
	const flash = new THREE.Mesh(flashGeo, flashMat);
	flash.position.set(cx, 0.7, cz);
	group.add(flash);

	const ringGeo = new THREE.RingGeometry(0.35, 0.6, 24);
	const ringMat = new THREE.MeshBasicMaterial({
		color,
		transparent: true,
		opacity: 0.85,
		side: THREE.DoubleSide,
		depthWrite: false,
	});
	const ring = new THREE.Mesh(ringGeo, ringMat);
	ring.position.set(cx, 0.46, cz);
	ring.rotation.x = -Math.PI / 2;
	group.add(ring);

	const particleCount = 14;
	const particles = [];
	for (let i = 0; i < particleCount; i++) {
		const size = 0.07 + Math.random() * 0.09;
		const geo = new THREE.BoxGeometry(size, size, size);
		const mat = new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.95,
			depthWrite: false,
		});
		const p = new THREE.Mesh(geo, mat);
		p.position.set(cx, 0.55, cz);
		const angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.4;
		const speed = 0.07 + Math.random() * 0.08;
		p.userData.velocity = {
			x: Math.cos(angle) * speed,
			y: 0.04 + Math.random() * 0.05,
			z: Math.sin(angle) * speed,
		};
		group.add(p);
		particles.push(p);
	}

	const pieceMesh = options.pieceMesh || null;
	let pieceFadeState = null;
	if (pieceMesh) {
		const initial = [];
		pieceMesh.traverse(child => {
			if (child && child.isMesh && child.material && !Array.isArray(child.material)) {
				initial.push({
					mesh: child,
					originalOpacity: child.material.opacity,
					originalTransparent: child.material.transparent,
				});
				child.material.transparent = true;
			}
		});
		pieceFadeState = { initial };
	}

	const start = Date.now();
	let animationFrameId = null;

	const cleanup = () => {
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		try {
			scene.remove(group);
			flashGeo.dispose();
			flashMat.dispose();
			ringGeo.dispose();
			ringMat.dispose();
			for (const p of particles) {
				if (p.geometry) p.geometry.dispose();
				if (p.material) p.material.dispose();
			}
		} catch (_err) { /* best-effort cleanup */ }
		if (pieceFadeState) {
			for (const entry of pieceFadeState.initial) {
				try {
					if (entry.mesh && entry.mesh.material) {
						entry.mesh.material.opacity = entry.originalOpacity ?? 1;
						entry.mesh.material.transparent = !!entry.originalTransparent;
					}
				} catch (_err) { /* leave restoration best-effort */ }
			}
		}
	};

	const animate = () => {
		const elapsed = Date.now() - start;
		const t = Math.min(1, elapsed / lifeMs);

		flash.scale.setScalar(1 + t * 1.6);
		flash.material.opacity = 0.95 * (1 - t);

		ring.scale.setScalar(1 + t * 1.8);
		ring.material.opacity = 0.85 * (1 - t);

		for (const p of particles) {
			p.position.x += p.userData.velocity.x;
			p.position.y += p.userData.velocity.y;
			p.position.z += p.userData.velocity.z;
			p.userData.velocity.y -= 0.005;
			if (p.material) p.material.opacity = 0.95 * (1 - t);
		}

		if (pieceFadeState) {
			for (const entry of pieceFadeState.initial) {
				if (entry.mesh && entry.mesh.material) {
					entry.mesh.material.opacity = Math.max(0, (entry.originalOpacity ?? 1) * (1 - t));
				}
			}
		}

		if (t < 1) {
			animationFrameId = requestAnimationFrame(animate);
		} else {
			cleanup();
		}
	};

	animate();
	setTimeout(() => { if (animationFrameId) cleanup(); }, lifeMs + 250);
}

// Expose a small helper on window so legacy debugging panels can poke at
// the sand-dissolve effect directly.  Mounted lazily so we don't blow up
// in non-browser test environments.
if (typeof window !== 'undefined') {
	window.showExplosionAnimation = showExplosionAnimation;
	window.showSandDissolveCellAnimation = (x, z, gameState) => {
		showSandDissolveFallAnimation(x, z, [[1]], gameState);
	};
	window.showChessCaptureAnimation = showChessCaptureAnimation;
}
