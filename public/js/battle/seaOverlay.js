/**
 * The rising sea, as the player sees it (Quick battles).
 *
 * • A countdown label: "The sea starts rising in 23s", then how long
 *   until the arena is gone.
 * • Flashing tiles on the ground the sea will take in the next few
 *   seconds, brighter the closer they are — over open water too, so
 *   the sweeping hand is always visible coming round.
 * • A bright line on the water marking the sea's edge: everything
 *   outside it is gone. It steps in by one cell where the hand is.
 *
 * Purely visual: the server sinks the cells and the normal board
 * updates remove them. Sink times come from the battle's `sea` timing
 * (see battleRules.js / server/battle/sea.js).
 */

import { getScene, getTHREE, getGameState } from '../gameContext.js';
import { translatePosition } from '../centreBoardMarker.js';
import { cellsSinkingBetween, serverNow } from './battleRules.js';

const HUD_ID = 'tetches-sea-hud';
const FRAME_MS = 120;
const TILE_Y = 0.5;          // just above a cell's top face (cells are 0.94 high, centred on 0)
const WATER_TILE_Y = -0.42;  // just above the water surface (-0.5)
const TILE_COLOUR = 0x2f9bff;
const EDGE_Y = -0.4;
const EDGE_WIDTH = 0.14;
const EDGE_COLOUR = 0xe8f6ff;

let timer = null;
let group = null;
let tileGeometry = null;
const tiles = new Map();     // "x,z" → mesh
let edge = null;             // { group, key }

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

function drawTiles(battle, now) {
	const THREE = getTHREE();
	const scene = getScene();
	const gameState = getGameState();
	if (!THREE || !scene || !gameState) return;
	ensureGroup(THREE, scene);

	const warningMs = battle.sea.warningMs || 5000;
	const due = cellsSinkingBetween(battle, now, now + warningMs);
	const wanted = new Set();
	const pulse = 0.65 + 0.35 * Math.sin(Date.now() / 90);
	for (const { x, z, t } of due) {
		const key = `${x},${z}`;
		const cell = gameState.board?.cells?.[key];
		const onGround = Array.isArray(cell) && cell.length > 0;
		wanted.add(key);
		let mesh = tiles.get(key);
		if (mesh && mesh.userData.onGround !== onGround) {
			group.remove(mesh);
			mesh.material?.dispose?.();
			tiles.delete(key);
			mesh = null;
		}
		if (!mesh) {
			mesh = new THREE.Mesh(tileGeometry, new THREE.MeshBasicMaterial({
				color: TILE_COLOUR, transparent: true, opacity: 0,
				side: THREE.DoubleSide, depthWrite: false,
			}));
			mesh.rotation.x = -Math.PI / 2;
			const abs = translatePosition({ x, z }, gameState, true);
			mesh.position.set(abs.x, onGround ? TILE_Y : WATER_TILE_Y, abs.z);
			mesh.userData.onGround = onGround;
			mesh.renderOrder = 900;
			group.add(mesh);
			tiles.set(key, mesh);
		}
		const urgency = 1 - Math.min(1, Math.max(0, (t - now) / warningMs));
		// Open water just shimmers; ground about to go flashes hard.
		mesh.material.opacity = (onGround ? 0.2 + 0.7 * urgency : 0.1 + 0.35 * urgency) * pulse;
	}
	for (const [key, mesh] of tiles) {
		if (wanted.has(key)) continue;
		group.remove(mesh);
		mesh.material?.dispose?.();
		tiles.delete(key);
	}
}

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
 * The sea's edge right now: band `b` is being eaten, so the swept part
 * of the circle sits half a cell inside it and the rest half a cell
 * outside, joined by a short step at the hand.
 */
function drawEdge(battle, now) {
	const THREE = getTHREE();
	const scene = getScene();
	const gameState = getGameState();
	if (!THREE || !scene || !gameState || !battle.centre) return;
	const sea = battle.sea;
	const laps = Math.max(0, (now - sea.startsAt) / sea.lapMs);
	const band = sea.outerBand - Math.floor(laps);
	const f = laps - Math.floor(laps);
	// Redraw only when the hand has visibly moved.
	const key = `${band}:${Math.round(f * 240)}`;
	if (edge?.key === key && edge.group.parent === scene) return;
	clearEdge();
	if (band < 0) return;

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
	if (now >= sea.startsAt && band > 0) {
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

function frame() {
	const gameState = getGameState();
	const battle = gameState?.activeBattle;
	if (!battle?.sea) {
		stopSeaOverlay();
		return;
	}
	const now = serverNow(battle);
	const text = seaHudText(battle.sea, now);
	if (text) ensureHud().textContent = text;
	else removeHud();
	try {
		drawTiles(battle, now);
		drawEdge(battle, now);
	} catch (_e) { /* rendering not ready yet */ }
}

/** Start the sea visuals for the battle now in view (idempotent). */
export function startSeaOverlay() {
	if (timer) return;
	timer = setInterval(frame, FRAME_MS);
	frame();
}

/** Remove the sea visuals (leaving or switching battles). */
export function stopSeaOverlay() {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
	clearTiles();
	clearEdge();
	if (group?.parent) group.parent.remove(group);
	group = null;
	removeHud();
}
