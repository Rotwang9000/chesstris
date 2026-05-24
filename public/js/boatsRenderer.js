/**
 * Viking longship renderer.
 *
 * Materialises the server's `boats_update` stream into 3D
 * longships drifting around the playable area. The sails carry
 * advertiser images when available — this is the simpler
 * advertising surface that the user asked us to replace the heavy
 * sponsored-cell mechanic with.
 *
 * Lifecycle:
 *   • `initBoatGroup(scene)` creates the boat group lazily.
 *   • `syncBoats(boats)` reconciles the visible boats with the
 *     latest server snapshot, creating/removing meshes as needed.
 *     Position changes are interpolated rather than snapped so the
 *     boats glide between updates instead of teleporting.
 *   • `animateBoats(timeSec)` bobs each boat on the swell and
 *     advances the interpolation toward the latest target.
 *
 * Boats are intentionally simple primitives — we want them to read
 * as "viking longships" without spending the per-frame budget that
 * a chess piece does.
 */

import { getTHREE, getScene, getCamera } from './gameContext.js';

let boatGroup = null;
const boatVisuals = new Map(); // id → { root, sailMesh, advertiser, ... }
let sailTextureCache = new Map(); // cacheKey → THREE.Texture

const LERP_DEFAULT_MS = 600;
const BOB_AMP_DEFAULT = 0.18;

// 1.8 wide × 1.4 tall sail; we render the texture at 360 × 280 so the
// strokes look crisp without blowing GPU memory.
const SAIL_TEX_W = 360;
const SAIL_TEX_H = 280;

/**
 * Lazy-create the boat group inside the active scene so we don't
 * pollute the graph until the first snapshot arrives.
 */
function ensureBoatGroup() {
	if (boatGroup) return boatGroup;
	const THREE = getTHREE();
	const scene = getScene();
	if (!THREE || !scene) return null;
	boatGroup = new THREE.Group();
	boatGroup.name = 'boatFleet';
	scene.add(boatGroup);
	return boatGroup;
}

/**
 * Build a single longship mesh: hull, mast, sail, dragon prow,
 * a row of shields along the hull.
 *
 * Returns the root group + a reference to the sail mesh so we can
 * swap its texture when the boat's advertiser changes.
 */
function buildLongship(THREE) {
	const group = new THREE.Group();

	const woodMat = new THREE.MeshStandardMaterial({
		color: 0x6b4321,
		roughness: 0.9,
		metalness: 0.05,
	});
	const darkWoodMat = woodMat.clone();
	darkWoodMat.color = new THREE.Color(0x4a2d18);

	// Hull — flattened, elongated box with rounded ends approximated
	// by two cones poking out the front and back.
	const hullLength = 4.4;
	const hullWidth = 1.1;
	const hullHeight = 0.55;
	const hull = new THREE.Mesh(
		new THREE.BoxGeometry(hullWidth, hullHeight, hullLength),
		woodMat
	);
	hull.position.y = 0.15;
	hull.castShadow = false;
	hull.receiveShadow = false;
	group.add(hull);

	const prow = new THREE.Mesh(
		new THREE.ConeGeometry(hullWidth / 2, 1.0, 4),
		darkWoodMat
	);
	prow.rotation.x = -Math.PI / 2;
	prow.rotation.z = Math.PI / 4;
	prow.position.set(0, 0.45, hullLength / 2);
	group.add(prow);

	const stern = new THREE.Mesh(
		new THREE.ConeGeometry(hullWidth / 2, 0.7, 4),
		darkWoodMat
	);
	stern.rotation.x = Math.PI / 2;
	stern.rotation.z = Math.PI / 4;
	stern.position.set(0, 0.4, -hullLength / 2);
	group.add(stern);

	// Mast — vertical pole.
	const mast = new THREE.Mesh(
		new THREE.CylinderGeometry(0.05, 0.07, 2.4, 8),
		darkWoodMat
	);
	mast.position.set(0, 1.4, 0);
	group.add(mast);

	// Spar — horizontal pole across the top of the mast.
	const spar = new THREE.Mesh(
		new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6),
		darkWoodMat
	);
	spar.rotation.z = Math.PI / 2;
	spar.position.set(0, 2.45, 0);
	group.add(spar);

	// Sail — flat rectangle hanging from the spar. Texture starts as
	// the placeholder (red/white stripes + "Your Ad Here →") and is
	// replaced by `syncBoats` once the server tells us which
	// advertiser this boat is carrying. Two-sided so the ship looks
	// the same from either heading.
	const sailGeom = new THREE.PlaneGeometry(1.8, 1.4);
	const sailMat = new THREE.MeshStandardMaterial({
		color: 0xffffff,
		side: THREE.DoubleSide,
		roughness: 0.75,
		metalness: 0.0,
		map: _buildSailTexture(THREE, null),
		transparent: false,
	});
	const sailMesh = new THREE.Mesh(sailGeom, sailMat);
	sailMesh.position.set(0, 1.7, 0);
	sailMesh.castShadow = false;
	sailMesh.receiveShadow = false;
	sailMesh.userData.isSail = true;
	group.add(sailMesh);

	// Make every descendant traceable back to the root so the click
	// raycaster can find which boat we hit even when an inner mesh
	// (sail/hull/shield) is the intersection target.
	group.userData.isBoat = true;
	group.traverse(node => { node.userData = node.userData || {}; node.userData.boatRoot = group; });

	// Decorative shield strip along each side of the hull.
	const shieldGeo = new THREE.CircleGeometry(0.18, 12);
	const shieldColours = [0xc62828, 0xfbc02d, 0x37474f, 0xfbe9e7];
	const shieldCount = 6;
	for (let side = -1; side <= 1; side += 2) {
		for (let i = 0; i < shieldCount; i++) {
			const t = (i / (shieldCount - 1)) - 0.5;
			const shieldMat = new THREE.MeshStandardMaterial({
				color: shieldColours[i % shieldColours.length],
				roughness: 0.8,
				metalness: 0.1,
			});
			const shield = new THREE.Mesh(shieldGeo, shieldMat);
			shield.position.set(side * (hullWidth / 2 + 0.001), 0.25, t * (hullLength - 0.8));
			shield.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
			group.add(shield);
		}
	}

	return { group, sailMesh };
}

/**
 * Build the per-sail canvas used as a texture. The sail always shows
 * a red/white viking stripe pattern as the background; if the
 * advertiser carries an image we draw it on top, and if they have a
 * name/text we paint that in a dark banner along the bottom so the
 * brand is always legible.
 *
 * Returns the canvas (caller wraps it in a CanvasTexture).
 */
function _drawSailCanvas(advertiser) {
	const canvas = document.createElement('canvas');
	canvas.width = SAIL_TEX_W;
	canvas.height = SAIL_TEX_H;
	const ctx = canvas.getContext('2d');

	const isPlaceholder = !advertiser || advertiser.placeholder === true;

	ctx.fillStyle = '#f8f0e3';
	ctx.fillRect(0, 0, SAIL_TEX_W, SAIL_TEX_H);
	ctx.fillStyle = isPlaceholder ? '#b71c1c' : '#7b2e2e';
	const stripeCount = 4;
	const stripeH = SAIL_TEX_H / (stripeCount * 2 + 1);
	for (let i = 0; i < stripeCount; i++) {
		ctx.fillRect(0, stripeH + i * stripeH * 2, SAIL_TEX_W, stripeH);
	}

	const brand = (advertiser && (advertiser.name || advertiser.adText)) || '';
	if (brand) {
		const bannerH = Math.round(SAIL_TEX_H * 0.32);
		const bannerY = SAIL_TEX_H - bannerH;
		ctx.fillStyle = 'rgba(20, 20, 20, 0.78)';
		ctx.fillRect(0, bannerY, SAIL_TEX_W, bannerH);
		ctx.fillStyle = isPlaceholder ? '#ffd54f' : '#fff8e1';
		ctx.font = `700 ${Math.round(bannerH * 0.45)}px "Trebuchet MS", "Arial", sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const label = brand.length > 22 ? brand.slice(0, 21) + '…' : brand;
		ctx.fillText(label, SAIL_TEX_W / 2, bannerY + bannerH / 2);
	}

	return canvas;
}

/**
 * Compose a sail texture for an advertiser. When the advertiser
 * carries an image we draw the image on top of the stripe pattern.
 * Falls back to the procedural stripes + name banner when no image
 * is available (placeholder case).
 *
 * Cached per advertiser-id so we don't redraw and re-upload the
 * same canvas for every boat.
 */
function _buildSailTexture(THREE, advertiser) {
	const cacheKey = `${advertiser?.id || 'default'}::${advertiser?.adImage || ''}`;
	const cached = sailTextureCache.get(cacheKey);
	if (cached) return cached;

	const baseCanvas = _drawSailCanvas(advertiser);
	const texture = new THREE.CanvasTexture(baseCanvas);
	texture.colorSpace = THREE.SRGBColorSpace || texture.colorSpace;
	texture.needsUpdate = true;
	sailTextureCache.set(cacheKey, texture);

	const adImage = advertiser?.adImage;
	if (adImage) {
		// Draw the image onto the same canvas asynchronously, then
		// refresh the texture. We deliberately blit on TOP of the
		// stripes so the brand banner along the bottom remains
		// legible.
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			try {
				const ctx = baseCanvas.getContext('2d');
				// Leave room for the brand banner at the bottom.
				const targetH = Math.round(SAIL_TEX_H * 0.68);
				const aspect = img.width / img.height;
				let drawW = SAIL_TEX_W;
				let drawH = SAIL_TEX_W / aspect;
				if (drawH > targetH) {
					drawH = targetH;
					drawW = targetH * aspect;
				}
				const dx = (SAIL_TEX_W - drawW) / 2;
				const dy = (targetH - drawH) / 2;
				ctx.drawImage(img, dx, dy, drawW, drawH);
				// Redraw the brand banner so it sits above the image.
				const brand = (advertiser.name || advertiser.adText) || '';
				if (brand) {
					const bannerH = Math.round(SAIL_TEX_H * 0.32);
					const bannerY = SAIL_TEX_H - bannerH;
					ctx.fillStyle = 'rgba(20, 20, 20, 0.78)';
					ctx.fillRect(0, bannerY, SAIL_TEX_W, bannerH);
					ctx.fillStyle = '#fff8e1';
					ctx.font = `700 ${Math.round(bannerH * 0.45)}px "Trebuchet MS", "Arial", sans-serif`;
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';
					const label = brand.length > 22 ? brand.slice(0, 21) + '…' : brand;
					ctx.fillText(label, SAIL_TEX_W / 2, bannerY + bannerH / 2);
				}
				texture.needsUpdate = true;
			} catch (err) {
				console.warn('[boats] failed to composite ad image onto sail:', err && err.message);
			}
		};
		img.onerror = () => {
			console.warn('[boats] sail image failed to load:', adImage);
		};
		img.src = adImage;
	}

	return texture;
}

/**
 * Initialise the boat group inside the current scene. Safe to call
 * multiple times — subsequent calls are no-ops.
 *
 * @returns {boolean} true once the group is alive
 */
export function initBoatGroup() {
	return !!ensureBoatGroup();
}

/**
 * Reconcile the visible boats with the server snapshot. Add new
 * boats, remove vanished ones, and update target positions on
 * existing ones for the next interpolation pass.
 *
 * @param {Array} boats — the `boats` array from a `boats_update`
 *     payload.
 */
export function syncBoats(boats) {
	const THREE = getTHREE();
	const group = ensureBoatGroup();
	if (!THREE || !group) return;

	const list = Array.isArray(boats) ? boats : [];
	const seen = new Set();

	for (const boat of list) {
		if (!boat || !boat.id) continue;
		seen.add(boat.id);

		let entry = boatVisuals.get(boat.id);
		if (!entry) {
			const built = buildLongship(THREE);
			group.add(built.group);
			entry = {
				root: built.group,
				sailMesh: built.sailMesh,
				adKey: null,
				prev: {
					x: boat.position?.x ?? 0,
					y: boat.position?.y ?? -1.8,
					z: boat.position?.z ?? 0,
				},
				target: {
					x: boat.position?.x ?? 0,
					y: boat.position?.y ?? -1.8,
					z: boat.position?.z ?? 0,
				},
				heading: boat.heading ?? 0,
				bobPhase: Math.random() * Math.PI * 2,
				bobAmp: BOB_AMP_DEFAULT * (0.8 + Math.random() * 0.4),
				lerpT: 1,
				lerpDur: LERP_DEFAULT_MS,
				lerpedAt: performance.now(),
			};
			boatVisuals.set(boat.id, entry);
		} else {
			// Promote current visible position to prev and snap target
			// to the new server position. The animator will glide
			// between them over `lerpDur`.
			entry.prev = { ...entry.root.position };
			entry.target = {
				x: boat.position?.x ?? entry.target.x,
				y: boat.position?.y ?? entry.target.y,
				z: boat.position?.z ?? entry.target.z,
			};
			entry.lerpT = 0;
			entry.lerpedAt = performance.now();
			if (Number.isFinite(boat.heading)) entry.heading = boat.heading;
		}

		// Swap sail texture if the advertiser changed. We key off the
		// advertiser id + image so re-issuing the same advertiser
		// (e.g. after rotation) doesn't trigger an avoidable redraw.
		const advertiser = boat.advertiser || null;
		const adKey = `${advertiser?.id || 'default'}::${advertiser?.adImage || ''}`;
		if (adKey !== entry.adKey) {
			entry.adKey = adKey;
			entry.advertiser = advertiser;
			entry.root.userData.advertiser = advertiser;
			const tex = _buildSailTexture(THREE, advertiser);
			if (tex && entry.sailMesh && entry.sailMesh.material) {
				entry.sailMesh.material.map = tex;
				entry.sailMesh.material.needsUpdate = true;
			}
		}
	}

	// Remove boats that the server no longer reports.
	for (const [id, entry] of boatVisuals.entries()) {
		if (seen.has(id)) continue;
		group.remove(entry.root);
		entry.root.traverse(node => {
			if (node.geometry && typeof node.geometry.dispose === 'function') node.geometry.dispose();
			if (node.material) {
				if (Array.isArray(node.material)) node.material.forEach(m => m && m.dispose && m.dispose());
				else if (typeof node.material.dispose === 'function') node.material.dispose();
			}
		});
		boatVisuals.delete(id);
	}
}

/**
 * Per-frame animation. Interpolates each boat from its previous
 * position to the latest target and adds a gentle bob on the sea
 * swell so the boats don't look static between server snapshots.
 *
 * @param {number} timeSec  performance.now() / 1000
 */
export function animateBoats(timeSec) {
	const now = performance.now();
	for (const entry of boatVisuals.values()) {
		const root = entry.root;
		const elapsed = now - entry.lerpedAt;
		const t = Math.min(1, elapsed / entry.lerpDur);
		const ease = t * t * (3 - 2 * t);
		const px = entry.prev.x + (entry.target.x - entry.prev.x) * ease;
		const pz = entry.prev.z + (entry.target.z - entry.prev.z) * ease;
		const py = entry.prev.y + (entry.target.y - entry.prev.y) * ease;
		root.position.set(px, py + Math.sin(timeSec * 0.8 + entry.bobPhase) * entry.bobAmp, pz);
		root.rotation.y = entry.heading;
		root.rotation.z = Math.sin(timeSec * 0.55 + entry.bobPhase * 0.7) * 0.04;
		root.rotation.x = Math.sin(timeSec * 0.45 + entry.bobPhase * 0.3) * 0.03;
	}
}

/**
 * Resolve a click on the canvas to the advertiser whose boat was
 * hit, if any. Used by the input layer to open the ad's landing
 * page when the user clicks a sailing longship. Pure geometry —
 * doesn't open links itself.
 *
 * @param {THREE.Vector2} mouse  NDC mouse position (-1..1)
 * @returns {{ advertiser: object|null, boatId: string|null }|null}
 *          The clicked advertiser + boat id, or null if no boat
 *          was hit.
 */
export function tryBoatClick(mouse) {
	if (!boatGroup || boatGroup.children.length === 0) return null;
	const THREE = getTHREE();
	const camera = getCamera();
	if (!THREE || !camera || !mouse) return null;
	const raycaster = new THREE.Raycaster();
	raycaster.setFromCamera(mouse, camera);
	const hits = raycaster.intersectObject(boatGroup, true);
	if (hits.length === 0) return null;

	for (const hit of hits) {
		let root = hit.object;
		while (root && !root.userData?.isBoat) root = root.parent;
		if (!root) continue;
		let boatId = null;
		for (const [id, entry] of boatVisuals.entries()) {
			if (entry.root === root) { boatId = id; break; }
		}
		return {
			advertiser: root.userData?.advertiser || null,
			boatId,
		};
	}
	return null;
}

/**
 * Best-effort cleanup so a profile switch (cute/retro) doesn't
 * leave a fleet of boats stranded in a re-themed scene.
 */
export function disposeBoats() {
	if (!boatGroup) return;
	const scene = getScene();
	if (scene) scene.remove(boatGroup);
	for (const entry of boatVisuals.values()) {
		entry.root.traverse(node => {
			if (node.geometry && typeof node.geometry.dispose === 'function') node.geometry.dispose();
			if (node.material) {
				if (Array.isArray(node.material)) node.material.forEach(m => m && m.dispose && m.dispose());
				else if (typeof node.material.dispose === 'function') node.material.dispose();
			}
		});
	}
	boatVisuals.clear();
	for (const tex of sailTextureCache.values()) {
		if (tex && typeof tex.dispose === 'function') tex.dispose();
	}
	sailTextureCache = new Map();
	boatGroup = null;
}
