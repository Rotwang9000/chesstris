/**
 * Power-up orbs in a Viking battle: a carved rune stone.
 *
 * The standard orb is a glowing sphere over a translucent box with a
 * wireframe edge — in the fjord it read as a debug primitive and was
 * the brightest thing on screen. In a Viking game (normal render profile
 * only) the same orb visual is re-dressed:
 *
 *   stone   a small standing slab of dark stone, hovering and turning,
 *           with a rune for the piece inside cut into both faces in gold
 *           (fehu for a pawn, ehwaz the horse for a knight, algiz for a
 *           bishop, othala the homestead for a rook, sowilo the sun for
 *           a queen);
 *   glow    a soft warm halo behind it (no bloom, no spheres);
 *   mark    a faint ring of gold light on the water of the square to
 *           build on, and a thin shaft of light up to the stone, in
 *           place of the ghost box and its tether.
 *
 * The orb's bob, spin and the "hide on a ship" rule keep working: the
 * new parts take the userData slots of the old ones.
 * Cost per orb: 4 draw calls (stone, runes, halo, ring+shaft share none).
 */

import { SEA_SURFACE_Y } from '../seaLevel.js';

const GOLD = 0xf2c46a;
const STONE = 0x8a8577;      // weathered grey granite, warm in the low sun

/** Each rune as strokes in a unit box (x right, y up). */
export const RUNES = Object.freeze({
	// ᚠ fehu: wealth (the pawn's hope of promotion)
	PAWN: [[[0.32, 0], [0.32, 1]], [[0.32, 0.62], [0.74, 0.9]], [[0.32, 0.36], [0.74, 0.64]]],
	// ᛖ ehwaz: the horse
	KNIGHT: [[[0.24, 0], [0.24, 1]], [[0.76, 0], [0.76, 1]], [[0.24, 1], [0.5, 0.68]], [[0.5, 0.68], [0.76, 1]]],
	// ᛉ algiz: protection
	BISHOP: [[[0.5, 0], [0.5, 1]], [[0.5, 0.52], [0.16, 0.94]], [[0.5, 0.52], [0.84, 0.94]]],
	// ᛟ othala: the homestead
	ROOK: [[[0.5, 1], [0.84, 0.64]], [[0.84, 0.64], [0.2, 0]], [[0.5, 1], [0.16, 0.64]], [[0.16, 0.64], [0.8, 0]]],
	// ᛊ sowilo: the sun
	QUEEN: [[[0.66, 1], [0.3, 0.64]], [[0.3, 0.64], [0.7, 0.36]], [[0.7, 0.36], [0.34, 0]]],
});

const cache = {
	stoneGeo: null, stoneMat: null, runeMats: new Map(), runeGeo: null, halo: null, ringTex: null,
	ringGeo: null, shaftGeos: new Map(),
};

function canvas(size) {
	const c = document.createElement('canvas');
	c.width = c.height = size;
	return { c, g: c.getContext('2d') };
}

function runeTexture(THREE, type) {
	const S = 128;
	const { c, g } = canvas(S);
	g.clearRect(0, 0, S, S);
	const strokes = RUNES[type] || RUNES.PAWN;
	const pad = S * 0.2;
	const map = ([x, y]) => [pad + x * (S - 2 * pad), S - pad - y * (S - 2 * pad)];
	g.lineCap = 'round';
	g.lineJoin = 'round';
	// a soft glow under the cut, then the gilded cut itself
	for (const [w, a] of [[20, 0.2], [13, 0.4], [7.5, 1]]) {
		g.strokeStyle = a >= 1 ? 'rgba(255,214,130,1)' : `rgba(255,190,90,${a})`;
		g.lineWidth = w;
		for (const s of strokes) {
			const [x0, y0] = map(s[0]);
			const [x1, y1] = map(s[1]);
			g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
		}
	}
	const t = new THREE.CanvasTexture(c);
	t.needsUpdate = true;
	return t;
}

function haloTexture(THREE) {
	const S = 128;
	const { c, g } = canvas(S);
	const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
	grd.addColorStop(0, 'rgba(255,214,140,0.55)');
	grd.addColorStop(0.35, 'rgba(255,180,90,0.22)');
	grd.addColorStop(1, 'rgba(255,160,80,0)');
	g.fillStyle = grd;
	g.fillRect(0, 0, S, S);
	return new THREE.CanvasTexture(c);
}

function ringTexture(THREE) {
	const S = 128;
	const { c, g } = canvas(S);
	const grd = g.createRadialGradient(S / 2, S / 2, S * 0.22, S / 2, S / 2, S / 2);
	grd.addColorStop(0, 'rgba(255,210,130,0)');
	grd.addColorStop(0.55, 'rgba(255,210,130,0.75)');
	grd.addColorStop(0.7, 'rgba(255,200,120,0.35)');
	grd.addColorStop(1, 'rgba(255,200,120,0)');
	g.fillStyle = grd;
	g.fillRect(0, 0, S, S);
	return new THREE.CanvasTexture(c);
}

function stoneGeometry(THREE) {
	// a slab, a little wider at the foot, its faces knocked about
	const g = new THREE.CylinderGeometry(0.2, 0.26, 0.78, 6, 3);
	const pos = g.attributes.position;
	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
		const k = 1 + 0.07 * Math.sin(x * 9.1 + y * 5.3) + 0.05 * Math.cos(z * 11.7 - y * 3.1);
		// the crown rounded off
		const top = y > 0.3 ? 1 - (y - 0.3) * 0.9 : 1;
		pos.setXYZ(i, x * k * top * 1.25, y, z * k * top * 0.55);
	}
	g.computeVertexNormals();
	return g;
}

/** Is this visual dressed as a rune stone? */
export function isRuneStone(visual) {
	return !!(visual && visual.userData && visual.userData.runeStone);
}

/**
 * Re-dress an orb visual (powerUpRenderer buildOrbVisual) as a rune
 * stone. Idempotent. Returns true when it dressed it.
 * @param {Object} THREE
 * @param {THREE.Group} visual
 */
export function dressRuneStone(THREE, visual) {
	if (!THREE || !visual || !visual.userData || visual.userData.runeStone) return false;
	const ud = visual.userData;
	const type = String(ud.pieceType || 'PAWN').toUpperCase();
	const core = ud.orbCore;
	if (!core) return false;

	// Drop the box, its wireframe, the tether and the spheres.
	for (const part of [ud.block, ud.wireframe, ud.tether]) if (part && part.parent) part.parent.remove(part);
	for (const m of [ud.blockMaterial, ud.wireMaterial, ud.tetherMaterial]) if (m && m.dispose) m.dispose();
	if (ud.wireframe && ud.wireframe.geometry) ud.wireframe.geometry.dispose();
	for (const child of core.children.slice()) core.remove(child);
	ud.silhouette = null;

	if (!cache.stoneGeo) {
		cache.stoneGeo = stoneGeometry(THREE);
		cache.stoneMat = new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.9, metalness: 0, flatShading: true, emissive: 0x2a1c0c, emissiveIntensity: 0.6 });
		cache.runeGeo = new THREE.PlaneGeometry(0.54, 0.54);
		cache.halo = new THREE.SpriteMaterial({
			map: haloTexture(THREE), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
		});
		cache.ringTex = ringTexture(THREE);
	}
	let runeMat = cache.runeMats.get(type);
	if (!runeMat) {
		runeMat = new THREE.MeshBasicMaterial({ map: runeTexture(THREE, type), transparent: true, depthWrite: false, fog: true });
		cache.runeMats.set(type, runeMat);
	}

	const stone = new THREE.Mesh(cache.stoneGeo, cache.stoneMat);
	stone.name = 'rune-stone';
	core.add(stone);
	for (const side of [1, -1]) {
		const rune = new THREE.Mesh(cache.runeGeo, runeMat);
		rune.name = 'rune-glyph';
		rune.position.set(0, 0.02, side * 0.135);
		if (side < 0) rune.rotation.y = Math.PI;
		rune.renderOrder = 3;
		core.add(rune);
	}
	const halo = new THREE.Sprite(cache.halo);
	halo.name = 'rune-halo';
	halo.scale.set(1.9, 1.9, 1);
	halo.position.set(0, 0.02, 0);
	halo.renderOrder = 2;
	core.add(halo);
	core.scale.setScalar(1.15);

	// The square to build on: a ring of light on the water and a shaft
	// up to the stone (these take the ghost block's and tether's places,
	// so the "hide while a ship lies here" rule and the pulse still work).
	const ringMat = new THREE.MeshBasicMaterial({
		map: cache.ringTex, color: GOLD, transparent: true, depthWrite: false, opacity: 0.5, fog: true,
		blending: THREE.AdditiveBlending,
	});
	if (!cache.ringGeo) {
		cache.ringGeo = new THREE.PlaneGeometry(1.25, 1.25);
		cache.ringGeo.rotateX(-Math.PI / 2);
	}
	const ring = new THREE.Mesh(cache.ringGeo, ringMat);
	ring.name = 'rune-ring';
	ring.position.set(0, SEA_SURFACE_Y + 0.07, 0);
	ring.renderOrder = 2;
	visual.add(ring);

	const top = ud.baseY || 1.6;
	const shaftH = top - (SEA_SURFACE_Y + 0.1) - 0.3;
	const shaftMat = new THREE.MeshBasicMaterial({
		color: GOLD, transparent: true, opacity: 0.12, depthWrite: false, fog: true, blending: THREE.AdditiveBlending,
	});
	const hKey = shaftH.toFixed(2);
	let shaftGeo = cache.shaftGeos.get(hKey);
	if (!shaftGeo) {
		shaftGeo = new THREE.CylinderGeometry(0.035, 0.12, shaftH, 8, 1, true);
		cache.shaftGeos.set(hKey, shaftGeo);
	}
	const shaft = new THREE.Mesh(shaftGeo, shaftMat);
	shaft.name = 'rune-shaft';
	shaft.position.set(0, SEA_SURFACE_Y + 0.1 + shaftH / 2, 0);
	visual.add(shaft);

	ud.block = ring;
	ud.blockMaterial = ringMat;
	ud.wireframe = null;
	ud.wireMaterial = null;
	ud.tether = shaft;
	ud.tetherMaterial = shaftMat;
	ud.runeStone = true;
	// keep it a touch lower: a stone, not a balloon
	ud.baseY = Math.min(top, 1.35);
	return true;
}
