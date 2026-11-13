/**
 * Longship controls: select a ship, see its sail lanes, sail it.
 *
 * How a player sails (also in the rules text, battle/vikingRules.js):
 *   • Tap / click your longship (empty or laden), or press the
 *     Longship button or L: gold-edged sea-green tiles show every
 *     square it can reach this leg (up to 5 squares in a straight line
 *     over open water). Tap a tile to sail there.
 *   • Tap your piece aboard (or its hull, which resolves to the
 *     piece): its chess moves show as rings AND the ship's lanes show
 *     as tiles. Tap a ring to step off (or raid), a tile to sail with
 *     it. The Longship button / L select the ship alone.
 *   • Keyboard: L selects your ship (again for the next one), arrows
 *     pick a lane, Enter sails, Escape cancels.
 * Sailing is offered in your chess move only, and does not use it up.
 * After a sail the ship rows for 3 s: its own side can't step on or
 * off (enemies still can), and it can't sail again yet.
 *
 * Ship rules are only live in Viking battles (shipEnv.shipRulesActive);
 * outside them every entry point here is a no-op, so the standard game
 * is untouched.
 */

import {
	getTHREE, getGameState, getScene, getChessPiecesGroup, getBoardGroup,
} from '../gameContext.js';
import { translatePosition } from '../centreBoardMarker.js';
import { SEA_SURFACE_Y } from '../seaLevel.js';
import { showToastMessage } from '../showToastMessage.js';
import { getSocket } from '../utils/networkManager.js';
import { ensureActionStack, positionUnderNextPiece } from '../skipChessButton.js';
import {
	shipRulesActive, shipServerNow, noteSailReadyAt, listShips, shipsControlledBy, shipEntryAt,
	findShip, laneTargets, checkSail, rowingMsLeft, shipRefusalText, cellItems,
} from './shipEnv.js';
import { shipButtonState, updateFleetMemo } from './shipHudState.js';
import { SHIP_EVENT } from './shipEvents.js';
import { shipEventToast } from './shipEventToasts.js';
import { clearChessSelection, showValidMoves } from '../chessInteraction.js';
import {
	shipObjects, seaHeightAt, shipPose, setShipFrameHook, prepareShips,
} from '../viking/shipRenderer.js';
import { isViking } from '../edition.js';
import { isTouchPrimary } from '../utils/inputMode.js';
import { DECK_HEIGHT, SHIP_LENGTH_CELLS } from '../viking/shipLayout.js';

/**
 * The lane tiles lie ON the sea: every frame each one takes the swell's
 * height at its centre (shipRenderer.seaHeightAt, the same triangles
 * the GPU draws) plus a hair. They are depth-tested, so an island
 * between the camera and a lane hides it, and a hull riding over a tile
 * hides the part beneath it (no tile ever slices through a ship).
 */
const LANE_LIFT = 0.03;
/** The hull ring is longer (~3 units): lifted more, clear of the swell's tilt. */
const RING_LIFT = 0.055;
/** Sea level for pointer maths (water clicks), the swell's mean. */
const LANE_Y = SEA_SURFACE_Y;
/** Deck height for rings on ship squares (the passenger stands here). */
export const SHIP_DECK_Y = SEA_SURFACE_Y + DECK_HEIGHT + 0.08;
/** Pick planes for a ship body, top first (the ray meets them in order). */
const PICK_HEIGHTS = [SEA_SURFACE_Y + 1.1, SEA_SURFACE_Y + 0.6, SEA_SURFACE_Y + 0.15];
const SAIL_ACK_TIMEOUT_MS = 6000;
const BUTTON_ID = 'longship-button';

// Lanes are soft gold on the water: a pale wash with a ring of dotted
// gold at each reachable square (like the gilt on the prow), not
// outlined debug squares.
const LANE_FILL = 0xffe2a0;
const LANE_EDGE = 0xf2c76a;

const selection = { shipId: null, withPiece: false, lanes: [], rowingAt: 0 };
let sailInFlight = false;
let ackClockLearnt = false;
let fleetMemo = null;
let fleetMemoBattle = null;
let installed = false;

// ── Helpers ──────────────────────────────────────────────────────────────────

function gs() {
	return getGameState();
}

function mySeat(gameState) {
	return gameState?.localPlayerId ?? gameState?.currentPlayer ?? null;
}

function isMine(gameState, entry) {
	return !!entry && String(entry.ship.player) === String(mySeat(gameState));
}

function toast(message, opts = {}) {
	// Clear of the selected piece's info card (phones): these hints are
	// about the piece or ship just tapped.
	try { showToastMessage(message, { duration: 3500, aboveInfoCard: true, ...opts }); } catch (_e) { /* best-effort */ }
}

function worldXZ(gameState, x, z) {
	const p = translatePosition({ x, z }, gameState, true);
	return { x: Number(p.x), z: Number(p.z) };
}

function gridXZ(gameState, wx, wz) {
	const origin = translatePosition({ x: 0, z: 0 }, gameState, true);
	return { x: Math.round(wx - Number(origin.x || 0)), z: Math.round(wz - Number(origin.z || 0)) };
}

/** Is this ship square in the rules' reach right now? */
export function shipControlsActive(gameState = gs()) {
	return shipRulesActive(gameState);
}

// ── Lane meshes ──────────────────────────────────────────────────────────────

let meshCache = null;
function meshes(THREE) {
	if (meshCache) return meshCache;
	// A 4-segment ring turned 45° is a square frame.
	meshCache = {
		tile: new THREE.PlaneGeometry(0.84, 0.84),
		frame: new THREE.PlaneGeometry(0.92, 0.92),
		// The chosen ship: a gold ring round its hull at the waterline
		// (an ellipse the hull's length and beam), plus a faint halo.
		shipRing: ellipseRing(THREE, SHIP_LENGTH_CELLS / 2 + 0.12, 0.36, 0.07),
		shipHalo: ellipseRing(THREE, SHIP_LENGTH_CELLS / 2 + 0.2, 0.44, 0.16),
		hit: new THREE.PlaneGeometry(1, 1),
		hitMat: new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
		edgeMat: new THREE.MeshBasicMaterial({
			color: LANE_EDGE, transparent: true, opacity: 0.7,
			side: THREE.DoubleSide, depthTest: true, depthWrite: false,
		}),
		dotsMat: new THREE.MeshBasicMaterial({
			color: 0xffffff, map: laneTexture(THREE, 'dots'), transparent: true, opacity: 0.9,
			side: THREE.DoubleSide, depthTest: true, depthWrite: false,
		}),
		washTex: laneTexture(THREE, 'wash'),
		fills: new Map(),
	};
	return meshCache;
}

/**
 * Lane art, drawn once: 'wash' a soft round pool of light with a
 * foam-flecked rim; 'dots' a ring of gold beads (a rope of rivets).
 */
function laneTexture(THREE, kind) {
	const S = 128;
	const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
	if (!c || !c.getContext) return null;
	c.width = c.height = S;
	const g = c.getContext('2d');
	if (!g) return null;
	const mid = S / 2;
	if (kind === 'wash') {
		const grd = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
		grd.addColorStop(0, 'rgba(255,255,255,0.35)');
		grd.addColorStop(0.55, 'rgba(255,255,255,0.22)');
		grd.addColorStop(0.78, 'rgba(255,255,255,0.5)');
		grd.addColorStop(0.9, 'rgba(255,255,255,0.12)');
		grd.addColorStop(1, 'rgba(255,255,255,0)');
		g.fillStyle = grd;
		g.fillRect(0, 0, S, S);
	} else {
		g.fillStyle = 'rgba(255,214,130,1)';
		const n = 14;
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2;
			g.beginPath();
			g.arc(mid + Math.cos(a) * mid * 0.8, mid + Math.sin(a) * mid * 0.8, S * 0.035, 0, Math.PI * 2);
			g.fill();
		}
	}
	const t = new THREE.CanvasTexture(c);
	return t;
}

/**
 * A flat elliptical band in the XZ plane (y = 0), semi-axes `a` along Z
 * (the keel) and `b` along X, `w` wide, outward from the ellipse.
 */
function ellipseRing(THREE, a, b, w, segments = 72) {
	const pos = [];
	const idx = [];
	for (let i = 0; i <= segments; i++) {
		const t = (i / segments) * Math.PI * 2;
		const c = Math.cos(t), s = Math.sin(t);
		pos.push(s * b, 0, c * a, s * (b + w), 0, c * (a + w));
		if (i < segments) {
			const k = i * 2;
			idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setIndex(idx);
	g.computeBoundingSphere();
	return g;
}

function fillMaterial(THREE, opacity) {
	const cache = meshes(THREE).fills;
	const key = opacity.toFixed(2);
	if (!cache.has(key)) {
		cache.set(key, new THREE.MeshBasicMaterial({
			color: LANE_FILL, map: meshes(THREE).washTex || null, transparent: true, opacity,
			side: THREE.DoubleSide, depthTest: true, depthWrite: false,
		}));
	}
	return cache.get(key);
}

function lanesGroup(THREE, scene) {
	if (!window.sailLanesGroup) {
		window.sailLanesGroup = new THREE.Group();
		window.sailLanesGroup.name = 'sailLanes';
		scene.add(window.sailLanesGroup);
	}
	return window.sailLanesGroup;
}

function clearLaneMeshes() {
	const group = window.sailLanesGroup;
	if (!group) return;
	while (group.children.length) {
		const child = group.children[0];
		if (child?.userData?.tween?.stop) {
			try { child.userData.tween.stop(); } catch (_e) { /* ignore */ }
		}
		group.remove(child);
	}
}

function drawSelection(gameState, entry, lanes) {
	const THREE = getTHREE();
	const scene = getScene();
	if (!THREE || !scene) return;
	clearLaneMeshes();
	const group = lanesGroup(THREE, scene);
	const m = meshes(THREE);

	// The chosen ship: a gold ring round its hull at the waterline (it
	// follows the hull's glide, heading and bob; see animateSailLanes).
	const at = worldXZ(gameState, entry.x, entry.z);
	const ring = new THREE.Group();
	ring.name = 'sailShipRing';
	ring.userData = { sailShip: true, shipId: entry.ship.shipId };
	const band = new THREE.Mesh(m.shipRing, m.edgeMat);
	band.renderOrder = 998;
	const halo = new THREE.Mesh(m.shipHalo, m.haloMat || (m.haloMat = new THREE.MeshBasicMaterial({
		color: LANE_EDGE, transparent: true, opacity: 0.14,
		side: THREE.DoubleSide, depthTest: true, depthWrite: false,
	})));
	halo.renderOrder = 997;
	ring.add(band);
	ring.add(halo);
	ring.position.set(at.x, SEA_SURFACE_Y + RING_LIFT, at.z);
	group.add(ring);

	for (const lane of lanes) {
		const p = worldXZ(gameState, lane.x, lane.z);
		const tile = new THREE.Mesh(m.tile, fillMaterial(THREE, Math.max(0.3, 0.62 - lane.distance * 0.06)));
		tile.rotation.x = -Math.PI / 2;
		tile.position.set(p.x, SEA_SURFACE_Y + LANE_LIFT, p.z);
		tile.renderOrder = 998;
		tile.name = 'sailLane';
		tile.userData = { sailTarget: true, x: lane.x, z: lane.z, distance: lane.distance, shipId: entry.ship.shipId };
		const edge = new THREE.Mesh(m.frame, m.dotsMat);
		edge.renderOrder = 999;
		tile.add(edge);
		tile.add(new THREE.Mesh(m.hit, m.hitMat));
		if (window.TWEEN) {
			const s = { v: 1 };
			tile.userData.tween = new window.TWEEN.Tween(s)
				.to({ v: 1.08 }, 700 + lane.distance * 60)
				.easing(window.TWEEN.Easing.Quadratic.InOut)
				.yoyo(true)
				.repeat(Infinity)
				.onUpdate(() => tile.scale.set(s.v, s.v, 1))
				.start();
		}
		group.add(tile);
	}
	animateSailLanes(scene);
}

/**
 * Per frame (shipRenderer's frame hook): the lane tiles ride the swell,
 * and the ring stays round the chosen hull wherever it glides.
 */
export function animateSailLanes(scene = getScene()) {
	const group = window.sailLanesGroup;
	if (!group || group.children.length === 0 || !scene) return;
	for (const child of group.children) {
		const ud = child.userData;
		if (ud?.sailTarget) {
			child.position.y = seaHeightAt(scene, child.position.x, child.position.z) + LANE_LIFT;
		} else if (ud?.sailShip) {
			const pose = shipPose(ud.shipId);
			if (pose) {
				child.position.set(pose.x, pose.sea + RING_LIFT, pose.z);
				child.rotation.set(0, pose.heading, 0);
			} else {
				child.position.y = seaHeightAt(scene, child.position.x, child.position.z) + RING_LIFT;
			}
		}
	}
}

/** Keyboard cursor on a lane tile (null clears it). */
export function markLaneCursor(target) {
	const group = window.sailLanesGroup;
	if (!group) return;
	for (const child of group.children) {
		if (!child?.userData?.sailTarget) continue;
		const on = !!target && child.userData.x === Number(target.x) && child.userData.z === Number(target.z);
		const edge = child.children[0];
		if (edge) edge.scale.setScalar(on ? 1.35 : 1);
		child.userData.cursor = on;
	}
}

// ── Selection ────────────────────────────────────────────────────────────────

/** The ship currently chosen for sailing, or null. */
export function selectedShipId() {
	return selection.shipId;
}

/** The lanes on show (`{x, z, distance}`), for the keyboard cursor. */
export function currentSailLanes() {
	return selection.lanes.slice();
}

function publish(gameState) {
	if (!gameState) return;
	gameState.selectedShipId = selection.shipId;
	gameState.sailLanes = selection.lanes;
}

/** Forget the ship selection and its lanes (chess selection untouched). */
export function clearShipSelection() {
	selection.shipId = null;
	selection.withPiece = false;
	selection.lanes = [];
	selection.rowingAt = 0;
	clearLaneMeshes();
	publish(gs());
}

/**
 * Choose a ship for sailing and show its lanes.
 *
 * @param {Object} entry  from shipEnv.listShips / shipEntryAt
 * @param {{withPiece?: boolean, quiet?: boolean}} [opts]
 *        withPiece: its passenger is selected too (keep that selection).
 */
export function selectShip(entry, { withPiece = false, quiet = false } = {}) {
	const gameState = gs();
	if (!gameState || !entry || !shipRulesActive(gameState)) return false;
	if (gameState.turnPhase !== 'chess') {
		// Sailing is offered in the chess move only.
		if (!quiet) toast('Longships sail during your chess move.');
		return false;
	}
	if (!withPiece && gameState.selectedChessPiece) clearChessSelection();
	const now = shipServerNow(gameState);
	const { lanes, reason } = laneTargets(gameState, entry, now);
	selection.shipId = String(entry.ship.shipId);
	selection.withPiece = withPiece;
	selection.lanes = lanes;
	selection.rowingAt = rowingMsLeft(entry.ship, now) > 0 ? Number(entry.ship.readyAt) : 0;
	publish(gameState);
	drawSelection(gameState, entry, selection.lanes);
	if (!quiet) {
		if (reason === 'ship_rowing') {
			toast(`Still rowing: ready in ${(rowingMsLeft(entry.ship, now) / 1000).toFixed(1)}s.`, { duration: 2200 });
		} else if (reason) {
			toast(shipRefusalText(reason));
		} else if (!withPiece) {
			const verb = isTouchPrimary() ? 'tap' : 'click';
			toast(entry.passenger
				? `Longship with your ${String(entry.passenger.type || 'piece').toLowerCase()} aboard: ${verb} a tile to sail.`
				: `Empty longship: ${verb} a tile to sail.`, { duration: 2600 });
		}
	}
	return true;
}

/** Re-work the lanes of the current selection (board changed, lock ended). */
export function refreshShipSelection() {
	const gameState = gs();
	if (!selection.shipId || !gameState) return;
	const entry = findShip(gameState, selection.shipId);
	if (!entry || !isMine(gameState, entry)) {
		clearShipSelection();
		return;
	}
	if (selection.withPiece) {
		// The passenger's rings depend on the lock too: redo both.
		const piece = gameState.selectedChessPiece;
		if (piece) { showValidMoves(piece); return; }
	}
	selectShip(entry, { withPiece: selection.withPiece, quiet: true });
}

/** A passenger was selected: show its ship's lanes alongside its moves. */
export function showLanesForPassenger(pieceData) {
	const gameState = gs();
	if (!gameState || !shipRulesActive(gameState) || !pieceData?.position) return;
	const entry = shipEntryAt(gameState, Number(pieceData.position.x), Number(pieceData.position.z));
	if (!entry || !isMine(gameState, entry)) return;
	selectShip(entry, { withPiece: true, quiet: true });
}

/** L key / Longship button: select your (next) ship. */
export function cycleMyShips() {
	const gameState = gs();
	if (!gameState || !shipRulesActive(gameState)) return false;
	const mine = shipsControlledBy(gameState, mySeat(gameState));
	if (mine.length === 0) {
		const state = buttonState(gameState);
		toast(state.mode === 'lost' ? `Your longship is lost. ${state.detail}.` : 'You have no longship right now.');
		return false;
	}
	const at = mine.findIndex(e => String(e.ship.shipId) === String(selection.shipId));
	const next = mine[(at + 1) % mine.length];
	// Pressing it again on a lone ship with lanes up toggles off.
	if (at !== -1 && mine.length === 1 && !selection.withPiece) {
		clearShipSelection();
		return true;
	}
	return selectShip(next);
}

// ── Picking ──────────────────────────────────────────────────────────────────

function shipIdOnObject(object) {
	let node = object;
	while (node) {
		const ud = node.userData;
		if (ud && (ud.shipId != null) && !ud.sailTarget && !ud.sailShip) return ud;
		node = node.parent;
	}
	return null;
}

/**
 * Which ship (if any) is under the pointer? First any rendered object
 * tagged with `userData.shipId` (the renderer's longship meshes), then
 * a few horizontal planes through a ship's height, mapped to squares.
 *
 * @param {THREE.Raycaster} raycaster  already set from the camera
 * @param {{landHit?: boolean, landDistance?: number}} [opts]
 *   landHit: a land cell was hit, so skip the planes; landDistance: how
 *   far along the ray that land is — a hull further away is behind it.
 */
export function pickShipEntry(raycaster, { landHit = false, landDistance = Infinity } = {}) {
	const gameState = gs();
	const THREE = getTHREE();
	const scene = getScene();
	if (!gameState || !THREE || !raycaster || !shipRulesActive(gameState)) return null;

	if (scene) {
		// The renderer's longship roots (in the board group), plus any
		// top-level layer that tags its meshes with a shipId.
		let roots = [];
		try { roots = shipObjects(); } catch (_e) { roots = []; }
		const layers = roots.concat(scene.children.filter(c => c && c.visible !== false
			&& (/ship|longship|fleet/i.test(c.name || '') || c.userData?.shipLayer)
			&& c !== window.sailLanesGroup));
		if (layers.length) {
			const hits = raycaster.intersectObjects(layers, true);
			for (const hit of hits) {
				// Land in front of the hull owns the click.
				if (landHit && hit.distance > landDistance) break;
				const ud = shipIdOnObject(hit.object);
				if (!ud) continue;
				const byId = findShip(gameState, ud.shipId);
				if (byId) return byId;
				if (ud.position) {
					const e = shipEntryAt(gameState, Number(ud.position.x), Number(ud.position.z));
					if (e) return e;
				}
			}
		}
	}

	if (landHit) return null;
	const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	const point = new THREE.Vector3();
	for (const y of PICK_HEIGHTS) {
		plane.constant = -y;
		if (!raycaster.ray.intersectPlane(plane, point)) continue;
		const sq = gridXZ(gameState, point.x, point.z);
		const entry = shipEntryAt(gameState, sq.x, sq.z);
		if (entry) return entry;
	}
	return null;
}

function hasAncestor(node, test) {
	for (let n = node; n; n = n.parent) if (test(n)) return true;
	return false;
}

/**
 * Distance along the ray to the nearest thing that stands in front of
 * the sea: a move ring, a chess piece, a land cell (instanced or not),
 * or a longship's real hull. A lane tile further away than this is
 * hidden behind it on screen, so it must not take the click.
 * The hulls' invisible pick boxes and the lanes themselves don't count.
 */
export function nearestOccluderDistance(raycaster) {
	let best = Infinity;
	const consider = (hits, accept) => {
		for (const h of hits) {
			if (h.distance >= best) break;
			if (accept(h)) { best = h.distance; break; }
		}
	};
	const rings = window.moveHighlightsGroup;
	if (rings && rings.children.length) {
		consider(raycaster.intersectObjects(rings.children, true), h => h.object.visible !== false);
	}
	const pieces = getChessPiecesGroup();
	if (pieces) {
		consider(raycaster.intersectObjects([pieces], true),
			h => h.object.visible !== false && !hasAncestor(h.object, n => n.visible === false));
	}
	const board = getBoardGroup();
	if (board) {
		consider(raycaster.intersectObjects([board], true), (h) => {
			const o = h.object;
			if (o.userData?.type === 'shipHitbox') return false;
			if (o.userData?.type === 'instancedCells') return h.instanceId != null;
			if (!o.visible || hasAncestor(o, n => n.visible === false)) return false;
			// Anything drawn on the board: cells, hulls, sails, foam.
			return o.isMesh === true || o.isInstancedMesh === true;
		});
	}
	return best;
}

/**
 * A sail-lane tile under the pointer → sail. Only when the tile is the
 * nearest thing the pointer is over: a click on a piece, a ring or land
 * in front of a lane belongs to that, not to the sea behind it.
 */
export function trySailLaneClick(raycaster) {
	const group = window.sailLanesGroup;
	if (!raycaster || !group || group.children.length === 0 || !selection.shipId) return false;
	const hits = raycaster.intersectObjects(group.children, true);
	let lane = null;
	for (const hit of hits) {
		let node = hit.object;
		while (node && !node.userData?.sailTarget) node = node.parent;
		if (node?.userData?.sailTarget) { lane = { node, distance: hit.distance }; break; }
	}
	if (!lane) return false;
	if (nearestOccluderDistance(raycaster) < lane.distance) return false;
	sailTo(lane.node.userData.x, lane.node.userData.z);
	return true;
}

/** The square under the pointer (by the lane plane), for refusals. */
export function waterSquareUnderPointer(raycaster) {
	const gameState = gs();
	const THREE = getTHREE();
	if (!gameState || !THREE || !raycaster) return null;
	const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -LANE_Y);
	const point = new THREE.Vector3();
	if (!raycaster.ray.intersectPlane(plane, point)) return null;
	return gridXZ(gameState, point.x, point.z);
}

/**
 * A click on a ship. Returns true when handled.
 *
 * @param {Object} entry
 * @param {(x:number, z:number) => void} moveTo  chess move onto the square
 */
export function handleShipClick(entry, moveTo) {
	const gameState = gs();
	if (!gameState || !entry) return false;
	const { x, z } = entry;
	const piece = gameState.selectedChessPiece;
	if (piece && !gameState.processingMove) {
		const legal = (gameState.validMoves || []).some(m => m && Number(m.x) === x && Number(m.z) === z);
		if (legal) { moveTo(x, z); return true; }
		const refused = (gameState.shipRefusedMoves || []).find(m => m.x === x && m.z === z);
		if (refused) { toast(shipRefusalText(refused.reason, refused.message)); return true; }
	}
	if (isMine(gameState, entry)) {
		// Empty, or the hull of a laden ship: the ship (lanes) alone.
		// Tapping the passenger itself selects the piece (with lanes).
		selectShip(entry);
		return true;
	}
	const owner = gameState.players?.[entry.ship.player]?.name || 'An enemy';
	const aboard = entry.passenger ? ` with a ${String(entry.passenger.type || 'piece').toLowerCase()} aboard` : ', empty';
	toast(`${owner}’s longship${aboard}. Step onto it, or take its passenger, to make it yours.`, { duration: 4000 });
	return true;
}

// ── Sailing ──────────────────────────────────────────────────────────────────

/** Emit ship_sail; resolves to the ack. */
export function emitSail(shipId, to, timeoutMs = SAIL_ACK_TIMEOUT_MS) {
	return new Promise((resolve) => {
		const socket = getSocket();
		if (!socket) { resolve({ success: false, reason: 'not_registered' }); return; }
		let done = false;
		const timer = setTimeout(() => {
			if (!done) { done = true; resolve({ success: false, reason: 'timeout' }); }
		}, timeoutMs);
		try {
			socket.emit('ship_sail', { shipId, to: { x: to.x, z: to.z } }, (ack) => {
				if (done) return;
				done = true;
				clearTimeout(timer);
				resolve(ack || { success: false, reason: 'server_error' });
			});
		} catch (_e) {
			if (!done) { done = true; clearTimeout(timer); resolve({ success: false, reason: 'server_error' }); }
		}
	});
}

/** Sail the selected ship to (x, z). */
export async function sailTo(x, z) {
	const gameState = gs();
	if (!gameState || !selection.shipId) return false;
	const entry = findShip(gameState, selection.shipId);
	if (!entry) { toast(shipRefusalText('no_ship')); clearShipSelection(); return false; }
	if (!isMine(gameState, entry)) { toast(shipRefusalText('not_your_ship')); clearShipSelection(); return false; }
	if (gameState.turnPhase !== 'chess') { toast('Longships sail during your chess move.'); return false; }
	const check = checkSail(gameState, entry, { x, z });
	if (!check.ok) {
		toast(check.reason === 'ship_rowing'
			? `Still rowing: ready in ${(rowingMsLeft(entry.ship, shipServerNow(gameState)) / 1000).toFixed(1)}s.`
			: shipRefusalText(check.reason, check.message));
		return false;
	}
	if (sailInFlight) return false;
	sailInFlight = true;
	const shipId = String(entry.ship.shipId);
	const sentAt = Date.now();
	const ack = await emitSail(shipId, { x, z });
	sailInFlight = false;
	if (ack && ack.success) {
		// The server sailed somewhere between send and ack: take the middle.
		noteSailReadyAt(ack.readyAt, (sentAt + Date.now()) / 2);
		ackClockLearnt = true;
		// The board update with the ship's new square arrives just
		// before the ack; drop the lanes (it rows now) and the passenger
		// selection (it can't step off while YOUR ship rows).
		clearChessSelection();
		clearShipSelection();
		const dist = Math.abs(x - entry.x) + Math.abs(z - entry.z);
		toast(`Sailed ${dist} square${dist === 1 ? '' : 's'}. Rowing for 3 s: your crew can't step on or off until it steadies.`, { duration: 3000 });
		return true;
	}
	toast(shipRefusalText(ack?.reason, ack?.error), { variant: 'alert' });
	refreshShipSelection();
	return false;
}

// ── HUD button ───────────────────────────────────────────────────────────────

function buttonState(gameState) {
	const active = shipRulesActive(gameState) && !!gameState?.activeBattle;
	if (active && fleetMemoBattle !== gameState.activeBattle.id) {
		fleetMemo = null;
		fleetMemoBattle = gameState.activeBattle.id;
	}
	return shipButtonState({
		active,
		ships: active ? shipsControlledBy(gameState, mySeat(gameState)) : [],
		now: shipServerNow(gameState),
		lost: fleetMemo,
		phase: gameState?.turnPhase,
		selectedShipId: selection.shipId,
	});
}

function ensureButton() {
	let button = document.getElementById(BUTTON_ID);
	if (button) return button;
	const stack = ensureActionStack();
	button = document.createElement('button');
	button.id = BUTTON_ID;
	button.type = 'button';
	button.setAttribute('aria-label', 'Longship');
	Object.assign(button.style, {
		display: 'none',
		alignItems: 'center',
		gap: '10px',
		minHeight: '48px',
		padding: '6px 12px 6px 8px',
		fontFamily: 'serif',
		color: '#fff8d8',
		background: 'linear-gradient(180deg, rgba(18,72,74,0.95), rgba(10,40,48,0.95))',
		border: '2px solid #ffcc33',
		borderRadius: '8px',
		boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
		cursor: 'pointer',
		pointerEvents: 'auto',
		textAlign: 'left',
		touchAction: 'manipulation',
	});
	const ring = document.createElement('span');
	ring.className = 'longship-ring';
	Object.assign(ring.style, {
		flex: '0 0 34px', width: '34px', height: '34px', borderRadius: '50%',
		display: 'flex', alignItems: 'center', justifyContent: 'center',
		fontSize: '18px', lineHeight: '1',
	});
	const glyph = document.createElement('span');
	glyph.textContent = '⛵';
	Object.assign(glyph.style, {
		width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(8,30,36,0.95)',
		display: 'flex', alignItems: 'center', justifyContent: 'center',
	});
	ring.appendChild(glyph);
	const text = document.createElement('span');
	Object.assign(text.style, { display: 'flex', flexDirection: 'column', lineHeight: '1.15' });
	const label = document.createElement('span');
	label.className = 'longship-label';
	Object.assign(label.style, { fontSize: '14px', fontWeight: '700', letterSpacing: '0.3px' });
	const detail = document.createElement('span');
	detail.className = 'longship-detail';
	Object.assign(detail.style, { fontSize: '11px', color: '#bfe9dc' });
	text.appendChild(label);
	text.appendChild(detail);
	button.appendChild(ring);
	button.appendChild(text);
	button.addEventListener('click', (e) => {
		e.stopPropagation();
		cycleMyShips();
	});
	// Taps on the button must not fall through to the board.
	for (const type of ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'mouseup']) {
		button.addEventListener(type, ev => ev.stopPropagation(), { passive: true });
	}
	stack.appendChild(button);
	return button;
}

function renderButton() {
	const gameState = gs();
	if (!gameState || typeof document === 'undefined') return;
	const state = buttonState(gameState);
	let button = document.getElementById(BUTTON_ID);
	if (state.mode === 'hidden') {
		if (button) button.style.display = 'none';
		return;
	}
	button = ensureButton();
	// The Next Piece widget grows and shrinks (hints, phone layout):
	// keep the action stack just under it.
	positionUnderNextPiece();
	button.style.display = 'flex';
	button.dataset.mode = state.mode;
	button.title = state.title;
	button.querySelector('.longship-label').textContent = state.label;
	button.querySelector('.longship-detail').textContent = state.detail;
	const ring = button.querySelector('.longship-ring');
	const deg = Math.round(state.progress * 360);
	const colour = state.mode === 'lost' ? '#c0503a' : (state.mode === 'none' ? '#6b6b6b' : '#ffcc33');
	ring.style.background = `conic-gradient(${colour} ${deg}deg, rgba(255,255,255,0.15) ${deg}deg)`;
	const dim = state.mode === 'none' || (state.mode === 'ready' && !state.canSail);
	button.style.opacity = dim ? '0.75' : '1';
	button.style.borderColor = selection.shipId ? '#7fffd4' : '#ffcc33';
}

function tick() {
	const gameState = gs();
	renderButton();
	if (gameState && shipRulesActive(gameState)) {
		refreshPieceAfterRowing(gameState);
		rememberShips(gameState);
	}
	// The hull builder is fetched on demand (production bundle): as soon
	// as the Viking edition or a Viking battle is on, not when the
	// first ship turns up.
	if (isViking() || (gameState && shipRulesActive(gameState))) prepareShips();
	if (!gameState || !selection.shipId) return;
	// The phase moved on: lanes are a chess-phase thing.
	if (gameState.turnPhase !== 'chess') {
		clearShipSelection();
		return;
	}
	// The rowing lock just ended: re-offer lanes (and passenger moves).
	if (selection.rowingAt && shipServerNow(gameState) >= selection.rowingAt) {
		selection.rowingAt = 0;
		refreshShipSelection();
	}
}

/**
 * A selected piece that a rowing lock kept off (or on) a ship gets its
 * rings back the moment the lock ends, without a second tap.
 */
function refreshPieceAfterRowing(gameState) {
	const piece = gameState?.selectedChessPiece;
	const refused = gameState?.shipRefusedMoves;
	if (!piece || !Array.isArray(refused) || gameState.turnPhase !== 'chess' || gameState.processingMove) return;
	let until = 0;
	const pos = piece.userData?.position;
	for (const r of refused) {
		if (r.reason !== 'ship_rowing') continue;
		for (const sq of [r, pos]) {
			const e = sq ? shipEntryAt(gameState, Number(sq.x), Number(sq.z)) : null;
			if (e) until = Math.max(until, Number(e.ship.readyAt) || 0);
		}
	}
	if (until > 0 && shipServerNow(gameState) >= until) showValidMoves(piece);
}

/** Current HUD button state (tests / debugging). */
export function longshipButtonState() {
	return buttonState(gs());
}

// ── Events ───────────────────────────────────────────────────────────────────

/** Who held each ship, and who stood aboard, at the last look (for 'sunk'). */
const lastSeen = new Map();   // shipId -> {player, passengerType}

function rememberShips(gameState) {
	let ships = [];
	try { ships = listShips(gameState); } catch (_e) { ships = []; }
	for (const e of ships) {
		lastSeen.set(String(e.ship.shipId), {
			player: e.ship.player,
			passengerType: e.passenger ? e.passenger.type : null,
		});
	}
	if (lastSeen.size > 64) lastSeen.clear();
}

/** A notice for ship events that happen to you (see shipEventToasts.js). */
function noticeFor(detail, gameState) {
	const live = detail.shipId != null ? findShip(gameState, detail.shipId) : null;
	const seen = detail.shipId != null ? lastSeen.get(String(detail.shipId)) : null;
	let localName = null;
	try { localName = localStorage.getItem('playerName'); } catch (_e) { localName = null; }
	const note = shipEventToast(detail, {
		localId: mySeat(gameState),
		players: gameState.players,
		localName,
		ownerOf: () => (live ? live.ship.player : seen?.player ?? null),
		pieceTypeOf: (pieceId) => {
			const p = (gameState.chessPieces || []).find(c => c && String(c.id) === String(pieceId));
			return p?.type || live?.passenger?.type || seen?.passengerType || null;
		},
	});
	if (note) toast(note.text, { variant: note.variant, duration: note.variant === 'alert' ? 4500 : 3500 });
}

function onShipEvent(e) {
	const detail = e?.detail;
	const gameState = gs();
	if (!detail || !gameState) return;
	if (shipRulesActive(gameState)) {
		try { noticeFor(detail, gameState); } catch (_e) { /* notices are best-effort */ }
	}
	// Until one of our own sails has been acked, any sail news sets the clock.
	if (detail.kind === 'sailed' && !ackClockLearnt) noteSailReadyAt(detail.readyAt);
	fleetMemo = updateFleetMemo(fleetMemo, detail, mySeat(gameState));
	if (gameState.activeBattle) fleetMemoBattle = gameState.activeBattle.id;
	if (selection.shipId) {
		// Let the board diff land first.
		setTimeout(() => refreshShipSelection(), 60);
	}
	renderButton();
}

/** Wire the HUD button, the L key and the ship event listener (once). */
export function installShipControls() {
	if (installed || typeof window === 'undefined') return;
	installed = true;
	window.addEventListener(SHIP_EVENT, onShipEvent);
	// The lane tiles and the chosen ship's ring ride the swell each frame.
	setShipFrameHook(animateSailLanes);
	document.addEventListener('keydown', (event) => {
		if (event.key !== 'l' && event.key !== 'L') return;
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const t = event.target;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
		const gameState = gs();
		if (!gameState || !shipRulesActive(gameState)) return;
		event.preventDefault();
		cycleMyShips();
	});
	setInterval(tick, 200);
	// In-page handle for playtests and debugging.
	window.__tetchesShips = {
		list: () => listShips(gs()),
		mine: () => shipsControlledBy(gs(), mySeat(gs())),
		select: (shipId) => { const e = findShip(gs(), shipId); return e ? selectShip(e) : false; },
		sailTo,
		lanes: currentSailLanes,
		button: longshipButtonState,
		cellItems: (x, z) => cellItems(gs(), x, z),
	};
}
