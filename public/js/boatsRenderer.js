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

import { getTHREE, getScene, getCamera, getGameState } from './gameContext.js';

let boatGroup = null;
const boatVisuals = new Map(); // id → { root, sailMesh, advertiser, ... }
let sailTextureCache = new Map(); // cacheKey → THREE.Texture
let lastBuildProfile = null;     // 'normal' | 'cute' | 'retro' — rebuild boats when this changes

const LERP_DEFAULT_MS = 600;
const BOB_AMP_DEFAULT = 0.18;

// Whole-fleet scale. The longships used to be roughly cell-sized,
// which made the sail-mounted ads hard to read and left no room
// for a passenger model. 1.7 ≈ a fishing trawler next to a cell.
const BOAT_SCALE = 1.7;
// Distance-based fade + cull. The default camera sits ≈60 units
// from the play-area centre, and a boat at the far edge of the
// wander box (±26) can already be 90 units from the camera. We
// therefore keep boats fully opaque up to BOAT_FADE_NEAR (90),
// fade linearly to 0 between BOAT_FADE_FAR (130) and
// BOAT_FAR_HIDE (160), and skip submitting them entirely past
// the hide threshold. Tune these numbers if the play area, fog
// density, or camera distance ever change appreciably.
const BOAT_FADE_NEAR = 90;
const BOAT_FADE_FAR = 130;
const BOAT_FAR_HIDE = 160;

// 1.8 wide × 1.4 tall sail (pre-scale); render texture at this
// resolution so it reads crisply when blown up by BOAT_SCALE.
const SAIL_TEX_W = 480;
const SAIL_TEX_H = 360;

function _resolveRenderProfile() {
	const gs = getGameState();
	if (!gs) return 'normal';
	if (gs.renderProfile) return gs.renderProfile;
	if (gs.retroMode) return 'retro';
	if (gs.lowQuality) return 'cute';
	return 'normal';
}

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
/**
 * Per-profile colour + material palette. Pulling this out keeps
 * `buildLongship` shaped like a recipe instead of a thicket of
 * if/else branches on every mesh.
 */
function _profilePalette(THREE, profile) {
	if (profile === 'retro') {
		return {
			isRetro: true,
			isCute: false,
			hullColor: 0x6b4321,
			hullDark: 0x4a2d18,
			shieldColours: [0xc62828, 0xfbc02d, 0x37474f, 0xfbe9e7, 0x2e7d32, 0x4527a0],
			roughness: 1.0,
			flatShading: true,
			sailPixelated: true,
			ropeColor: 0x3e2a18,
			detail: 0, // skip rigging / oars
		};
	}
	if (profile === 'cute') {
		return {
			isRetro: false,
			isCute: true,
			hullColor: 0xe8a679,           // warm sandy plank
			hullDark: 0xc8835a,
			shieldColours: [0xff8a80, 0xffd180, 0x80d8ff, 0xb9f6ca, 0xea80fc, 0xffe57f],
			roughness: 0.6,
			flatShading: false,
			sailPixelated: false,
			ropeColor: 0x8d6e63,
			detail: 1, // simple rigging + chubby dragon head
		};
	}
	return {
		// 'normal'
		isRetro: false,
		isCute: false,
		hullColor: 0x5c3a1d,
		hullDark: 0x331e0c,
		shieldColours: [0xc62828, 0xfbc02d, 0x2e7d32, 0xf8f1e0, 0x4527a0, 0x00838f],
		roughness: 0.75,
		flatShading: false,
		sailPixelated: false,
		ropeColor: 0x2a1c10,
		detail: 2, // rigging + oars + dragon head + waterline trim
	};
}

function buildLongship(THREE, profile = 'normal') {
	const pal = _profilePalette(THREE, profile);
	const isRetro = pal.isRetro;
	const isCute = pal.isCute;
	const group = new THREE.Group();

	const woodMat = new THREE.MeshStandardMaterial({
		color: pal.hullColor,
		roughness: pal.roughness,
		metalness: 0.0,
		flatShading: pal.flatShading,
	});
	const darkWoodMat = woodMat.clone();
	darkWoodMat.color = new THREE.Color(pal.hullDark);
	const ropeMat = new THREE.MeshStandardMaterial({
		color: pal.ropeColor,
		roughness: 0.95,
		metalness: 0.0,
	});

	// Hull. Cute mode swaps the rectangular box for a soft
	// rounded-bar (capsule-like) hull so the boat reads as a
	// friendly bath-toy rather than a war vessel.
	const hullLength = 4.4;
	const hullWidth = 1.3;
	const hullHeight = 0.7;
	let hull;
	if (isCute) {
		const hullGeom = new THREE.CapsuleGeometry(hullWidth / 2, hullLength * 0.55, 4, 12);
		hullGeom.rotateZ(Math.PI / 2); // capsule's long axis becomes Z
		hullGeom.rotateY(Math.PI / 2);
		hull = new THREE.Mesh(hullGeom, woodMat);
		hull.scale.set(1, 0.55, 1); // flatten so it sits low in the water
	} else {
		hull = new THREE.Mesh(
			new THREE.BoxGeometry(hullWidth, hullHeight, hullLength),
			woodMat
		);
	}
	hull.position.y = 0.2;
	group.add(hull);

	// Waterline trim — a thin coloured band running along the hull
	// for normal mode so the wood doesn't look like a plain block.
	if (pal.detail >= 2) {
		const trimMat = new THREE.MeshStandardMaterial({
			color: 0x8c5a2e,
			roughness: 0.8,
			metalness: 0.05,
		});
		const trim = new THREE.Mesh(
			new THREE.BoxGeometry(hullWidth + 0.02, 0.08, hullLength + 0.4),
			trimMat
		);
		trim.position.set(0, 0.42, 0);
		group.add(trim);
	}

	// Prow / stern — 4-sided cones, or rounded cones in cute mode so
	// they look like soft bumpers.
	const prowSegments = isCute ? 16 : 4;
	const prow = new THREE.Mesh(
		new THREE.ConeGeometry(hullWidth / 2, isCute ? 0.9 : 1.2, prowSegments),
		darkWoodMat
	);
	prow.rotation.x = -Math.PI / 2;
	if (!isCute) prow.rotation.z = Math.PI / 4;
	prow.position.set(0, isCute ? 0.45 : 0.55, hullLength / 2);
	group.add(prow);

	const stern = new THREE.Mesh(
		new THREE.ConeGeometry(hullWidth / 2, isCute ? 0.7 : 0.9, prowSegments),
		darkWoodMat
	);
	stern.rotation.x = Math.PI / 2;
	if (!isCute) stern.rotation.z = Math.PI / 4;
	stern.position.set(0, isCute ? 0.4 : 0.5, -hullLength / 2);
	group.add(stern);

	// Dragon-head finial on the prow (skip in retro). In cute mode
	// it's a fat round head with two googly eyes; in normal it's the
	// pointy dragon snout.
	if (!isRetro) {
		const headColour = isCute ? 0xffb74d : 0xb71c1c;
		const headMat = new THREE.MeshStandardMaterial({
			color: headColour,
			roughness: 0.7,
			metalness: 0.1,
		});
		const head = isCute
			? new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), headMat)
			: new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 4), headMat);
		if (!isCute) head.rotation.x = -Math.PI / 2;
		head.position.set(0, isCute ? 0.95 : 1.05, hullLength / 2 + (isCute ? 0.25 : 0.3));
		group.add(head);

		if (isCute) {
			// Googly eyes for the bath-toy look.
			const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
			const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
			for (const sign of [-1, 1]) {
				const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), eyeMat);
				eye.position.set(sign * 0.10, 1.05, hullLength / 2 + 0.42);
				group.add(eye);
				const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), pupilMat);
				pupil.position.set(sign * 0.10, 1.05, hullLength / 2 + 0.49);
				group.add(pupil);
			}
		}
	}

	// Mast + spar.
	const mast = isRetro
		? new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.8, 0.14), darkWoodMat)
		: new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.8, 12), darkWoodMat);
	mast.position.set(0, 1.7, 0);
	group.add(mast);

	const spar = isRetro
		? new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.1), darkWoodMat)
		: new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 12), darkWoodMat);
	if (!isRetro) spar.rotation.z = Math.PI / 2;
	spar.position.set(0, 3.0, 0);
	group.add(spar);

	// Rigging — two diagonal ropes from spar ends to the prow/stern
	// deck. Adds depth to the silhouette in cute/normal mode.
	if (pal.detail >= 1) {
		const ropeLength = Math.hypot(1.3, 2.5);
		for (const sx of [-1, 1]) {
			for (const sz of [-1, 1]) {
				const rope = new THREE.Mesh(
					new THREE.CylinderGeometry(0.012, 0.012, ropeLength, 6),
					ropeMat
				);
				rope.position.set(sx * 0.65, 1.8, sz * (hullLength / 2 - 0.2));
				rope.lookAt(0, 3.0, 0);
				rope.rotateX(Math.PI / 2);
				group.add(rope);
			}
		}
	}

	// Oars sticking out of the rowing benches (normal mode only).
	if (pal.detail >= 2) {
		const oarMat = new THREE.MeshStandardMaterial({
			color: 0xc8a36a,
			roughness: 0.85,
			metalness: 0.0,
		});
		const oarsPerSide = 4;
		for (const side of [-1, 1]) {
			for (let i = 0; i < oarsPerSide; i++) {
				const t = (i / (oarsPerSide - 1)) - 0.5;
				const oar = new THREE.Mesh(
					new THREE.CylinderGeometry(0.025, 0.04, 1.4, 6),
					oarMat
				);
				oar.position.set(
					side * (hullWidth / 2 + 0.55),
					0.15,
					t * (hullLength - 1.4)
				);
				oar.rotation.z = side * Math.PI * 0.32;
				oar.rotation.x = -0.18;
				group.add(oar);
			}
		}
	}

	// Sail. Bigger plane (2.6 × 2.0 pre-scale) so the ad is readable
	// from across the play area.
	const sailGeom = new THREE.PlaneGeometry(2.6, 2.0);
	const sailMat = new THREE.MeshStandardMaterial({
		color: 0xffffff,
		side: THREE.DoubleSide,
		roughness: isRetro ? 1.0 : 0.75,
		metalness: 0.0,
		map: _buildSailTexture(THREE, null, { pixelated: pal.sailPixelated }),
		transparent: false,
		flatShading: pal.flatShading,
	});
	const sailMesh = new THREE.Mesh(sailGeom, sailMat);
	sailMesh.position.set(0, 2.05, 0);
	sailMesh.userData.isSail = true;
	group.add(sailMesh);

	// Decorative shield strip along each side of the hull. Tiny
	// cubes for retro, round shields elsewhere — cute uses pastel
	// shields, normal uses the heraldic palette.
	const shieldCount = 7;
	for (let side = -1; side <= 1; side += 2) {
		for (let i = 0; i < shieldCount; i++) {
			const t = (i / (shieldCount - 1)) - 0.5;
			const shieldMat = new THREE.MeshStandardMaterial({
				color: pal.shieldColours[i % pal.shieldColours.length],
				roughness: isRetro ? 1.0 : 0.85,
				metalness: 0.0,
				flatShading: pal.flatShading,
			});
			const shieldGeo = isRetro
				? new THREE.BoxGeometry(0.05, 0.3, 0.3)
				: new THREE.CircleGeometry(0.22, isCute ? 18 : 12);
			const shield = new THREE.Mesh(shieldGeo, shieldMat);
			shield.position.set(side * (hullWidth / 2 + 0.001), 0.4, t * (hullLength - 0.9));
			if (!isRetro) shield.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
			group.add(shield);
		}
	}

	// Scale the whole assembly so the longship reads as a substantial
	// craft rather than a toy boat the size of a chess piece.
	group.scale.setScalar(BOAT_SCALE);

	// Tag every descendant so the click raycaster can walk back up
	// to the boat group from any child mesh; also opt all meshes
	// out of shadow casting so we don't tax the shadow map.
	group.userData.isBoat = true;
	group.userData.profile = profile;
	group.traverse(node => {
		node.userData = node.userData || {};
		node.userData.boatRoot = group;
		if (node.isMesh) {
			node.castShadow = false;
			node.receiveShadow = false;
		}
	});

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
function _buildSailTexture(THREE, advertiser, { pixelated = false } = {}) {
	const cacheKey = `${pixelated ? 'pix' : 'std'}::${advertiser?.id || 'default'}::${advertiser?.adImage || ''}`;
	const cached = sailTextureCache.get(cacheKey);
	if (cached) return cached;

	const baseCanvas = _drawSailCanvas(advertiser);
	const texture = new THREE.CanvasTexture(baseCanvas);
	texture.colorSpace = THREE.SRGBColorSpace || texture.colorSpace;
	if (pixelated) {
		// Retro look: nearest-neighbour filtering so the sail looks
		// like it was screen-printed rather than airbrushed.
		texture.magFilter = THREE.NearestFilter;
		texture.minFilter = THREE.NearestFilter;
		texture.generateMipmaps = false;
	}
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

	const profile = _resolveRenderProfile();
	// If the render profile flipped (e.g. cute → retro) tear the
	// existing boats down so we rebuild them with the right
	// geometry/texture filter on the next sync.
	if (lastBuildProfile && lastBuildProfile !== profile) {
		for (const [, entry] of boatVisuals.entries()) {
			group.remove(entry.root);
			entry.root.traverse(node => {
				if (node.geometry && typeof node.geometry.dispose === 'function') node.geometry.dispose();
				if (node.material) {
					if (Array.isArray(node.material)) node.material.forEach(m => m && m.dispose && m.dispose());
					else if (typeof node.material.dispose === 'function') node.material.dispose();
				}
			});
		}
		boatVisuals.clear();
		// Sail textures are filter-mode dependent so they have to be
		// rebuilt for the new profile too.
		for (const tex of sailTextureCache.values()) {
			if (tex && typeof tex.dispose === 'function') tex.dispose();
		}
		sailTextureCache.clear();
	}
	lastBuildProfile = profile;

	const list = Array.isArray(boats) ? boats : [];
	const seen = new Set();

	for (const boat of list) {
		if (!boat || !boat.id) continue;
		seen.add(boat.id);

		let entry = boatVisuals.get(boat.id);
		if (!entry) {
			const built = buildLongship(THREE, profile);
			group.add(built.group);
			entry = {
				root: built.group,
				sailMesh: built.sailMesh,
				adKey: null,
				prev: {
					x: boat.position?.x ?? 0,
					y: boat.position?.y ?? -1.05,
					z: boat.position?.z ?? 0,
				},
				target: {
					x: boat.position?.x ?? 0,
					y: boat.position?.y ?? -1.05,
					z: boat.position?.z ?? 0,
				},
				heading: boat.heading ?? 0,
				bobPhase: Math.random() * Math.PI * 2,
				bobAmp: BOB_AMP_DEFAULT * (0.8 + Math.random() * 0.4),
				lerpT: 1,
				lerpDur: LERP_DEFAULT_MS,
				lerpedAt: performance.now(),
				lastOpacity: 1,
			};
			boatVisuals.set(boat.id, entry);
		} else {
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
			const tex = _buildSailTexture(THREE, advertiser, { pixelated: profile === 'retro' });
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
	const camera = getCamera();
	const camPos = camera ? camera.position : null;

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

		// Distance-based culling + fade. Cheap: one squared-distance
		// per boat per frame. Beyond BOAT_FAR_HIDE the boat is
		// invisible (skip submit). Between BOAT_FADE_NEAR and
		// BOAT_FADE_FAR we tween opacity so the cull isn't a hard
		// pop. Inside BOAT_FADE_NEAR we leave the materials opaque
		// (avoids per-frame churn on transparent state).
		if (camPos) {
			const dx = root.position.x - camPos.x;
			const dy = root.position.y - camPos.y;
			const dz = root.position.z - camPos.z;
			const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
			let opacity;
			if (dist <= BOAT_FADE_NEAR) opacity = 1;
			else if (dist >= BOAT_FAR_HIDE) opacity = 0;
			else if (dist >= BOAT_FADE_FAR) {
				// 0.5 → 0 across the far-fade band
				opacity = 0.5 * Math.max(0, 1 - (dist - BOAT_FADE_FAR) / (BOAT_FAR_HIDE - BOAT_FADE_FAR));
			} else {
				// 1 → 0.5 between the near and far fade thresholds
				opacity = 1 - (dist - BOAT_FADE_NEAR) / (BOAT_FADE_FAR - BOAT_FADE_NEAR) * 0.5;
			}
			const visible = opacity > 0.01;
			if (root.visible !== visible) root.visible = visible;
			if (visible && Math.abs(opacity - entry.lastOpacity) > 0.02) {
				const wantTransparent = opacity < 0.999;
				root.traverse(node => {
					if (!node.isMesh || !node.material) return;
					const mats = Array.isArray(node.material) ? node.material : [node.material];
					for (const mat of mats) {
						if (mat.transparent !== wantTransparent) mat.transparent = wantTransparent;
						mat.opacity = opacity;
					}
				});
				entry.lastOpacity = opacity;
			}
		}
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
