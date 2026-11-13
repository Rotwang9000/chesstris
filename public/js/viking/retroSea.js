/**
 * The retro render profile's sea, Viking edition only.
 *
 * Retro had no water at all: its voxel longships floated on pure black,
 * each on a little pool of scan lines, so a moored ship and a sailing
 * one looked the same and the sea between the islands did not read as
 * sea. This lays one flat, unlit disc under the arena in the profile's
 * own vector-display look: a very dark phosphor-green body with rows of
 * broken scan-line dashes (a calm sea drawn on an old oscilloscope),
 * fading out to the black of the retro sky well beyond the arena.
 *
 * Cost: one draw call (a 48-segment disc), one canvas texture painted
 * once; per frame it only re-anchors when the camera travels far.
 */

import { vikingActive } from '../edition.js';
import { getControls } from '../gameContext.js';
import { SEA_SURFACE_Y } from '../seaLevel.js';

const NAME = 'viking-retro-sea';
const RADIUS = 80;           // world units: the arena and a margin
const TEX_PX = 1536;
const CHECK_MS = 500;

const st = { mesh: null, scene: null, lastCheck: -Infinity, anchor: null };

/** Whether the retro sea should be out. Pure: the caller passes the edition test. */
export function retroSeaWanted(gameState, isActive = vikingActive) {
	if (!gameState) return false;
	const profile = gameState.renderProfile
		|| (gameState.retroMode ? 'retro' : gameState.lowQuality ? 'cute' : 'normal');
	if (profile !== 'retro') return false;
	try { return !!isActive(gameState); } catch (_e) { return false; }
}

/** A tiny seeded PRNG, so the dashes fall the same way every time. */
function rng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function paintRetroSea(size = TEX_PX) {
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const g = c.getContext('2d');
	if (!g) return c;
	const mid = size / 2;
	// The body: a faint green glow, darkest at the rim, gone into black.
	const body = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
	body.addColorStop(0, 'rgba(0, 46, 16, 0.92)');
	body.addColorStop(0.45, 'rgba(0, 32, 11, 0.9)');
	body.addColorStop(0.8, 'rgba(0, 16, 6, 0.6)');
	body.addColorStop(1, 'rgba(0, 0, 0, 0)');
	g.fillStyle = body;
	g.fillRect(0, 0, size, size);
	// Rows of broken scan-line dashes, brighter toward the middle.
	const rand = rng(1066);
	const row = Math.max(8, Math.round(size / 70));
	const unit = size / 1536;
	for (let y = row / 2; y < size; y += row) {
		let x = rand() * 60 * unit;
		while (x < size) {
			const len = (10 + rand() * 46) * unit;
			const gap = (14 + rand() * 60) * unit;
			const cx = x + len / 2 - mid, cy = y - mid;
			const r = Math.sqrt(cx * cx + cy * cy) / mid;
			if (r < 0.97) {
				const fade = Math.pow(1 - r, 0.8);
				const crest = rand() < 0.08;
				const a = (crest ? 0.42 : 0.12 + rand() * 0.14) * fade;
				g.fillStyle = crest ? `rgba(125, 255, 156, ${a.toFixed(3)})` : `rgba(0, 255, 65, ${a.toFixed(3)})`;
				g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(len)), Math.max(1, Math.round(1.6 * unit)));
			}
			x += len + gap;
		}
	}
	return c;
}

function build(THREE) {
	const geo = new THREE.CircleGeometry(RADIUS, 48);
	geo.rotateX(-Math.PI / 2);
	const tex = new THREE.CanvasTexture(paintRetroSea());
	tex.generateMipmaps = true;
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	tex.anisotropy = 4;
	const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
	const mesh = new THREE.Mesh(geo, mat);
	mesh.name = NAME;
	// Just under the ships' pools and the sail lanes (both at the surface).
	mesh.position.y = SEA_SURFACE_Y - 0.06;
	mesh.renderOrder = -2;
	mesh.frustumCulled = false;
	mesh.userData.decorative = true;
	return mesh;
}

function remove() {
	const m = st.mesh;
	if (m) {
		m.parent?.remove(m);
		m.geometry?.dispose?.();
		m.material?.map?.dispose?.();
		m.material?.dispose?.();
	}
	st.mesh = null;
	st.scene = null;
	st.anchor = null;
}

/**
 * Per frame (from updateVikingTheme): put the sea out or take it in as
 * the profile and edition change (checked twice a second) and keep it
 * under the arena. Returns at once in the standard game.
 */
export function updateRetroSea(scene, gameState, time = 0) {
	if (!scene) return;
	if (time - st.lastCheck >= CHECK_MS || (st.mesh && st.scene !== scene)) {
		st.lastCheck = time;
		const want = retroSeaWanted(gameState);
		if (want && (!st.mesh || st.scene !== scene || st.mesh.parent !== scene)) {
			const THREE = (typeof window !== 'undefined' && window.THREE) || null;
			if (!THREE) return;
			remove();
			st.mesh = build(THREE);
			st.scene = scene;
			scene.add(st.mesh);
		} else if (!want && st.mesh) {
			remove();
		}
	}
	const m = st.mesh;
	if (!m) return;
	const t = getControls()?.target;
	const a = t && Number.isFinite(t.x) ? { x: t.x, z: t.z } : { x: 0, z: 0 };
	if (!st.anchor || Math.hypot(a.x - st.anchor.x, a.z - st.anchor.z) > 30) {
		st.anchor = a;
		m.position.x = a.x;
		m.position.z = a.z;
	}
}

/** For tests / diagnostics. */
export function _retroSeaState() {
	return st;
}
