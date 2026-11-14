/**
 * The cute render profile's sea, Viking edition only.
 *
 * The fjord (theme.js) dresses the normal profile alone, and the cute
 * profile has no water of its own: its longships floated in a black
 * void on their little ponds, moored and sailing looked the same. This
 * lays one flat, unlit, storybook sea under the arena: lagoon blue in
 * the middle deepening to night, with chalk-white wave ticks and a few
 * sparkles, fading softly into a storybook daytime sky.
 *
 * The cute profile's own sky is the standard game's 8-bit night (black,
 * starry): over a bright lagoon it read as a void band with a hard
 * horizon. While the cute sea is out the sky goes daytime too: a pale
 * blue dome, a haze of the same colour at the horizon and a ring of
 * puffy cartoon clouds; the starfield is put away and given back after.
 *
 * Cost (cute is also the low-spec profile): three draw calls (a 64-segment
 * disc, a coarse sky dome, the clouds as one instanced-free group of a
 * dozen sprites sharing one texture), two canvas textures painted once;
 * per frame it turns the disc a hair, keeps the sky on the camera and
 * re-anchors when the camera travels far.
 */

import { vikingActive } from '../edition.js';
import { getControls } from '../gameContext.js';
import { SEA_SURFACE_Y } from '../seaLevel.js';

const NAME = 'viking-cute-sea';
const RADIUS = 170;          // world units: the arena and a wide margin
const TEX_PX = 1024;
const CHECK_MS = 500;
const DRIFT = 0.004;         // radians per second

const SKY_NAME = 'viking-cute-sky';
// Daytime storybook sky: deeper cornflower overhead, pale at the horizon.
const SKY_TOP = [0.42, 0.70, 0.96];
const SKY_HORIZON = [0.80, 0.93, 1.0];
const HORIZON_HEX = 0xcceeff;
const CLOUD_COUNT = 12;

const st = { mesh: null, scene: null, lastCheck: -Infinity, anchor: null, sky: null, saved: null };

/** Whether the cute sea should be out. Pure: the caller passes the edition test. */
export function cuteSeaWanted(gameState, isActive = vikingActive) {
	if (!gameState) return false;
	const profile = gameState.renderProfile
		|| (gameState.retroMode ? 'retro' : gameState.lowQuality ? 'cute' : 'normal');
	if (profile !== 'cute') return false;
	try { return !!isActive(gameState); } catch (_e) { return false; }
}

/** A tiny seeded PRNG, so the waves fall the same way every time. */
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

function paintSea() {
	const c = document.createElement('canvas');
	c.width = c.height = TEX_PX;
	const g = c.getContext('2d');
	if (!g) return c;
	const mid = TEX_PX / 2;
	// Lagoon to open-sea blue, then into the pale daytime haze (the
	// alpha fades the rim onto the sky's horizon colour: no hard edge).
	const body = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
	body.addColorStop(0, 'rgba(92, 206, 226, 1)');
	body.addColorStop(0.35, 'rgba(64, 176, 220, 1)');
	body.addColorStop(0.62, 'rgba(56, 146, 210, 0.97)');
	body.addColorStop(0.82, 'rgba(120, 190, 236, 0.75)');
	body.addColorStop(1, 'rgba(204, 238, 255, 0)');
	g.fillStyle = body;
	g.fillRect(0, 0, TEX_PX, TEX_PX);
	// Chalk wave ticks: little "︶︶" pairs, sparser toward the rim.
	const rand = rng(1879);
	g.lineCap = 'round';
	for (let i = 0; i < 520; i++) {
		const a = rand() * Math.PI * 2;
		const r = Math.sqrt(rand()) * mid * 0.86;
		const x = mid + Math.cos(a) * r;
		const y = mid + Math.sin(a) * r;
		const fade = 1 - r / (mid * 0.86);
		const w = 7 + rand() * 7;
		g.strokeStyle = `rgba(235, 252, 255, ${(0.18 + 0.32 * fade).toFixed(3)})`;
		g.lineWidth = 2.2;
		for (let k = 0; k < 2; k++) {
			g.beginPath();
			g.arc(x + k * w * 1.6, y, w * 0.8, Math.PI * 0.15, Math.PI * 0.85);
			g.stroke();
		}
	}
	// A few four-point sparkles.
	for (let i = 0; i < 70; i++) {
		const a = rand() * Math.PI * 2;
		const r = Math.sqrt(rand()) * mid * 0.7;
		const x = mid + Math.cos(a) * r;
		const y = mid + Math.sin(a) * r;
		const s = 3 + rand() * 4;
		g.fillStyle = 'rgba(255, 255, 255, 0.75)';
		g.beginPath();
		g.moveTo(x, y - s); g.lineTo(x + s * 0.25, y - s * 0.25); g.lineTo(x + s, y);
		g.lineTo(x + s * 0.25, y + s * 0.25); g.lineTo(x, y + s); g.lineTo(x - s * 0.25, y + s * 0.25);
		g.lineTo(x - s, y); g.lineTo(x - s * 0.25, y - s * 0.25);
		g.closePath();
		g.fill();
	}
	return c;
}

function build(THREE) {
	const geo = new THREE.CircleGeometry(RADIUS, 64);
	geo.rotateX(-Math.PI / 2);
	const tex = new THREE.CanvasTexture(paintSea());
	tex.generateMipmaps = true;
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
	const mesh = new THREE.Mesh(geo, mat);
	mesh.name = NAME;
	// Just under the ships' ponds and the sail lanes (both at the surface).
	mesh.position.y = SEA_SURFACE_Y - 0.06;
	mesh.renderOrder = -2;
	mesh.frustumCulled = false;
	mesh.userData.decorative = true;
	return mesh;
}

/** One puffy cartoon cloud: white lobes, a soft blue belly, a crisp rim. */
function paintCloud() {
	const c = document.createElement('canvas');
	c.width = 256;
	c.height = 128;
	const g = c.getContext('2d');
	if (!g) return c;
	const lobes = [[64, 80, 34], [104, 60, 42], [152, 56, 46], [196, 78, 34], [128, 86, 38]];
	const path = () => {
		g.beginPath();
		for (const [x, y, r] of lobes) { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); }
		g.rect(64, 80, 132, 30);
	};
	// outline (a soft periwinkle line, the storybook look)
	g.save();
	g.lineWidth = 7;
	g.strokeStyle = 'rgba(120, 150, 210, 0.55)';
	path();
	g.stroke();
	g.restore();
	const fill = g.createLinearGradient(0, 18, 0, 112);
	fill.addColorStop(0, '#ffffff');
	fill.addColorStop(0.62, '#f4f9ff');
	fill.addColorStop(1, '#cfe0fa');
	g.fillStyle = fill;
	path();
	g.fill();
	// a highlight on the top lobes
	g.fillStyle = 'rgba(255, 255, 255, 0.9)';
	g.beginPath();
	g.ellipse(140, 34, 22, 9, -0.2, 0, Math.PI * 2);
	g.fill();
	return c;
}

function buildSky(THREE) {
	const group = new THREE.Group();
	group.name = SKY_NAME;
	group.userData.decorative = true;
	const geo = new THREE.SphereGeometry(400, 24, 16);
	const pos = geo.attributes.position;
	const col = new Float32Array(pos.count * 3);
	for (let i = 0; i < pos.count; i++) {
		const y = pos.getY(i) / 400;
		// pale through the lower sky, deepening only well overhead
		const t = Math.max(0, Math.min(1, (y - 0.02) / 0.55));
		const k = t * t * (3 - 2 * t);
		for (let j = 0; j < 3; j++) col[i * 3 + j] = SKY_HORIZON[j] + (SKY_TOP[j] - SKY_HORIZON[j]) * k;
	}
	geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
	const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
	dome.renderOrder = -10;
	dome.frustumCulled = false;
	group.add(dome);
	const tex = new THREE.CanvasTexture(paintCloud());
	const cloudMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
	const rand = rng(4242);
	for (let i = 0; i < CLOUD_COUNT; i++) {
		const a = (i / CLOUD_COUNT) * Math.PI * 2 + rand() * 0.35;
		const r = 230 + rand() * 60;
		const s = 46 + rand() * 30;
		const cloud = new THREE.Sprite(cloudMat);
		cloud.scale.set(s, s / 2, 1);
		cloud.position.set(Math.cos(a) * r, 34 + rand() * 46, Math.sin(a) * r);
		cloud.renderOrder = -9;
		cloud.frustumCulled = false;
		group.add(cloud);
	}
	return group;
}

/** Day comes up: the sky, the haze, the stars put away. */
function dressSky(THREE, scene) {
	if (!st.sky) st.sky = buildSky(THREE);
	if (st.sky.parent !== scene) scene.add(st.sky);
	const stars = scene.getObjectByName('starfield');
	st.saved = {
		background: scene.background,
		fog: scene.fog,
		stars: stars ? { obj: stars, visible: stars.visible } : null,
	};
	st.bg = new THREE.Color(HORIZON_HEX);
	scene.background = st.bg;
	scene.fog = new THREE.Fog(HORIZON_HEX, 150, 340);
	st.fog = scene.fog;
	if (stars) stars.visible = false;
}

/** Give the night back (only what is still ours: setupLights may have redressed the scene). */
function undressSky(scene) {
	const s = st.saved;
	st.saved = null;
	if (st.sky) {
		st.sky.parent?.remove(st.sky);
		st.sky.traverse(n => {
			n.geometry?.dispose?.();
			n.material?.map?.dispose?.();
			n.material?.dispose?.();
		});
	}
	st.sky = null;
	if (!s || !scene) return;
	if (scene.background === st.bg) scene.background = s.background;
	if (scene.fog === st.fog) scene.fog = s.fog;
	if (s.stars && s.stars.obj.parent === scene) s.stars.obj.visible = s.stars.visible;
	st.bg = null;
	st.fog = null;
}

function remove() {
	undressSky(st.scene);
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
 * Per frame (from updateVikingTheme): put the sea out or take it in as the
 * profile and edition change (checked twice a second), keep it under the
 * arena and let it drift. Returns at once in the standard game.
 */
export function updateCuteSea(scene, gameState, time = 0) {
	if (!scene) return;
	if (time - st.lastCheck >= CHECK_MS || (st.mesh && st.scene !== scene)) {
		st.lastCheck = time;
		const want = cuteSeaWanted(gameState);
		if (want && (!st.mesh || st.scene !== scene || st.mesh.parent !== scene)) {
			const THREE = (typeof window !== 'undefined' && window.THREE) || null;
			if (!THREE) return;
			remove();
			st.mesh = build(THREE);
			st.scene = scene;
			scene.add(st.mesh);
			dressSky(THREE, scene);
		} else if (!want && st.mesh) {
			remove();
		} else if (want && st.mesh && scene.background !== st.bg) {
			// setupLights ran again (a profile round trip): day again
			const THREE = (typeof window !== 'undefined' && window.THREE) || null;
			if (THREE) { undressSky(scene); dressSky(THREE, scene); }
		}
	}
	const m = st.mesh;
	if (!m) return;
	m.rotation.y = (time / 1000) * DRIFT;
	// The sky dome rides with the eye; the clouds turn very slowly.
	const cam = gameState?.camera;
	if (st.sky) {
		if (cam?.position) st.sky.position.set(cam.position.x, 0, cam.position.z);
		st.sky.rotation.y = (time / 1000) * DRIFT * 0.5;
	}
	const t = getControls()?.target;
	const a = t && Number.isFinite(t.x) ? { x: t.x, z: t.z } : { x: 0, z: 0 };
	if (!st.anchor || Math.hypot(a.x - st.anchor.x, a.z - st.anchor.z) > 60) {
		st.anchor = a;
		m.position.x = a.x;
		m.position.z = a.z;
	}
}

/** For tests / diagnostics. */
export function _cuteSeaState() {
	return st;
}
