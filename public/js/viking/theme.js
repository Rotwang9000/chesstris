/**
 * The Viking theme: a cold dawn over a fjord.
 *
 * Applied only while `vikingActive(gameState)` and the normal render
 * profile is on (cute and retro keep their own looks). It never edits
 * scene.js: it re-dresses what setupLights built and remembers the
 * originals, so leaving the Viking battle (or switching profile) puts
 * the standard scene back exactly as it was.
 *
 *   sky      a gradient dome (deep slate overhead, rose-gold at the sun,
 *            cold mist on the far side) that follows the camera
 *   sun      low and golden on the horizon, with a path of glints on the sea
 *   fjord    three rings of mountain silhouette round the arena, the far
 *            one snow-capped, fading into mist
 *   light    a low golden key light, cool fill, colder fog
 *   sea      darker steel blue
 *
 * Cost: four extra draw calls and ~3k triangles; per frame it moves the
 * dome and checks state every half second.
 */

import { vikingActive } from '../edition.js';
import { getControls } from '../gameContext.js';
import { SEA_SURFACE_Y } from '../seaLevel.js';
import { animateVikingLand } from './landDress.js';

/* ------------------------------------------------------------ palette */

export const PALETTE = Object.freeze({
	zenith: 0x34466f,
	upper: 0x8791b2,       // a cool blue-lavender (a flat grey read as smog)
	horizon: 0xdcc6b2,     // rose-gold dawn mist (also the background)
	sunGlow: 0xffc58a,     // rose-gold near the sun
	sunCore: 0xfff4d8,
	sunBand: 0xf0845a,     // the red-gold band on the horizon under the sun
	sea: 0x24425e,
	seaNear: 0x16424a,     // deep teal-green by the land
	seaFar: 0x3a5878,      // steel blue out in the fjord
	glint: 0xffd49a,       // the low sun on the water
	fog: 0xd6bea8,         // warm haze (a grey band read as smog)
	fogDensity: 0.0058,
	sunLight: 0xffc890,
	hemiSky: 0xc2c3d6,
	hemiGround: 0x3b3433,
	ambient: 0xc7bcc0,
	rim: 0xa9bde0,
	// aerial perspective: the near ridge warm slate, the far one blue-violet
	ridges: [0x3a3a44, 0x56607e, 0x8d8fbb],
	ridgeRim: 0xffc48e,    // the sun catching the crests
	snow: 0xeef0f4,
});

/**
 * Where the sun sits: azimuth (radians, from +X toward +Z) and elevation.
 * The fjord's ridges open in a valley toward it (SUN_NOTCH) so the low
 * sun shows between the mountains, as in the paintings. The sky and the
 * fjord are built for this azimuth, then turned (see {@link sunAzimuthFor})
 * so the sun stands ahead of the player's own default camera: the glow
 * and the road of glints lie behind the board, as in the paintings.
 */
export const SUN = Object.freeze({ azimuth: -2.25, elevation: 0.11 });
/** How far (radians) the sun stands off the player's line of sight. */
export const SUN_OFF_AXIS = 0.3;

/**
 * The sun's azimuth for a seat facing `orientation` (0 +Z, 1 +X, 2 -Z,
 * 3 -X: the king's forward, which is where the home camera looks). Pure.
 * @param {number} orientation
 */
export function sunAzimuthFor(orientation) {
	const o = ((Math.round(Number(orientation) || 0) % 4) + 4) % 4;
	const fwd = [[0, 1], [1, 0], [0, -1], [-1, 0]][o];
	return Math.atan2(fwd[1], fwd[0]) + SUN_OFF_AXIS;
}

/** The local seat's facing (0-3), from its king or home zone; null if unknown. */
export function localFacing(gameState) {
	const me = gameState && gameState.localPlayerId != null ? String(gameState.localPlayerId) : null;
	if (!me) return null;
	const pieces = Array.isArray(gameState.chessPieces) ? gameState.chessPieces : [];
	for (const p of pieces) {
		if (p && String(p.player) === me && String(p.type).toUpperCase() === 'KING' && Number.isFinite(p.orientation)) return p.orientation;
	}
	const zone = gameState.homeZones && gameState.homeZones[me];
	return zone && Number.isFinite(zone.orientation) ? zone.orientation : null;
}
/** Half-widths (radians) of the valley: floor, then the slopes back up. */
export const SUN_NOTCH = Object.freeze({ floor: 0.2, shoulder: 0.5 });
const SUN_DISTANCE = 380;   // inside the sky dome (420), beyond the far ridge (245)
const PATH_LENGTH = 280;    // the road of glints on the sea
const PATH_OPACITY = 0.42;

const STANDARD_DECOR = ['sunDecoration', 'skyClouds', 'distantMountains', 'birds', 'ambientParticles'];
const CHECK_MS = 500;

/**
 * Whether the theme should be on. Pure: the caller passes the edition test.
 * @param {Object} gameState
 * @param {(gs:Object)=>boolean} [isActive]
 */
export function themeWanted(gameState, isActive = vikingActive) {
	if (!gameState) return false;
	const profile = gameState.renderProfile
		|| (gameState.retroMode ? 'retro' : gameState.lowQuality ? 'cute' : 'normal');
	if (profile !== 'normal') return false;
	try { return !!isActive(gameState); } catch (_e) { return false; }
}

function mixHex(a, b, t) {
	const k = Math.max(0, Math.min(1, t));
	const ch = (s) => (((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
	return [ch(16) / 255, ch(8) / 255, ch(0) / 255];
}
function mix3(a, b, t) {
	const k = Math.max(0, Math.min(1, t));
	return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
function hex3(h) { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; }

/**
 * Sky colour for a view direction. Pure (returns [r,g,b] 0..1).
 * @param {number} elevation -π/2..π/2 above the horizon
 * @param {number} sunDot cosine of the angle to the sun's azimuth (-1..1)
 */
export function skyColour(elevation, sunDot) {
	const e = Math.max(0, elevation);
	// overhead gradient
	let c = e < 0.25
		? mixHex(PALETTE.horizon, PALETTE.upper, Math.pow(e / 0.25, 0.8))
		: mixHex(PALETTE.upper, PALETTE.zenith, Math.min(1, (e - 0.25) / 0.9));
	// dawn glow: strongest low and toward the sun
	const toward = Math.max(0, sunDot);
	const glow = Math.pow(toward, 2.2) * Math.exp(-e * 4.2);
	c = mix3(c, hex3(PALETTE.sunGlow), glow * 0.9);
	// the red-gold band along the horizon beneath the sun
	const band = Math.pow(toward, 6) * Math.exp(-Math.abs(elevation - 0.02) * 22);
	c = mix3(c, hex3(PALETTE.sunBand), band * 0.55);
	const core = Math.pow(toward, 40) * Math.exp(-Math.abs(elevation - SUN.elevation) * 14);
	c = mix3(c, hex3(PALETTE.sunCore), core);
	// below the horizon the dome is mist (hidden by the sea anyway)
	if (elevation < 0) c = mix3(c, hex3(PALETTE.horizon), Math.min(1, -elevation * 8));
	return c;
}

/**
 * A jagged ridgeline: `n` heights between 0 and 1, seeded. Steep fjord
 * walls with a few higher peaks. Pure.
 */
export function ridgeline(seed, n, roughness = 0.55) {
	let a = seed >>> 0;
	const rnd = () => {
		a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const out = new Array(n).fill(0);
	// sum of a few periodic octaves so the ring closes seamlessly
	const octaves = [];
	for (let o = 0; o < 6; o++) {
		octaves.push({ f: 2 + o * o * 2 + Math.floor(rnd() * 3), p: rnd() * Math.PI * 2, amp: Math.pow(roughness, o) });
	}
	let max = -Infinity, min = Infinity;
	for (let i = 0; i < n; i++) {
		const u = (i / n) * Math.PI * 2;
		let h = 0;
		for (const o of octaves) h += o.amp * Math.abs(Math.sin(u * o.f / 2 + o.p));
		out[i] = h;
		if (h > max) max = h;
		if (h < min) min = h;
	}
	for (let i = 0; i < n; i++) out[i] = (out[i] - min) / (max - min || 1);
	return out;
}

/**
 * 0 on the valley floor toward the sun, rising smoothly to 1 on the
 * slopes either side (`u` the ring angle, radians). Pure.
 */
export function sunValley(u) {
	let d = u - SUN.azimuth;
	while (d > Math.PI) d -= Math.PI * 2;
	while (d < -Math.PI) d += Math.PI * 2;
	const t = Math.max(0, Math.min(1, (Math.abs(d) - SUN_NOTCH.floor) / (SUN_NOTCH.shoulder - SUN_NOTCH.floor)));
	return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------- state */

const st = {
	on: false,
	lastCheck: -Infinity,
	saved: null,
	group: null,
	sky: null,
	anchor: null,
	scene: null,
};

function buildSky(THREE) {
	const geo = new THREE.SphereGeometry(420, 48, 24);
	const pos = geo.attributes.position;
	const col = new Float32Array(pos.count * 3);
	const sx = Math.cos(SUN.azimuth), sz = Math.sin(SUN.azimuth);
	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
		const len = Math.hypot(x, y, z) || 1;
		const elev = Math.asin(y / len);
		const hl = Math.hypot(x, z) || 1;
		const dot = (x / hl) * sx + (z / hl) * sz;
		const c = skyColour(elev, dot);
		col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
	}
	geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
	const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
	const sky = new THREE.Mesh(geo, mat);
	sky.name = 'viking-sky';
	sky.renderOrder = -10;
	sky.frustumCulled = false;
	return sky;
}

function glowTexture(THREE, inner, outer) {
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const g = c.getContext('2d');
	const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
	grd.addColorStop(0, inner);
	grd.addColorStop(0.18, inner);
	grd.addColorStop(0.35, outer);
	grd.addColorStop(1, 'rgba(255,200,140,0)');
	g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
	const t = new THREE.CanvasTexture(c);
	return t;
}

function glintTexture(THREE) {
	// Fine enough that one glint is a fleck, not a slab: 256 x 1024 over
	// the road's 46 x 280 units (the sea shader adds its own sparkle).
	const W = 256, H = 1024;
	const c = document.createElement('canvas');
	c.width = W; c.height = H;
	const g = c.getContext('2d');
	let a = 99;
	const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
	// a soft gold sheen under the glints, brightest toward the sun
	const sheen = g.createLinearGradient(0, H, 0, 0);
	sheen.addColorStop(0, 'rgba(255,170,90,0)');
	sheen.addColorStop(0.6, 'rgba(255,170,90,0.08)');
	sheen.addColorStop(1, 'rgba(255,185,110,0.22)');
	g.fillStyle = sheen; g.fillRect(0, 0, W, H);
	g.globalCompositeOperation = 'destination-in';
	const sides = g.createLinearGradient(0, 0, W, 0);
	sides.addColorStop(0, 'rgba(0,0,0,0)');
	sides.addColorStop(0.5, 'rgba(0,0,0,1)');
	sides.addColorStop(1, 'rgba(0,0,0,0)');
	g.fillStyle = sides; g.fillRect(0, 0, W, H);
	g.globalCompositeOperation = 'source-over';
	for (let i = 0; i < 2600; i++) {
		const v = Math.pow(rnd(), 0.7);        // 0 near the viewer, 1 at the sun
		const spread = 0.12 + 0.38 * (1 - v);
		const x = W / 2 + (rnd() - 0.5) * W * spread * 2 * Math.pow(rnd(), 0.6);
		const y = H - v * H;
		const alpha = (0.2 + 0.6 * rnd()) * (0.3 + 0.7 * v);
		// gold, not silver: added onto a dark sea, pale glints read white
		g.fillStyle = `rgba(255,${Math.round(168 + 45 * rnd())},${Math.round(72 + 50 * rnd())},${alpha})`;
		g.fillRect(x, y, 1 + 2 * rnd(), 1);
	}
	// fade in from the near end (no hard edge in front of the viewer)
	g.globalCompositeOperation = 'destination-in';
	const near = g.createLinearGradient(0, H, 0, 0);
	near.addColorStop(0, 'rgba(0,0,0,0)');
	near.addColorStop(0.45, 'rgba(0,0,0,1)');
	near.addColorStop(1, 'rgba(0,0,0,1)');
	g.fillStyle = near; g.fillRect(0, 0, W, H);
	g.globalCompositeOperation = 'source-over';
	return new THREE.CanvasTexture(c);
}

/**
 * Wavelets on the sea, painted onto the water itself so they ride its
 * swell: a tiling multiply map of darker troughs (white elsewhere) and an
 * emissive map of light crests and the odd white fleck.
 */
const SEA_TILE = 11;         // world units per texture tile
const WATER_SIZE = 1200;     // scene.js addWaterPlane

/** Soften every stroke after this (where the canvas supports filters). */
function g2blur(g, px) {
	try { if ('filter' in g) g.filter = `blur(${px}px)`; } catch (_e) { /* crisp is fine */ }
}

function seaMaps(THREE) {
	const S = 256;
	const mk = (bg) => {
		const c = document.createElement('canvas');
		c.width = c.height = S;
		const g = c.getContext('2d');
		g.fillStyle = bg; g.fillRect(0, 0, S, S);
		g.lineCap = 'round';
		return { c, g };
	};
	let a = 4242;
	const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
	const stroke = (g, x, y, len, w, style) => {
		for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
			g.strokeStyle = style;
			g.lineWidth = w;
			g.beginPath();
			g.moveTo(x + ox, y + oy);
			g.quadraticCurveTo(x + ox + len / 2, y + oy - w * 1.6, x + ox + len, y + oy);
			g.stroke();
		}
	};
	// Long, soft swells in the multiply map; few, faint crests in the
	// emissive one (the shader fades both out with distance).
	const dark = mk('#ffffff');
	g2blur(dark.g, 3);
	for (let i = 0; i < 46; i++) stroke(dark.g, rnd() * S, rnd() * S, 40 + rnd() * 60, 5 + rnd() * 6, `rgba(150,170,180,${0.10 + 0.12 * rnd()})`);
	const light = mk('#000000');
	g2blur(light.g, 0.8);
	for (let i = 0; i < 60; i++) stroke(light.g, rnd() * S, rnd() * S, 10 + rnd() * 26, 0.9 + rnd() * 1.2, `rgba(52,72,80,${0.16 + 0.24 * rnd()})`);
	for (let i = 0; i < 6; i++) stroke(light.g, rnd() * S, rnd() * S, 4 + rnd() * 8, 1.0, `rgba(120,138,146,${0.3 + 0.2 * rnd()})`);
	const tex = (c) => {
		const t = new THREE.CanvasTexture(c);
		t.wrapS = t.wrapT = THREE.RepeatWrapping;
		t.repeat.set(WATER_SIZE / SEA_TILE, WATER_SIZE / SEA_TILE);
		t.anisotropy = 4;
		return t;
	};
	return { map: tex(dark.c), emissiveMap: tex(light.c) };
}

/**
 * The Viking sea: the standard Lambert water (its swell, its lights)
 * with three changes made in the shader —
 *   colour   deep teal-green round the board, steel blue further out;
 *   texture  the wavelets fade away with distance (no tiling to the
 *            horizon), and stay soft close up;
 *   glint    the low sun on the water: a warm sheen and sparkles where
 *            the ripples face between the sun and the eye.
 * Swapped onto the water while the theme is on; the original material
 * is put back on restore.
 */
function buildWaterMaterial(THREE, maps) {
	const mat = new THREE.MeshLambertMaterial({
		// (no depth write: the shore foam and wakes drawn after it test
		// against the land and hulls, not against the swell's facets)
		color: 0xffffff, transparent: true, opacity: 0.97, side: THREE.FrontSide, depthWrite: false,
		map: maps.map, emissiveMap: maps.emissiveMap, emissive: 0xffffff,
	});
	const uniforms = {
		uSeaNear: { value: new THREE.Color(PALETTE.seaNear) },
		uSeaFar: { value: new THREE.Color(PALETTE.seaFar) },
		uGlint: { value: new THREE.Color(PALETTE.glint) },
		uSunDir: { value: new THREE.Vector3(0, 0.2, -1) },
		uTarget: { value: new THREE.Vector2(0, 0) },
		uTime: { value: 0 },
		uSkyTint: { value: new THREE.Color(PALETTE.horizon) },
		uEye: { value: new THREE.Vector3() },
	};
	mat.userData.vikingUniforms = uniforms;
	mat.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec3 vVkWorld;')
			// Lambert lights per vertex: across the swell's 19-unit quads the
			// light was interpolated triangle by triangle, a hard diagonal
			// seam between two tones of teal. A flat normal lights the whole
			// sea alike; the ripples below are drawn per pixel instead.
			.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );')
			.replace('#include <project_vertex>', '#include <project_vertex>\nvVkWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>
varying vec3 vVkWorld;
uniform vec3 uSeaNear;
uniform vec3 uSeaFar;
uniform vec3 uGlint;
uniform vec3 uSunDir;
uniform vec2 uTarget;
uniform float uTime;
uniform vec3 uSkyTint;
// three.js only feeds 'cameraPosition' to Phong/Standard/Shader
// materials: for this Lambert sea it stayed at the origin, so every
// distance fade below read the arena (thousands of units out) as far
// away. The theme passes the eye itself.
uniform vec3 uEye;
float vkFade;
// Fine wind ripples: three trains of short waves, bent by a slow swell so
// no line runs straight for long. Returns the slope (x, z) of the water.
vec2 vkRipple(vec2 p, float t) {
	vec2 w = p + vec2(sin(p.y * 0.37 + t * 0.21), cos(p.x * 0.31 - t * 0.17)) * 1.6;
	vec2 d1 = vec2(0.83, 0.56), d2 = vec2(-0.47, 0.88), d3 = vec2(0.12, -0.99);
	float a1 = dot(w, d1) * 6.3 + t * 1.7;
	float a2 = dot(w, d2) * 8.9 - t * 2.1;
	float a3 = dot(w, d3) * 12.7 + t * 2.6;
	float m1 = 0.55 + 0.45 * sin(dot(p, vec2(0.21, 0.13)) + t * 0.3);
	float m2 = 0.55 + 0.45 * sin(dot(p, vec2(-0.17, 0.23)) - t * 0.25);
	return d1 * cos(a1) * m1 * 0.55 + d2 * cos(a2) * m2 * 0.35 + d3 * cos(a3) * 0.18;
}`)
			.replace('#include <map_fragment>', `
float vkEye = length(vVkWorld.xz - uEye.xz);
vkFade = 1.0 - smoothstep(18.0, 75.0, vkEye);
float vkOut = smoothstep(14.0, 70.0, length(vVkWorld.xz - uTarget));
diffuseColor.rgb *= mix(uSeaNear, uSeaFar, vkOut);
#ifdef USE_MAP
	vec4 texelColor = texture2D( map, vUv );
	texelColor = mapTexelToLinear( texelColor );
	diffuseColor.rgb *= mix(vec3(1.0), texelColor.rgb, 0.85 * vkFade);
#endif`)
			.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance *= 0.7 * vkFade;`)
			.replace('#include <tonemapping_fragment>', `
{
	vec3 V = normalize(uEye - vVkWorld);
	vec3 H = normalize(normalize(uSunDir) + V);
	vec2 p = vVkWorld.xz;
	float t = uTime;
	float eye = length(vVkWorld.xz - uEye.xz);
	// fine ripples near the eye, fading before they could shimmer
	float nearK = 1.0 - smoothstep(22.0, 60.0, eye);
	vec2 g = vkRipple(p, t) * nearK;
	vec2 gl = vec2(
		sin(p.x * 1.7 + t * 1.3) * 0.5 + sin(p.x * 3.1 - p.y * 2.3 + t * 2.1) * 0.35,
		cos(p.y * 1.9 - t * 1.1) * 0.5 + cos(p.y * 2.7 + p.x * 2.9 + t * 1.7) * 0.35);
	vec3 N = normalize(vec3(g.x * 0.22 + gl.x * 0.08, 1.0, g.y * 0.22 + gl.y * 0.08));
	// Looking down (the play camera) the sea shows its own colour and
	// ripples; toward the horizon it mirrors the pale sky and the sun.
	float graze = 1.0 - clamp(V.y, 0.0, 1.0);
	float lowView = smoothstep(0.35, 0.8, graze);
	// the ripples' facets catch the sky (lighter) or the deep (darker)
	float facet = dot(N.xz, normalize(vec2(-uSunDir.x, -uSunDir.z) + vec2(0.001)));
	gl_FragColor.rgb *= 1.0 + facet * 0.6 * nearK;
	float crest = smoothstep(0.72, 0.98, length(g)) * nearK;
	gl_FragColor.rgb += uSkyTint * crest * 0.06;
	float fres = pow(graze, 5.0);
	gl_FragColor.rgb = mix(gl_FragColor.rgb, uSkyTint, fres * 0.32);
	float sheen = pow(max(dot(vec3(0.0, 1.0, 0.0), H), 0.0), 60.0);
	float sparkle = pow(max(dot(N, H), 0.0), 520.0);
	float far = smoothstep(4.0, 30.0, eye);
	gl_FragColor.rgb += uGlint * (sheen * 0.38 + sparkle * 1.4 * (0.35 + 0.65 * far)) * lowView;
}
#include <tonemapping_fragment>`);
	};
	mat.customProgramCacheKey = () => 'viking-sea-v3';
	mat.name = 'viking-sea';
	return mat;
}

function buildRidges(THREE) {
	const rings = [
		{ r: 125, base: 4, height: 34, seed: 11, col: PALETTE.ridges[0], snowAt: 0.7 },
		{ r: 175, base: 10, height: 58, seed: 23, col: PALETTE.ridges[1], snowAt: 0.6 },
		{ r: 245, base: 18, height: 92, seed: 37, col: PALETTE.ridges[2], snowAt: 0.5 },
	];
	const N = 520;
	const pos = [], tint = [], params = [], facet = [], idx = [];
	// Crags: a sharper, higher-frequency octave on top of the ridgeline's
	// broad shapes, strongest on the peaks (a smooth silhouette read as a
	// smeared low-poly cut-out).
	const crag = (u, seed) => {
		const a = Math.abs(Math.sin(u * 37 + seed * 1.7)), b = Math.abs(Math.sin(u * 83 + seed * 3.1));
		const c = Math.abs(Math.sin(u * 151 + seed * 0.7));
		return 1 - (0.55 * a + 0.3 * b + 0.15 * c);   // 0 at the sharp crests, up to 1 in the notches
	};
	const haze = [0.1, 0.28, 0.44];          // aerial perspective: further is paler
	rings.forEach((ring, r) => {
		const h = ridgeline(ring.seed, N, 0.6);
		const base = pos.length / 3;
		const top = hex3(ring.col);
		// mist rises to ~60% of the ring's peaks (less on the near ring,
		// so its rock reads); snow caps above `snowAt`
		const mistTop = SEA_SURFACE_Y + ring.base + ring.height * (r === 0 ? 0.42 : 0.6);
		const snowLine = SEA_SURFACE_Y + ring.base + ring.height * ring.snowAt;
		const heights = [];
		const broad = [];   // without the crags: what the shading follows
		for (let i = 0; i <= N; i++) {
			const u = (i / N) * Math.PI * 2;
			// the valley toward the sun: the ridge comes down to its foot
			const v = sunValley(u);
			const hh0 = Math.pow(h[i % N], 1.35);
			const peak0 = ring.base + ring.height * hh0;
			const peak = ring.base + ring.height * hh0 * (1 - 0.09 * (0.4 + hh0) * crag(u, ring.seed));
			heights.push(ring.base * 0.55 + (peak - ring.base * 0.55) * v);
			broad.push(ring.base * 0.55 + (peak0 - ring.base * 0.55) * v);
		}
		for (let i = 0; i <= N; i++) {
			const u = (i / N) * Math.PI * 2;
			const hh = heights[i];
			const x = Math.cos(u) * ring.r, z = Math.sin(u) * ring.r;
			pos.push(x, SEA_SURFACE_Y - 2, z);   // foot (in the mist, at the sea)
			pos.push(x, SEA_SURFACE_Y + hh, z);  // ridge
			// The slope of the crest here (+ rising with u): one face of
			// each peak catches the sun, the other falls in shade, so the
			// ridges read as rock, not cardboard.
			// (from the broad shape, a few samples either side: the crags
			// alone flipped light and shade column by column, in streaks)
			const W = 4;
			const prev = broad[(i - W + N) % N], next = broad[(i + W) % N];
			const slope = Math.max(-1, Math.min(1, (next - prev) / (ring.r * (2 * W * 2 * Math.PI / N)) * 0.9));
			const crestY = SEA_SURFACE_Y + broad[i];
			// Colour and mist are the ring's, the same at every vertex:
			// the fragment shader fades by height, so nothing is
			// interpolated column by column (no vertical streaks).
			for (let k = 0; k < 2; k++) {
				tint.push(top[0], top[1], top[2]);
				params.push(mistTop, haze[r], snowLine, ring.height * 0.22);
				facet.push(slope, crestY, u);
			}
		}
		for (let i = 0; i < N; i++) {
			const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
			idx.push(a, c, b, b, c, d);
		}
	});
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));
	geo.setAttribute('ridge', new THREE.Float32BufferAttribute(params, 4));
	geo.setAttribute('facet', new THREE.Float32BufferAttribute(facet, 3));
	geo.setIndex(idx);
	const sx = Math.cos(SUN.azimuth), sz = Math.sin(SUN.azimuth);
	const mat = new THREE.ShaderMaterial({
		side: THREE.DoubleSide,
		fog: false,
		uniforms: {
			mist: { value: new THREE.Color(PALETTE.fog) },
			warmMist: { value: new THREE.Color(PALETTE.sunGlow) },
			snow: { value: new THREE.Color(PALETTE.snow) },
			rimCol: { value: new THREE.Color(PALETTE.ridgeRim) },
			sunXZ: { value: new THREE.Vector2(sx, sz) },
			seaY: { value: SEA_SURFACE_Y - 2 },
		},
		vertexShader: `
			attribute vec3 tint;
			attribute vec4 ridge;
			attribute vec3 facet;
			varying vec3 vTint;
			varying vec4 vRidge;
			varying vec3 vFacet;
			varying vec3 vLocal;
			void main() {
				vTint = tint;
				vRidge = ridge;
				vFacet = facet;
				vLocal = position;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}`,
		fragmentShader: `
			uniform vec3 mist;
			uniform vec3 warmMist;
			uniform vec3 snow;
			uniform vec3 rimCol;
			uniform vec2 sunXZ;
			uniform float seaY;
			varying vec3 vTint;
			varying vec4 vRidge;
			varying vec3 vFacet;
			varying vec3 vLocal;
			void main() {
				float y = vLocal.y;
				vec3 c = vTint;
				// Which way this stretch of crest faces: its tangent along
				// the ring tells the sunward slope from the shaded one.
				vec2 radial = normalize(vLocal.xz);
				vec2 tangent = vec2(-radial.y, radial.x);
				float sunSide = dot(tangent, sunXZ);           // + : rising slope faces the sun
				float lit = clamp(0.5 + vFacet.x * sign(sunSide) * 0.9 + dot(radial, sunXZ) * -0.25, 0.0, 1.0);
				// (strongest up by the crest, so no light curtains hang to the sea)
				float upper = smoothstep(seaY, vFacet.y, y);
				c *= mix(1.0, mix(0.8, 1.2, lit), upper);
				// snow caps on the peaks only: as deep as the crest stands
				// above the snowline, the lower edge gently ragged (a fast
				// rag across the columns hung down as streaks, like icicles)
				float cap = max(0.0, vFacet.y - vRidge.z);
				float rag = sin(vFacet.z * 23.0) * 0.5 + sin(vFacet.z * 41.0 + 1.3) * 0.3;
				float edge = vFacet.y - cap * (0.75 + 0.2 * rag);
				float snowK = smoothstep(edge - 0.12, edge + 0.18, y) * smoothstep(0.4, 2.0, cap);
				// the snow's own light: bright on the sunward face, blue in shade
				vec3 snowLit = mix(snow * vec3(0.7, 0.76, 0.9), snow * vec3(1.06, 1.0, 0.94), lit);
				c = mix(c, snowLit, 0.92 * snowK);
				// toward the sun the mist glows rose-gold
				float toward = max(0.0, dot(radial, sunXZ));
				// the low sun rims the crests on their sunward faces
				float crest = smoothstep(vFacet.y - 1.2, vFacet.y, y);
				c = mix(c, rimCol, crest * (0.3 + 0.6 * lit) * (0.35 + 0.65 * pow(toward, 1.5)));
				vec3 m = mix(mist, warmMist, 0.55 * pow(toward, 5.0));
				// the far rings' haze leans blue-violet, away from the sun
				m = mix(m, vec3(0.62, 0.63, 0.78), vRidge.y * 0.7 * (1.0 - pow(toward, 2.0)));
				// one smooth fade by height, plus the ring's haze
				float fade = 1.0 - smoothstep(seaY, vRidge.x, y);
				float k = clamp(vRidge.y + (1.0 - vRidge.y) * fade * 0.86, 0.0, 1.0);
				gl_FragColor = vec4(mix(c, m, k), 1.0);
				#include <encodings_fragment>
			}`,
	});
	const m = new THREE.Mesh(geo, mat);
	m.name = 'viking-fjord-ridges';
	m.renderOrder = -5;
	m.frustumCulled = false;
	return m;
}

function buildGroup(THREE) {
	const group = new THREE.Group();
	group.name = 'vikingFjord';
	const ridges = buildRidges(THREE);
	group.add(ridges);

	const sunDir = new THREE.Vector3(Math.cos(SUN.azimuth) * Math.cos(SUN.elevation), Math.sin(SUN.elevation), Math.sin(SUN.azimuth) * Math.cos(SUN.elevation));
	// The sun keeps its place in the sky wherever the camera goes (it is
	// moved with the camera each frame, like the sky dome), so it always
	// sits in the valley the ridges open toward it.
	const sun = new THREE.Group();
	sun.name = 'viking-sun';
	const glow = new THREE.Sprite(new THREE.SpriteMaterial({
		map: glowTexture(THREE, 'rgba(255,200,146,0.42)', 'rgba(240,140,80,0.22)'),
		fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
	}));
	glow.scale.set(170, 170, 1);
	const disc = new THREE.Sprite(new THREE.SpriteMaterial({
		map: glowTexture(THREE, 'rgba(255,236,196,0.78)', 'rgba(255,196,130,0.3)'),
		fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
	}));
	disc.scale.set(30, 30, 1);
	glow.renderOrder = -4;
	disc.renderOrder = -4;
	sun.add(glow);
	sun.add(disc);
	sun.position.copy(sunDir).multiplyScalar(SUN_DISTANCE);
	group.add(sun);

	// A road of glints across the water toward the low sun.
	const pathGeo = new THREE.PlaneGeometry(1, 1);
	pathGeo.rotateX(-Math.PI / 2);
	// rotateX leaves the texture's top row (the sun end: the brightest
	// sheen and the densest flecks) at local -Z, which the yaw below turns
	// toward the viewer. Turn it round so the sun end lies toward the sun
	// and the faded end in front of the eye: the other way the road began
	// in a hard straight edge a few units from the camera, its flecks
	// magnified into yellow-green blotches at low and close angles.
	pathGeo.rotateY(Math.PI);
	const path = new THREE.Mesh(pathGeo, new THREE.MeshBasicMaterial({
		map: glintTexture(THREE), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.85,
	}));
	path.name = 'viking-sunpath';
	const L = PATH_LENGTH;
	path.scale.set(46, 1, L);
	path.rotation.y = Math.atan2(sunDir.x, sunDir.z);
	path.position.set(sunDir.x * (L / 2 + 6), SEA_SURFACE_Y + 0.06, sunDir.z * (L / 2 + 6));
	path.renderOrder = 1;
	group.add(path);

	const clouds = buildClouds(THREE);
	group.add(clouds);

	return { group, sunDir, sun, path, ridges, clouds };
}

/**
 * A painted band of cloud low over the fjord, as in the paintings: long
 * soft streaks, gold-lit toward the low sun, cool lavender away from it.
 * One draw call (an open cylinder inside the sky dome, beyond the ridges).
 */
function buildClouds(THREE) {
	const W = 1024, H = 128;
	const c = document.createElement('canvas');
	c.width = W; c.height = H;
	const g = c.getContext('2d');
	let a = 31337;
	const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
	g.clearRect(0, 0, W, H);
	try { if ('filter' in g) g.filter = 'blur(3px)'; } catch (_e) { /* crisp is fine */ }
	for (let i = 0; i < 70; i++) {
		const y = H * (0.35 + 0.45 * Math.pow(rnd(), 0.8));
		const len = 60 + rnd() * 220, th = 3 + rnd() * 9;
		const x = rnd() * W;
		const alpha = 0.18 + 0.4 * rnd() * (y / H);
		for (const ox of [-W, 0, W]) {
			const grd = g.createLinearGradient(x + ox, 0, x + ox + len, 0);
			grd.addColorStop(0, 'rgba(255,255,255,0)');
			grd.addColorStop(0.3, `rgba(255,255,255,${alpha})`);
			grd.addColorStop(0.7, `rgba(255,255,255,${alpha})`);
			grd.addColorStop(1, 'rgba(255,255,255,0)');
			g.fillStyle = grd;
			g.beginPath();
			g.ellipse(x + ox + len / 2, y, len / 2, th, 0, 0, Math.PI * 2);
			g.fill();
		}
	}
	// fade top and bottom
	g.filter = 'none';
	g.globalCompositeOperation = 'destination-in';
	const v = g.createLinearGradient(0, 0, 0, H);
	v.addColorStop(0, 'rgba(0,0,0,0)');
	v.addColorStop(0.35, 'rgba(0,0,0,1)');
	v.addColorStop(0.85, 'rgba(0,0,0,1)');
	v.addColorStop(1, 'rgba(0,0,0,0)');
	g.fillStyle = v; g.fillRect(0, 0, W, H);
	const tex = new THREE.CanvasTexture(c);
	tex.wrapS = THREE.RepeatWrapping;
	tex.repeat.set(3, 1);
	// between the middle and the far ridge: low cloud drifting across the
	// far peaks' flanks, as in a fjord at dawn
	const geo = new THREE.CylinderGeometry(212, 212, 56, 96, 1, true);
	const pos = geo.attributes.position;
	const col = new Float32Array(pos.count * 3);
	const sx = Math.cos(SUN.azimuth), sz = Math.sin(SUN.azimuth);
	const warm = hex3(0xffcf9e), cool = hex3(0xb9b9d8);
	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i), z = pos.getZ(i);
		const d = Math.max(0, (x * sx + z * sz) / (Math.hypot(x, z) || 1));
		const k = Math.pow(d, 3);
		for (let ch = 0; ch < 3; ch++) col[i * 3 + ch] = cool[ch] + (warm[ch] - cool[ch]) * k;
	}
	geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
	const mat = new THREE.MeshBasicMaterial({
		map: tex, vertexColors: true, transparent: true, depthWrite: false, fog: false, side: THREE.BackSide, opacity: 0.85,
	});
	const m = new THREE.Mesh(geo, mat);
	m.name = 'viking-clouds';
	// low over the far ridges: their foot in the mist, their tops in the sky
	m.position.y = SEA_SURFACE_Y + 46;
	m.renderOrder = -6;
	m.frustumCulled = false;
	return m;
}

/**
 * Turn the sky, the fjord and the sun so the sun stands at `azimuth`
 * (they are built for SUN.azimuth). Moves the key and rim lights too.
 */
function orientSun(azimuth) {
	if (!st.group || !Number.isFinite(azimuth)) return;
	const yaw = SUN.azimuth - azimuth;   // rotation.y by θ moves azimuth a to a - θ
	st.azimuth = azimuth;
	if (st.sky) st.sky.rotation.y = yaw;
	if (st.ridges) st.ridges.rotation.y = yaw;
	if (st.clouds) st.clouds.rotation.y = yaw;
	const ce = Math.cos(SUN.elevation);
	st.sunDir.set(Math.cos(azimuth) * ce, Math.sin(SUN.elevation), Math.sin(azimuth) * ce);
	if (st.path) st.path.rotation.y = Math.atan2(st.sunDir.x, st.sunDir.z);
	if (st.waterMat) st.waterMat.userData.vikingUniforms.uSunDir.value.copy(st.sunDir);
	placeLights();
}

/**
 * The key light comes in low from ahead and to one side of the player's
 * view (the sun's side, swung round so the faces toward the camera are
 * not all in shade); the cool rim/fill comes from behind the camera.
 */
function placeLights() {
	const l = st.lights;
	if (!l || !st.sunDir) return;
	const a = st.azimuth != null ? st.azimuth : SUN.azimuth;
	const key = a + 1.05 - 2 * SUN_OFF_AXIS;
	if (l.sun) l.sun.position.set(Math.cos(key) * 55, 30, Math.sin(key) * 55);
	if (l.rim) l.rim.position.set(-st.sunDir.x * 30, 16, -st.sunDir.z * 30);
}

/* ---------------------------------------------------- apply / restore */

function findLights(scene) {
	const out = { sun: null, hemi: null, ambient: null, rim: null };
	for (const c of scene.children) {
		if (!c || !c.isLight) continue;
		if (c.isHemisphereLight) out.hemi = out.hemi || c;
		else if (c.isAmbientLight) out.ambient = out.ambient || c;
		else if (c.isDirectionalLight) {
			if (c.castShadow && !out.sun) out.sun = c;
			else if (!out.rim) out.rim = c;
		}
	}
	return out;
}

function saveLight(l) {
	if (!l) return null;
	return {
		light: l, color: l.color.getHex(), intensity: l.intensity,
		position: l.position.clone(),
		ground: l.groundColor ? l.groundColor.getHex() : null,
	};
}

function portraitScreen() {
	try { return typeof window !== 'undefined' && window.innerHeight > window.innerWidth * 1.15; } catch (_e) { return false; }
}

function apply(THREE, scene) {
	const lights = findLights(scene);
	const water = scene.getObjectByName('tetches-water');
	const glow = scene.getObjectByName('tetches-water-glow');
	const saved = {
		background: scene.background,
		fog: scene.fog,
		lights: Object.values(lights).map(saveLight).filter(Boolean),
		water: water ? { obj: water, material: water.material } : null,
		glow: glow ? { obj: glow, visible: glow.visible } : null,
		decor: STANDARD_DECOR.map(n => scene.getObjectByName(n)).filter(Boolean).map(o => ({ obj: o, visible: o.visible })),
	};
	st.saved = saved;

	scene.background = new THREE.Color(PALETTE.horizon);
	// (a portrait phone's home view stands further back: thinner haze, or
	// the far shore and the ridges drowned in a grey band)
	scene.fog = new THREE.FogExp2(PALETTE.fog, PALETTE.fogDensity * (portraitScreen() ? 0.6 : 1));

	if (!st.group) {
		const built = buildGroup(THREE);
		st.group = built.group;
		st.sunDir = built.sunDir;
		st.sun = built.sun;
		st.path = built.path;
		st.ridges = built.ridges;
		st.clouds = built.clouds;
		st.sky = buildSky(THREE);
		st.seaMaps = seaMaps(THREE);
		st.waterMat = buildWaterMaterial(THREE, st.seaMaps);
	}
	st.lights = lights;
	if (st.group.parent !== scene) scene.add(st.group);
	if (st.sky.parent !== scene) scene.add(st.sky);
	st.group.visible = true;
	st.sky.visible = true;

	if (lights.sun) {
		lights.sun.color.setHex(PALETTE.sunLight);
		lights.sun.intensity = 1.3;
		lights.sun.userData.vikingThemed = true;
	}
	if (lights.hemi) {
		lights.hemi.color.setHex(PALETTE.hemiSky);
		lights.hemi.groundColor.setHex(PALETTE.hemiGround);
		lights.hemi.intensity = 0.6;
		lights.hemi.userData.vikingThemed = true;
	}
	if (lights.ambient) {
		lights.ambient.color.setHex(PALETTE.ambient);
		lights.ambient.intensity = 0.24;
		lights.ambient.userData.vikingThemed = true;
	}
	if (lights.rim) {
		lights.rim.color.setHex(PALETTE.rim);
		lights.rim.intensity = 0.45;
		lights.rim.userData.vikingThemed = true;
	}
	if (water) {
		water.material = st.waterMat;
		st.water = water;
		water.userData.vikingThemed = true;
	}
	orientSun(st.azimuth != null ? st.azimuth : SUN.azimuth);
	if (glow) glow.visible = false;
	for (const o of saved.decor) o.obj.visible = false;
}

function restore(scene) {
	const s = st.saved;
	st.saved = null;
	if (st.group) st.group.visible = false;
	if (st.sky) st.sky.visible = false;
	if (!s) return;
	scene.background = s.background;
	scene.fog = s.fog;
	for (const l of s.lights) {
		// a light setupLights has since replaced is not ours to touch
		if (l.light.parent !== scene) continue;
		l.light.color.setHex(l.color);
		l.light.intensity = l.intensity;
		l.light.position.copy(l.position);
		if (l.ground !== null && l.light.groundColor) l.light.groundColor.setHex(l.ground);
		delete l.light.userData.vikingThemed;
	}
	if (s.water && s.water.obj.parent === scene) {
		if (s.water.obj.material === st.waterMat) s.water.obj.material = s.water.material;
		delete s.water.obj.userData.vikingThemed;
	}
	st.lights = null;
	st.water = null;
	if (s.glow && s.glow.obj.parent === scene) s.glow.obj.visible = s.glow.visible;
	for (const o of s.decor) if (o.obj.parent === scene) o.obj.visible = o.visible;
}

/** Did setupLights rebuild the scene under us (new lights / new sea)? */
function stale(scene) {
	const lights = findLights(scene);
	if (lights.sun && !lights.sun.userData.vikingThemed) return true;
	const water = scene.getObjectByName('tetches-water');
	if (water && !water.userData.vikingThemed) return true;
	return false;
}

function anchorPoint() {
	const t = getControls()?.target;
	if (t && Number.isFinite(t.x)) return { x: t.x, z: t.z };
	return { x: 0, z: 0 };
}

/**
 * Per frame: turn the theme on or off as the game state changes (checked
 * twice a second), keep the sky on the camera and the fjord round the
 * arena. Returns at once in the standard game.
 */
export function updateVikingTheme(scene, gameState, time = 0) {
	if (!scene) return;
	if (!st.on && time - st.lastCheck < CHECK_MS) return;
	const THREE = (typeof window !== 'undefined' && window.THREE) || null;
	if (!THREE) return;

	if (time - st.lastCheck >= CHECK_MS) {
		st.lastCheck = time;
		const want = themeWanted(gameState);
		if (want && (!st.on || st.scene !== scene)) {
			if (st.on && st.scene) restore(st.scene);
			apply(THREE, scene);
			st.on = true;
			st.scene = scene;
			st.anchor = null;
		} else if (!want && st.on) {
			restore(scene);
			st.on = false;
		} else if (want && st.on && stale(scene)) {
			// setupLights ran again (profile switch back to normal): re-dress
			st.saved = null;
			apply(THREE, scene);
		}
		if (st.on) {
			// Face the sun to this player's home view (seat, takeover).
			const facing = localFacing(gameState);
			if (facing !== null) {
				const az = sunAzimuthFor(facing);
				if (st.azimuth == null || Math.abs(az - st.azimuth) > 1e-3) orientSun(az);
			}
		}
	}
	if (!st.on) return;
	animateVikingLand(scene);
	if (st.waterMat) {
		const u = st.waterMat.userData.vikingUniforms;
		u.uTime.value = time / 1000;
		if (gameState?.camera) u.uEye.value.copy(gameState.camera.position);
		const tg = anchorPoint();
		u.uTarget.value.set(tg.x, tg.z);
	}

	const cam = gameState?.camera;
	if (cam && st.sky) st.sky.position.copy(cam.position);
	// The sea follows the camera in whole units; shift its wavelets back
	// by the same amount so they stay put in the world, and let them drift.
	const w = st.water;
	if (w && w.material.map === st.seaMaps.map) {
		const rep = WATER_SIZE / SEA_TILE;
		const ox = (w.position.x / WATER_SIZE) * rep + time * 0.000004;
		const oy = (-w.position.z / WATER_SIZE) * rep + time * 0.0000025;
		st.seaMaps.map.offset.set(ox % 1, oy % 1);
		st.seaMaps.emissiveMap.offset.set((ox * 1.0 + 0.37) % 1, (oy + 0.61) % 1);
	}
	// The fjord stays put round the arena; jump with the camera only when
	// it travels far (flying to another battle or the world).
	const a = anchorPoint();
	if (!st.anchor || Math.hypot(a.x - st.anchor.x, a.z - st.anchor.z) > 60) {
		st.anchor = { x: a.x, z: a.z };
		st.group.position.set(a.x, 0, a.z);
	}
	// The sun hangs at a fixed bearing and height from the eye.
	if (cam && st.sun && st.sunDir) {
		st.sun.position.set(
			cam.position.x - st.group.position.x + st.sunDir.x * SUN_DISTANCE,
			cam.position.y + st.sunDir.y * SUN_DISTANCE,
			cam.position.z - st.group.position.z + st.sunDir.z * SUN_DISTANCE,
		);
	}
	// The road of glints runs from the viewer toward the sun, and is
	// only seen looking sunward (it is the sun's reflection).
	if (cam && st.path && st.sunDir) {
		const half = PATH_LENGTH / 2 + 6;
		st.path.position.x = cam.position.x - st.group.position.x + st.sunDir.x * half;
		st.path.position.z = cam.position.z - st.group.position.z + st.sunDir.z * half;
		if (!st.fwd) st.fwd = new THREE.Vector3();
		const fwd = typeof cam.getWorldDirection === 'function' ? cam.getWorldDirection(st.fwd) : null;
		let toward = 1;
		if (fwd) {
			const len = Math.hypot(fwd.x, fwd.z) || 1;
			const d = (fwd.x * st.sunDir.x + fwd.z * st.sunDir.z) / (len * Math.hypot(st.sunDir.x, st.sunDir.z));
			toward = Math.max(0, Math.min(1, (d - 0.05) / 0.5));
			// It is the sun's reflection: looking down on the sea (the play
			// camera) there is none, and its flecks magnified into blotches.
			const down = Math.asin(Math.max(-1, Math.min(1, -fwd.y)));   // radians below level
			const lvl = Math.max(0, Math.min(1, (0.78 - down) / (0.78 - 0.5)));
			toward *= lvl;
		}
		st.path.material.opacity = PATH_OPACITY * toward * toward * (3 - 2 * toward);
		st.path.visible = st.path.material.opacity > 0.01;
	}
}

/** For tests / diagnostics. */
export function _themeState() {
	return st;
}
