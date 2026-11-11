/**
 * The rising sea, as the player sees it (Quick battles).
 *
 * • The sea block: one block of water gliding cell by cell along the
 *   spiral, from the outer edge of the ring wall to the centre. It
 *   waits at its starting cell during the calm. Every cell it reaches
 *   dissolves (the server sinks it), with a splash where there was
 *   ground.
 * • A countdown label: "The sea starts rising in 23s", then how long
 *   until the arena is gone.
 * • Flashing tiles on the ground the block will reach in the next few
 *   seconds, brighter the closer they are.
 * • A bright line on the water marking the sea's edge: everything
 *   outside it is gone. It steps in by one cell where the block is.
 *
 * Purely visual: the server sinks the cells and the normal board
 * updates remove them. Timing comes from the battle's `sea` (see
 * battleRules.js / server/battle/sea.js).
 */

import { getScene, getTHREE, getGameState } from '../gameContext.js';
import { translatePosition } from '../centreBoardMarker.js';
import { cellsSinkingBetween, serverNow, seaBlockAt, seaSpiral } from './battleRules.js';
import { SEA_SURFACE_Y } from '../seaLevel.js';

const HUD_ID = 'tetches-sea-hud';
const SLOW_FRAME_MS = 120;   // HUD, warnings and edge; the block moves every frame
const TILE_Y = 0.5;          // just above a cell's top face (cells are 0.94 high, centred on 0)
const TILE_COLOUR = 0x2f9bff;
const EDGE_Y = SEA_SURFACE_Y + 0.1;
const EDGE_WIDTH = 0.14;
const EDGE_COLOUR = 0xe8f6ff;
const BLOCK_SIZE = 0.98;
const BLOCK_TOP = 0.7;       // stands a little proud of the ground it eats
const BLOCK_HEIGHT = BLOCK_TOP - SEA_SURFACE_Y; // and reaches down into the sea
const BLOCK_COLOUR = 0x0b4fb3;
const FOAM_COLOUR = 0xffffff;
const SPLASH_MS = 650;

let rafId = null;
let lastSlowFrame = 0;
let group = null;
let tileGeometry = null;
const tiles = new Map();     // "x,z" → mesh
let edge = null;             // { group, key, material }
let block = null;            // { group, lastIndex }
const splashes = [];         // { mesh, born }

function formatClock(ms) {
	const s = Math.max(0, Math.ceil(ms / 1000));
	const m = Math.floor(s / 60);
	return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

/** Label text for the sea at server time `now`, or '' when it's done. */
export function seaHudText(sea, now) {
	if (!sea) return '';
	if (now < sea.startsAt) return `🌊 The sea starts rising in ${formatClock(sea.startsAt - now)}`;
	if (now < sea.endsAt) return `🌊 The sea is rising — arena gone in ${formatClock(sea.endsAt - now)}`;
	return '';
}

function ensureHud() {
	let hud = document.getElementById(HUD_ID);
	if (hud) return hud;
	hud = document.createElement('div');
	hud.id = HUD_ID;
	// Phones stack the HUD buttons and the next-piece panel at the top,
	// so the label goes below them there.
	const narrow = window.innerWidth < 600;
	Object.assign(hud.style, {
		position: 'fixed',
		top: narrow ? '124px' : '58px',
		left: '50%',
		transform: 'translateX(-50%)',
		padding: '6px 14px',
		borderRadius: '16px',
		background: 'rgba(8, 30, 60, 0.82)',
		border: '1px solid rgba(80, 170, 255, 0.7)',
		color: '#cfe8ff',
		fontSize: narrow ? '12px' : '14px',
		fontFamily: 'inherit',
		whiteSpace: 'nowrap',
		zIndex: '9000',
		pointerEvents: 'none',
		maxWidth: 'calc(100vw - 32px)',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
	});
	document.body.appendChild(hud);
	return hud;
}

function removeHud() {
	document.getElementById(HUD_ID)?.remove();
}

function ensureGroup(THREE, scene) {
	if (group && group.parent === scene) return group;
	group = new THREE.Group();
	group.name = 'seaWarningTiles';
	scene.add(group);
	tileGeometry = tileGeometry || new THREE.PlaneGeometry(0.94, 0.94);
	return group;
}

function clearTiles() {
	for (const mesh of tiles.values()) {
		group?.remove(mesh);
		mesh.material?.dispose?.();
	}
	tiles.clear();
}

function hasGround(gameState, x, z) {
	const cell = gameState.board?.cells?.[`${x},${z}`];
	return Array.isArray(cell) ? cell.length > 0 : !!cell;
}

/** Flash the ground the block will reach in the next few seconds. */
function drawTiles(battle, now) {
	const THREE = getTHREE();
	const scene = getScene();
	const gameState = getGameState();
	if (!THREE || !scene || !gameState) return;
	ensureGroup(THREE, scene);

	const warningMs = battle.sea.warningMs || 5000;
	const wanted = new Set();
	const pulse = 0.65 + 0.35 * Math.sin(Date.now() / 90);
	for (const { x, z, t } of cellsSinkingBetween(battle, now, now + warningMs)) {
		if (!hasGround(gameState, x, z)) continue;
		const key = `${x},${z}`;
		wanted.add(key);
		let mesh = tiles.get(key);
		if (!mesh) {
			mesh = new THREE.Mesh(tileGeometry, new THREE.MeshBasicMaterial({
				color: TILE_COLOUR, transparent: true, opacity: 0,
				side: THREE.DoubleSide, depthWrite: false,
			}));
			mesh.rotation.x = -Math.PI / 2;
			const abs = translatePosition({ x, z }, gameState, true);
			mesh.position.set(abs.x, TILE_Y, abs.z);
			mesh.renderOrder = 900;
			group.add(mesh);
			tiles.set(key, mesh);
		}
		const urgency = 1 - Math.min(1, Math.max(0, (t - now) / warningMs));
		mesh.material.opacity = (0.2 + 0.7 * urgency) * pulse;
	}
	for (const [key, mesh] of tiles) {
		if (wanted.has(key)) continue;
		group.remove(mesh);
		mesh.material?.dispose?.();
		tiles.delete(key);
	}
}

// ── The sea block ───────────────────────────────────────────────────────────

function ensureBlock(THREE, scene) {
	if (block && block.group.parent === scene) return block;
	const blockGroup = new THREE.Group();
	blockGroup.name = 'seaBlock';
	const Material = THREE.MeshPhongMaterial || THREE.MeshBasicMaterial;
	const water = new THREE.Mesh(
		new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_HEIGHT, BLOCK_SIZE),
		new Material({ color: BLOCK_COLOUR, transparent: true, opacity: 0.95, shininess: 110, emissive: 0x06265c }),
	);
	const foam = new THREE.Mesh(
		new THREE.PlaneGeometry(BLOCK_SIZE * 0.98, BLOCK_SIZE * 0.98),
		new THREE.MeshBasicMaterial({ color: FOAM_COLOUR, transparent: true, opacity: 0.9, depthWrite: false }),
	);
	foam.rotation.x = -Math.PI / 2;
	foam.position.y = BLOCK_HEIGHT / 2 + 0.01;
	blockGroup.add(water);
	blockGroup.add(foam);
	blockGroup.renderOrder = 902;
	scene.add(blockGroup);
	block = { group: blockGroup, lastIndex: -1, foam };
	return block;
}

function removeBlock() {
	if (!block) return;
	block.group.parent?.remove(block.group);
	block.group.traverse((o) => {
		o.geometry?.dispose?.();
		o.material?.dispose?.();
	});
	block = null;
}

function splashAt(THREE, scene, gameState, x, z) {
	const abs = translatePosition({ x, z }, gameState, true);
	const mesh = new THREE.Mesh(
		new THREE.RingGeometry(0.3, 0.5, 24),
		new THREE.MeshBasicMaterial({ color: FOAM_COLOUR, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
	);
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.set(abs.x, 0.52, abs.z);
	mesh.renderOrder = 903;
	scene.add(mesh);
	splashes.push({ mesh, born: performance.now() });
}

function animateSplashes() {
	const now = performance.now();
	for (let i = splashes.length - 1; i >= 0; i--) {
		const { mesh, born } = splashes[i];
		const k = (now - born) / SPLASH_MS;
		if (k >= 1) {
			mesh.parent?.remove(mesh);
			mesh.geometry.dispose();
			mesh.material.dispose();
			splashes.splice(i, 1);
			continue;
		}
		const scale = 1 + 2.2 * k;
		mesh.scale.set(scale, scale, scale);
		mesh.material.opacity = 0.9 * (1 - k);
	}
}

function clearSplashes() {
	for (const { mesh } of splashes) {
		mesh.parent?.remove(mesh);
		mesh.geometry.dispose();
		mesh.material.dispose();
	}
	splashes.length = 0;
}

const ease = (t) => t * t * (3 - 2 * t);

/** Put the block where the sea is now: waiting at the start, gliding, or gone. */
function drawBlock(battle, now) {
	const THREE = getTHREE();
	const scene = getScene();
	const gameState = getGameState();
	if (!THREE || !scene || !gameState || !battle.centre) return;
	const sea = battle.sea;
	if (now >= sea.endsAt) {
		removeBlock();
		return;
	}
	const b = ensureBlock(THREE, scene);
	let x;
	let z;
	if (now < sea.startsAt) {
		// The calm: the block waits at the ring wall's northern edge.
		const first = seaSpiral(sea.outerBand).cells[0];
		x = battle.centre.x + first.dx;
		z = battle.centre.z + first.dz;
	} else {
		const at = seaBlockAt(battle, now);
		if (!at) return;
		// Each cell it reaches dissolves: splash where there was ground.
		if (at.index !== b.lastIndex) {
			if (b.lastIndex >= 0 && hasGround(gameState, at.x, at.z)) splashAt(THREE, scene, gameState, at.x, at.z);
			b.lastIndex = at.index;
		}
		const g = ease(at.glide);
		x = at.x + (at.nextX - at.x) * g;
		z = at.z + (at.nextZ - at.z) * g;
	}
	const abs = translatePosition({ x, z }, gameState, true);
	// Base just under the water line, crest above the ground's top.
	const bob = 0.06 * Math.sin(performance.now() / 260);
	b.group.position.set(abs.x, SEA_SURFACE_Y + BLOCK_HEIGHT / 2 + bob, abs.z);
	b.foam.material.opacity = 0.75 + 0.2 * Math.sin(performance.now() / 180);
}

// ── The sea's edge ──────────────────────────────────────────────────────────

/** An arc of the edge line between sweep fractions a..b at `radius`. */
function edgeArc(THREE, material, radius, a, b) {
	if (b - a <= 0 || radius <= 0) return null;
	const segments = Math.max(4, Math.ceil(96 * (b - a)));
	// Sweep fraction f (north = 0, clockwise) sits at θ = π/2 − 2πf once
	// the ring is laid flat; RingGeometry runs counter-clockwise.
	const geometry = new THREE.RingGeometry(
		Math.max(0, radius - EDGE_WIDTH / 2), radius + EDGE_WIDTH / 2,
		segments, 1, Math.PI / 2 - 2 * Math.PI * b, 2 * Math.PI * (b - a));
	const mesh = new THREE.Mesh(geometry, material);
	mesh.rotation.x = -Math.PI / 2;
	return mesh;
}

/**
 * The sea's edge right now: the block is working round band `b`, so the
 * part it has passed sits half a cell inside the band and the rest half
 * a cell outside, joined by a short step at the block.
 */
function drawEdge(battle, now) {
	const THREE = getTHREE();
	const scene = getScene();
	const gameState = getGameState();
	if (!THREE || !scene || !gameState || !battle.centre) return;
	const sea = battle.sea;
	const at = now < sea.startsAt ? null : seaBlockAt(battle, now);
	if (now >= sea.startsAt && !at) {
		clearEdge();
		return;
	}
	const band = at ? at.band : sea.outerBand;
	const f = at ? at.turn : 0;
	// Redraw only when the edge has visibly moved.
	const key = `${band}:${Math.round(f * 240)}`;
	if (edge?.key === key && edge.group.parent === scene) return;
	clearEdge();

	const material = new THREE.MeshBasicMaterial({
		color: EDGE_COLOUR, transparent: true, opacity: 0.85,
		side: THREE.DoubleSide, depthWrite: false,
	});
	const edgeGroup = new THREE.Group();
	edgeGroup.name = 'seaEdge';
	const abs = translatePosition({ x: battle.centre.x, z: battle.centre.z }, gameState, true);
	edgeGroup.position.set(abs.x, EDGE_Y, abs.z);
	for (const mesh of [
		edgeArc(THREE, material, band - 0.5, 0, f),
		edgeArc(THREE, material, band + 0.5, f, 1),
	]) {
		if (mesh) edgeGroup.add(mesh);
	}
	if (at && band > 0) {
		const step = new THREE.Mesh(new THREE.PlaneGeometry(EDGE_WIDTH, 1 + EDGE_WIDTH), material);
		step.rotation.x = -Math.PI / 2;
		step.rotation.z = -2 * Math.PI * f;
		step.position.set(Math.sin(2 * Math.PI * f) * band, 0, -Math.cos(2 * Math.PI * f) * band);
		edgeGroup.add(step);
	}
	edgeGroup.renderOrder = 901;
	scene.add(edgeGroup);
	edge = { group: edgeGroup, key, material };
}

function clearEdge() {
	if (!edge) return;
	edge.group.parent?.remove(edge.group);
	edge.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
	edge.material?.dispose?.();
	edge = null;
}

// ── Frame loop ──────────────────────────────────────────────────────────────

function frame() {
	rafId = null;
	const gameState = getGameState();
	const battle = gameState?.activeBattle;
	if (!battle?.sea) {
		stopSeaOverlay();
		return;
	}
	const now = serverNow(battle);
	try {
		drawBlock(battle, now);
		animateSplashes();
		const wall = performance.now();
		if (wall - lastSlowFrame >= SLOW_FRAME_MS) {
			lastSlowFrame = wall;
			const text = seaHudText(battle.sea, now);
			if (text) ensureHud().textContent = text;
			else removeHud();
			drawTiles(battle, now);
			drawEdge(battle, now);
		}
	} catch (_e) { /* rendering not ready yet */ }
	rafId = requestAnimationFrame(frame);
}

/** Start the sea visuals for the battle now in view (idempotent). */
export function startSeaOverlay() {
	if (rafId) return;
	lastSlowFrame = 0;
	rafId = requestAnimationFrame(frame);
}

/** Remove the sea visuals (leaving or switching battles). */
export function stopSeaOverlay() {
	if (rafId) {
		cancelAnimationFrame(rafId);
		rafId = null;
	}
	clearTiles();
	clearEdge();
	removeBlock();
	clearSplashes();
	if (group?.parent) group.parent.remove(group);
	group = null;
	removeHud();
}
