/**
 * Viking land (Viking edition, normal render profile only).
 *
 * The standard board floats pastel blocks on white cloud puffs. In a
 * Viking game the same cells are dressed as the paintings' shore:
 *
 *   colour   the arena wall is grey granite, each block a little
 *            different; player land is weathered timber (home rows) or
 *            turf (built land), stained with the player's colour so it
 *            still reads whose it is;
 *   surface  a matte, mottled finish on the instanced cells (a shader
 *            tweak on a copy of the instancer's material; the standard
 *            material is put back when the Viking game ends);
 *   base     instead of cloud puffs each cell stands on a rock that
 *            runs down into the sea, dark and wet at the waterline,
 *            with a thin line of breaking foam round it.
 *
 * Nothing here runs in the standard game: renderBoard asks
 * {@link vikingLandWanted} first and keeps its cloud puffs otherwise.
 * Cost: two instanced draw calls (rocks, foam) in place of the puffs'
 * one, and ~12 triangles per cell.
 */

import { vikingActive } from '../edition.js';
import { SEA_SURFACE_Y } from '../seaLevel.js';

/** Is the Viking land dressing wanted for this frame of the game? */
export function vikingLandWanted(gameState, isActive = vikingActive) {
	if (!gameState) return false;
	const profile = gameState.renderProfile
		|| (gameState.retroMode ? 'retro' : gameState.lowQuality ? 'cute' : 'normal');
	if (profile !== 'normal') return false;
	try { return !!isActive(gameState); } catch (_e) { return false; }
}

/* ------------------------------------------------------------ colours */

export const LAND = Object.freeze({
	granite: 0x7f8285,
	timber: 0x7a5e44,
	turf: 0x5e6a42,
	wet: 0x1e2925,
	rock: 0x5d5a55,
});

function rgb(hex) { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }
function hex(r, g, b) {
	const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
	return (c(r) << 16) | (c(g) << 8) | c(b);
}
function mixHex(a, b, t) {
	const A = rgb(a), B = rgb(b);
	return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
function scaleHex(a, k) {
	const A = rgb(a);
	return hex(A[0] * k, A[1] * k, A[2] * k);
}
/** Pull a colour toward its own grey (0 = unchanged, 1 = grey). */
function desaturate(a, t) {
	const [r, g, b] = rgb(a);
	const l = 0.3 * r + 0.59 * g + 0.11 * b;
	return hex(r + (l - r) * t, g + (l - g) * t, b + (l - b) * t);
}

/** A steady 0..1 per square (so a block keeps its shade between renders). */
export function cellNoise(x, z, salt = 0) {
	let h = (Math.imul(x | 0, 73856093) ^ Math.imul(z | 0, 19349663) ^ Math.imul(salt + 1, 83492791)) >>> 0;
	h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
	return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * The Viking colour for a cell, from the standard appearance
 * (rendering.js chooseAppearance). Returns a new appearance object;
 * opacity, transparency and decay are kept as they were.
 *
 * @param {{kind:string, color:number}} appearance
 * @param {number} x
 * @param {number} z
 */
export function vikingAppearance(appearance, x, z) {
	if (!appearance) return appearance;
	const n = cellNoise(x, z);
	const n2 = cellNoise(x, z, 7);
	const odd = ((x + z) & 1) === 1;
	let color = appearance.color;
	let roughness = 0.92;
	switch (appearance.kind) {
		case 'ring': {
			// granite: grey, a touch warm or cold block to block; one in
			// six is darker and weed-stained, one in eight bleached pale
			const g = mixHex(LAND.granite, n2 < 0.5 ? 0x8a8378 : 0x75808a, 0.5);
			const n3 = cellNoise(x, z, 11);
			const k = n3 < 0.16 ? 0.7 : (n3 > 0.875 ? 1.14 : 1);
			const weed = n3 < 0.16 ? mixHex(g, 0x56604a, 0.35) : g;
			color = scaleHex(weed, k * (odd ? 0.88 : 1) * (0.86 + 0.24 * n));
			break;
		}
		case 'home':
		case 'exhome':
		case 'tetromino': {
			// The player's colour, strong: the cell shader keeps it for the
			// top and a painted band under the top edge, and turns the
			// sides below to plain weathered stone (see mottle), so whose
			// land it is reads at a glance and the arena wall stays granite.
			const base = appearance.kind === 'tetromino' ? LAND.turf : LAND.timber;
			const stained = mixHex(desaturate(appearance.color, 0.12), base, appearance.kind === 'tetromino' ? 0.16 : 0.12);
			color = scaleHex(stained, 0.94 + 0.1 * n);
			roughness = 0.88;
			break;
		}
		case 'default': {
			color = scaleHex(odd ? 0x5d6a48 : 0x8f8a76, 0.92 + 0.14 * n);
			break;
		}
		default:
			break;
	}
	return { ...appearance, color, roughness, metalness: 0 };
}

/* ------------------------------------------------- the cells' finish */

const dressed = new WeakMap();   // instanced mesh -> its own (standard) material

/**
 * A shader tweak for a standard material: world-space value noise
 * mottles the colour (scale `freq`), and faces darken toward local
 * height `y0` (to `dark` of their colour) from `y1` up.
 */
function mottle(freq, y0, y1, dark, cells = false) {
	return (shader) => {
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec3 vVkPos;\nvarying float vVkY;\nvarying float vVkUp;'
				+ (cells ? '\nattribute float vkOwn;\nvarying float vVkOwn;' : ''))
			.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvVkUp = objectNormal.y;'
				+ (cells ? '\nvVkOwn = vkOwn;' : ''))
			.replace('#include <project_vertex>', `#include <project_vertex>
vec4 vkW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
	vkW = instanceMatrix * vkW;
#endif
vVkPos = (modelMatrix * vkW).xyz;
vVkY = transformed.y;`);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>
${cells ? 'varying float vVkOwn;' : ''}
varying vec3 vVkPos;
varying float vVkY;
varying float vVkUp;
float vkHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vkNoise(vec3 x) {
	vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(vkHash(i), vkHash(i + vec3(1,0,0)), f.x), mix(vkHash(i + vec3(0,1,0)), vkHash(i + vec3(1,1,0)), f.x), f.y),
		mix(mix(vkHash(i + vec3(0,0,1)), vkHash(i + vec3(1,0,1)), f.x), mix(vkHash(i + vec3(0,1,1)), vkHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`)
			.replace('#include <color_fragment>', `#include <color_fragment>
{
	float n = vkNoise(vVkPos * ${freq.toFixed(2)}) * 0.6 + vkNoise(vVkPos * ${(freq * 2.8).toFixed(2)}) * 0.4;
	// Whose land: the top and a band under the top edge keep the cell's
	// colour; the sides below it are that colour weathered to stone, with
	// a dark seam under the band. (Grey granite stays grey either way.)
	vec3 own = diffuseColor.rgb;
	float lum = dot(own, vec3(0.3, 0.59, 0.11));
	vec3 stone = mix(vec3(lum) * vec3(1.0, 0.97, 0.93), own, 0.3);
	float top = smoothstep(0.55, 0.8, vVkUp);
	float band = smoothstep(0.285, 0.305, vVkY);
	float seam = smoothstep(0.245, 0.265, vVkY) * (1.0 - band);
	diffuseColor.rgb = mix(stone, own, max(top, band));
	diffuseColor.rgb *= 1.0 - 0.4 * seam * (1.0 - top);
	diffuseColor.rgb *= 0.84 + 0.3 * n;
${cells ? `
	// Whose it is, at a glance: player land (coloured, or the white and
	// black armies' near-white / near-black) gets a planked timber deck
	// on top and a row of round shields along its upper edge, as on a
	// longship's rail; granite (grey) gets weed at its foot and lichen.
	float isOwn = step(0.5, vVkOwn);
	// planks on the deck, running along x, seams every 0.235
	float pv = vVkPos.z / 0.235;
	float seamP = smoothstep(0.42, 0.5, abs(fract(pv) - 0.5));
	float grain = vkNoise(vec3(vVkPos.x * 1.3, floor(pv) * 7.1, 0.0)) * 0.5 + vkNoise(vec3(vVkPos.x * 9.0, pv * 3.0, 1.0)) * 0.5;
	float deck = top * isOwn;
	diffuseColor.rgb *= mix(1.0, (0.86 + 0.24 * grain) * (1.0 - 0.45 * seamP), deck);
	// shields: a disc every 0.235 along the band, rim dark, boss pale
	float along = vVkPos.x + vVkPos.z;
	vec2 sp = vec2((fract(along / 0.2) - 0.5) * 0.2, vVkY - 0.385);
	float d = length(sp);
	float shield = (1.0 - smoothstep(0.058, 0.064, d)) * (1.0 - top) * band * isOwn;
	float rim = smoothstep(0.046, 0.052, d) * shield;
	float boss = (1.0 - smoothstep(0.011, 0.016, d)) * shield;
	float alt = step(0.5, fract(along / 0.4));
	// painted shields: the army's colour and undyed cream in turn (a pale
	// army paints madder red, as on its sail)
	vec3 dye = lum > 0.7 ? vec3(0.62, 0.18, 0.14) : own * 1.05;
	vec3 face = mix(dye, vec3(0.9, 0.85, 0.72), alt);
	diffuseColor.rgb = mix(diffuseColor.rgb, face, shield);
	diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.22, 0.14), rim * 0.8);
	diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.68, 0.45), boss);
	// granite: dark wet weed creeping up from the foot, lichen on top
	float granite = 1.0 - isOwn;
	float weedLine = -0.2 + 0.18 * vkNoise(vVkPos * 3.1);
	float weedK = (1.0 - smoothstep(weedLine - 0.12, weedLine + 0.04, vVkY)) * (1.0 - top) * granite;
	diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.16, 0.11) * (0.8 + 0.4 * n), weedK * 0.85);
	float lichen = smoothstep(0.7, 0.8, vkNoise(vVkPos * 5.3) * 0.7 + vkNoise(vVkPos * 17.0) * 0.3) * granite * top;
	diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.92, 1.0, 0.82), lichen * 0.5);
` : ''}
	diffuseColor.rgb *= mix(${dark.toFixed(2)}, 1.0, smoothstep(${y0.toFixed(2)}, ${y1.toFixed(2)}, vVkY));
}`);
	};
}

/**
 * A matte, mottled copy of the instancer's material: a little world-space
 * noise darkens and lightens each block's faces, and the sides darken
 * toward the base, so blocks read as stone and timber, not plastic.
 */
function vikingCellMaterial(THREE, from) {
	const m = new THREE.MeshStandardMaterial({
		color: 0xffffff,
		roughness: 0.9,
		metalness: 0,
		transparent: from.transparent,
		opacity: from.opacity,
	});
	m.name = 'viking-cells';
	m.onBeforeCompile = mottle(6.0, -0.47, 0.3, 0.72, true);
	m.customProgramCacheKey = () => 'viking-cells-v4';
	return m;
}

/**
 * Dress (or undress) one of renderBoard's instanced cell meshes. Safe to
 * call after every rebuild: the instancer may have swapped its mesh.
 */
export function dressInstancedCells(THREE, mesh, on) {
	if (!mesh || !mesh.material) return;
	const own = dressed.get(mesh);
	if (on) {
		if (own) return;
		const std = mesh.material;
		const viking = vikingCellMaterial(THREE, std);
		// A copy of the (shared) cell geometry carrying one flag per
		// instance: is this block a player's land (timber deck, shields)
		// or the arena's granite? Colour alone could not tell: a black
		// army's land is blended toward the same warm grey.
		const stdGeo = mesh.geometry;
		const geo = stdGeo.clone();
		const cap = mesh.instanceMatrix ? mesh.instanceMatrix.count : 1;
		geo.setAttribute('vkOwn', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap)), 1));
		mesh.geometry = geo;
		dressed.set(mesh, { std, viking, stdGeo, geo });
		mesh.material = viking;
	} else if (own) {
		if (mesh.material === own.viking) mesh.material = own.std;
		if (own.geo && mesh.geometry === own.geo) { mesh.geometry = own.stdGeo; own.geo.dispose(); }
		own.viking.dispose();
		dressed.delete(mesh);
	}
}

/**
 * Viking land: mark which instances are a player's land (see
 * dressInstancedCells). `cells` are the instancer's rebuild list, in
 * instance order, each with `own` true for player land.
 */
export function setVikingOwnership(mesh, cells) {
	const a = mesh && mesh.geometry && mesh.geometry.getAttribute && mesh.geometry.getAttribute('vkOwn');
	if (!a || !Array.isArray(cells)) return;
	const n = Math.min(cells.length, a.count);
	for (let i = 0; i < n; i++) a.setX(i, cells[i] && cells[i].own ? 1 : 0);
	a.needsUpdate = true;
}

/* -------------------------------------------------- rocks and foam */

const ROCK_NAME = 'vikingRocks';
const FOAM_NAME = 'vikingShoreFoam';
const ROCK_TOP = -0.42;                  // tucked just inside the cell's underside (-0.47)
const ROCK_BOTTOM = SEA_SURFACE_Y - 0.9;

function rockGeometry(THREE) {
	// A square frustum, wider at the foot, so neighbours' rocks run
	// together into one skerry at the waterline.
	const h = ROCK_TOP - ROCK_BOTTOM;
	const g = new THREE.CylinderGeometry(0.47 * Math.SQRT2, 0.6 * Math.SQRT2, h, 4, 6, true);
	g.rotateY(Math.PI / 4);
	g.translate(0, (ROCK_TOP + ROCK_BOTTOM) / 2, 0);
	const pos = g.attributes.position;
	// Clean planes (a crumpled, faceted skirt under every block read as
	// crushed paper): the plinth runs straight down into the sea, dark
	// and wet in a band at the waterline.
	const col = new Float32Array(pos.count * 3);
	const rock = rgb(LAND.rock).map(v => v / 255);
	const wet = rgb(LAND.wet).map(v => v / 255);
	for (let i = 0; i < pos.count; i++) {
		const y = pos.getY(i);
		const k = Math.max(0, Math.min(1, (y - (SEA_SURFACE_Y + 0.05)) / 0.55));
		const kk = k * k * (3 - 2 * k);
		for (let c = 0; c < 3; c++) col[i * 3 + c] = wet[c] + (rock[c] * 0.82 - wet[c]) * kk;
	}
	g.setAttribute('color', new THREE.BufferAttribute(col, 3));
	return g.toNonIndexed ? g.toNonIndexed() : g;
}

function foamTexture(THREE) {
	const S = 128;
	const c = document.createElement('canvas');
	c.width = c.height = S;
	const g = c.getContext('2d');
	let a = 1234567;
	const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
	// A rounded-square band: strongest just outside the rock's foot
	// (half-width 0.66 of a 2.0 plane), gone by the plane's edge.
	const img = g.createImageData ? g.createImageData(S, S) : null;
	for (let y = 0; img && img.data && y < S; y++) {
		for (let x = 0; x < S; x++) {
			const u = Math.abs((x + 0.5) / S * 2 - 1), v = Math.abs((y + 0.5) / S * 2 - 1);
			const d = Math.pow(Math.pow(u, 6) + Math.pow(v, 6), 1 / 6);   // rounded square, 0..1 at the edge
			const inner = 0.55, peak = 0.63, outer = 0.9;
			let t = d < peak ? Math.max(0, (d - inner) / (peak - inner)) : Math.max(0, 1 - (d - peak) / (outer - peak));
			t = t * t;
			const o = (y * S + x) * 4;
			img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
			img.data[o + 3] = Math.round(255 * t * 0.9);
		}
	}
	if (img && img.data) g.putImageData(img, 0, 0);
	// lace: flecks of brighter foam along the band
	for (let i = 0; i < 260; i++) {
		const ang = rnd() * Math.PI * 2;
		const r = (0.62 + 0.22 * Math.pow(rnd(), 1.5)) * S / 2;
		const px = S / 2 + Math.cos(ang) * r * 1.08, py = S / 2 + Math.sin(ang) * r * 1.08;
		g.fillStyle = `rgba(255,255,255,${0.12 + 0.3 * rnd()})`;
		g.beginPath(); g.arc(px, py, 0.6 + 1.6 * rnd(), 0, Math.PI * 2); g.fill();
	}
	const t = new THREE.CanvasTexture(c);
	return t;
}

/**
 * The foam rides the swell: its vertices are lifted by the same height
 * function scene.js gives the sea (base swell plus ripple), so the line
 * of surf never sinks under the water or floats above it.
 */
function foamMaterial(THREE, tex) {
	const m = new THREE.MeshBasicMaterial({
		map: tex, transparent: true, depthWrite: false, opacity: 0.85, color: 0xf4f1ea, fog: true,
	});
	const uniforms = { uWaterXZ: { value: new THREE.Vector2() }, uSeaT: { value: 0 }, uSeaY: { value: SEA_SURFACE_Y } };
	m.userData.uniforms = uniforms;
	m.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nuniform vec2 uWaterXZ;\nuniform float uSeaT;\nuniform float uSeaY;')
			.replace('#include <project_vertex>', `
vec4 vkW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
	vkW = instanceMatrix * vkW;
#endif
vkW = modelMatrix * vkW;
vec2 l = vkW.xz - uWaterXZ;
float h = (sin(l.x * 0.04) + cos(l.y * 0.05)) * 0.18 + sin(l.x * 0.06 + uSeaT * 0.45) * 0.05 + cos(l.y * 0.05 - uSeaT * 0.4) * 0.04;
vkW.y = uSeaY + h + 0.05;
vec4 mvPosition = viewMatrix * vkW;
gl_Position = projectionMatrix * mvPosition;`);
	};
	m.customProgramCacheKey = () => 'viking-shore-foam-v1';
	return m;
}

/**
 * The rock-and-foam bed under a Viking board, with the cloud puffs'
 * interface: rebuild(cells), getMesh(), dispose().
 */
export function createVikingBase(THREE, boardGroup) {
	const rockGeo = rockGeometry(THREE);
	const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
	rockMat.onBeforeCompile = mottle(3.2, -1.6, -0.6, 0.8);
	rockMat.customProgramCacheKey = () => 'viking-rocks-v2';
	const foamGeo = new THREE.PlaneGeometry(2.0, 2.0);
	foamGeo.rotateX(-Math.PI / 2);
	const tex = foamTexture(THREE);
	const foamMat = foamMaterial(THREE, tex);
	let capacity = 0;
	let rocks = null;
	let foam = null;
	const _m = new THREE.Matrix4();
	const _p = new THREE.Vector3();
	const _q = new THREE.Quaternion();
	const _s = new THREE.Vector3();
	const _e = new THREE.Euler();
	const _c = new THREE.Color();
	const UP = new THREE.Vector3(0, 1, 0);

	function ensureCapacity(n) {
		if (rocks && n <= capacity) return;
		const cap = Math.max(256, capacity * 2, n);
		disposeMeshes();
		rocks = new THREE.InstancedMesh(rockGeo, rockMat, cap);
		rocks.name = ROCK_NAME;
		// (boardWide: instances span the board, so distanceCulling leaves it be)
		rocks.userData = { type: 'vikingRocks', isStatic: true, noRaycast: true, boardWide: true };
		rocks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
		rocks.frustumCulled = false;
		rocks.castShadow = false;
		rocks.receiveShadow = true;
		rocks.raycast = () => {};
		foam = new THREE.InstancedMesh(foamGeo, foamMat, cap);
		foam.name = FOAM_NAME;
		foam.userData = { type: 'vikingShoreFoam', isStatic: true, noRaycast: true, boardWide: true };
		foam.frustumCulled = false;
		foam.renderOrder = 1;
		foam.raycast = () => {};
		boardGroup.add(rocks);
		boardGroup.add(foam);
		capacity = cap;
	}

	function rebuild(cells) {
		const list = Array.isArray(cells) ? cells : [];
		ensureCapacity(Math.max(1, list.length));
		let i = 0;
		for (const cell of list) {
			const x = cell.pos.x, z = cell.pos.z;
			const n = cellNoise(x, z, 3), n2 = cellNoise(x, z, 5);
			_p.set(cell.absX, 0, cell.absZ);
			// square to the board (a jumble of tilted plinths read as a
			// crumpled skirt), only a little wider or narrower at the foot
			_e.set(0, Math.floor(n2 * 4) * Math.PI / 2, 0);
			_q.setFromEuler(_e);
			_s.set(1 + (n - 0.5) * 0.06, 1, 1 + (n2 - 0.5) * 0.06);
			_m.compose(_p, _q, _s);
			rocks.setMatrixAt(i, _m);
			_c.setScalar(0.85 + 0.3 * n);
			rocks.setColorAt(i, _c);
			_q.setFromAxisAngle(UP, Math.floor(n * 4) * Math.PI / 2);
			_s.set(1, 1, 1);
			_m.compose(_p, _q, _s);
			foam.setMatrixAt(i, _m);
			i++;
		}
		rocks.count = i;
		foam.count = i;
		rocks.instanceMatrix.needsUpdate = true;
		if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
		foam.instanceMatrix.needsUpdate = true;
	}

	function getMesh() { return rocks; }

	function disposeMeshes() {
		if (rocks) { boardGroup.remove(rocks); rocks.dispose(); rocks = null; }
		if (foam) { boardGroup.remove(foam); foam.dispose(); foam = null; }
	}

	function dispose() {
		disposeMeshes();
		capacity = 0;
	}

	return { rebuild, getMesh, dispose, foamMaterial: foamMat };
}

/**
 * Per frame (from the theme): keep the shore foam on the moving sea.
 * Returns at once when there is no Viking board.
 */
export function animateVikingLand(scene) {
	const board = scene && scene.getObjectByName('boardGroup');
	const foam = board && board.getObjectByName(FOAM_NAME);
	if (!foam) return;
	const water = scene.getObjectByName('tetches-water');
	const u = foam.material && foam.material.userData && foam.material.userData.uniforms;
	if (!u || !water) return;
	u.uWaterXZ.value.set(water.position.x, water.position.z);
	u.uSeaT.value = (performance.now() - (water.userData.startedAt || 0)) / 1000;
	u.uSeaY.value = water.position.y;
	const t = u.uSeaT.value;
	foam.material.opacity = 0.75 + 0.12 * Math.sin(t * 0.9);
}
