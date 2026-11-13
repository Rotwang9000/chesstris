/**
 * @jest-environment jsdom
 *
 * Fixes from the Viking client review:
 *   • sail lanes lie on the sea (no tile through a hull), the chosen ship
 *     gets a ring round its hull, and a click on anything in front of a
 *     lane is not taken as a sail
 *   • a text notice for every longship event that happens to you
 *   • longship hints clear the selected piece's info card on phones
 *   • ship scenes outrank capture cards; captures without a painting of
 *     their own get no card
 *   • the fjord opens a valley toward the low sun; the ridge mist is
 *     shaded by height, not per column
 */
import * as THREE from 'three';

const mockEmitted = [];
jest.mock('../../public/js/utils/networkManager.js', () => ({
	getSocket: () => ({
		emit: (ev, data, ack) => { mockEmitted.push({ ev, data }); if (ack) ack({ success: false, reason: 'probe' }); },
	}),
}));
jest.mock('../../public/js/chessInteraction.js', () => ({
	clearChessSelection: jest.fn(), showValidMoves: jest.fn(),
}));
jest.mock('../../public/js/skipChessButton.js', () => ({
	ensureActionStack: () => globalThis.document.body, positionUnderNextPiece: () => {},
}));

window.THREE = THREE;
const gameState = require('../../public/js/utils/gameState.js').default;
const ctx = require('../../public/js/gameContext.js');
const C = require('../../public/js/longships/shipControls.js');
const E = require('../../public/js/longships/shipEnv.js');
const { makeShipItem } = require('../../public/js/viking/shipRulesClient.js');
const { shipEventToast } = require('../../public/js/longships/shipEventToasts.js');
const { SEA_SURFACE_Y } = require('../../public/js/seaLevel.js');

function mooredShipArena() {
	const scene = new THREE.Scene();
	ctx.setTHREE(THREE);
	ctx.setScene(scene);
	ctx.setChessPiecesGroup(null);
	ctx.setBoardGroup(null);
	window.moveHighlightsGroup = null;
	window.sailLanesGroup = null;
	Object.assign(gameState, {
		localPlayerId: 's0', currentPlayer: 's0', turnPhase: 'chess', selectedChessPiece: null,
		activeBattle: { id: 'b1', centre: { x: 0, z: 0 }, playRadius: 14, edition: 'viking', sea: null },
		board: { cells: {} }, chessPieces: [],
	});
	const cells = gameState.board.cells;
	// Shore: row z=4 is land (camera side); the ship lies moored at (0,5).
	for (let x = -3; x <= 3; x++) cells[`${x},4`] = [{ type: 'tetromino', player: 's0' }];
	cells['0,5'] = [makeShipItem({ shipId: 'sh', player: 's0', battleId: 'b1', homeSeatId: 's0', readyAt: 0 })];
	gameState.chessPieces.push({ id: 'r', type: 'ROOK', player: 's0', position: { x: 0, z: 5 } });
	cells['0,5'].push({ type: 'chess', player: 's0', pieceId: 'r', pieceType: 'rook' });
	return scene;
}

/** A ray from a camera behind the shore down through `at`. */
function rayThrough(at) {
	const camera = new THREE.Vector3(1, 12, -6);
	const raycaster = new THREE.Raycaster();
	raycaster.set(camera, at.clone().sub(camera).normalize());
	return raycaster;
}

describe('sail lanes', () => {
	beforeEach(() => { mockEmitted.length = 0; });

	test('tiles lie on the sea and the chosen ship gets a ring, not a frame through its deck', () => {
		const scene = mooredShipArena();
		const entry = E.shipEntryAt(gameState, 0, 5);
		expect(C.selectShip(entry, { quiet: true })).toBe(true);
		const kids = window.sailLanesGroup.children;
		const tiles = kids.filter(k => k.userData.sailTarget);
		expect(tiles.length).toBeGreaterThan(0);
		// no water mesh in this scene: the swell's mean height
		for (const t of tiles) expect(t.position.y).toBeCloseTo(SEA_SURFACE_Y + 0.03, 5);
		expect(kids.some(k => k.name === 'sailShipFrame')).toBe(false);
		const ring = kids.find(k => k.name === 'sailShipRing');
		expect(ring).toBeTruthy();
		expect(ring.position.y).toBeLessThan(SEA_SURFACE_Y + 0.1);
		C.animateSailLanes(scene);
		for (const t of tiles) expect(t.position.y).toBeCloseTo(SEA_SURFACE_Y + 0.03, 5);
		C.clearShipSelection();
	});

	test('a click on a move ring in front of a lane does not sail the ship', async () => {
		const scene = mooredShipArena();
		const entry = E.shipEntryAt(gameState, 0, 5);
		C.selectShip(entry, { withPiece: true, quiet: true });
		expect(C.currentSailLanes().map(l => `${l.x},${l.z}`)).toContain('1,5');
		// A move ring on land, between the camera and lane (1,5): the ray
		// to the lane's centre on the water passes through it.
		const laneAt = new THREE.Vector3(1, SEA_SURFACE_Y + 0.03, 5);
		const eye = new THREE.Vector3(1, 12, -6);
		const dir = laneAt.clone().sub(eye).normalize();
		const ringAt = eye.clone().addScaledVector(dir, (eye.y - 0.46) / -dir.y);
		const rings = new THREE.Group();
		const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
		ring.rotation.x = -Math.PI / 2;
		ring.position.copy(ringAt);
		ring.userData = { moveTarget: true, x: 1, z: Math.round(ringAt.z) };
		rings.add(ring);
		scene.add(rings);
		window.moveHighlightsGroup = rings;
		scene.updateMatrixWorld(true);
		const raycaster = rayThrough(ringAt);
		const laneHits = raycaster.intersectObjects(window.sailLanesGroup.children, true);
		expect(laneHits.length).toBeGreaterThan(0);          // the lane IS on the ray, behind
		expect(C.nearestOccluderDistance(raycaster)).toBeLessThan(laneHits[0].distance);
		expect(C.trySailLaneClick(raycaster)).toBe(false);
		await new Promise(r => setTimeout(r, 0));
		expect(mockEmitted).toEqual([]);
		C.clearShipSelection();
	});

	test('a land cell in front of a lane keeps the click too; open water sails', async () => {
		const scene = mooredShipArena();
		C.selectShip(E.shipEntryAt(gameState, 0, 5), { quiet: true });
		const board = new THREE.Group();
		const block = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
		block.position.set(1, 0, 4);
		block.userData = { type: 'cell', position: { x: 1, z: 4 } };
		board.add(block);
		scene.add(board);
		ctx.setBoardGroup(board);
		scene.updateMatrixWorld(true);
		expect(C.trySailLaneClick(rayThrough(new THREE.Vector3(1, 0.5, 4)))).toBe(false);
		// Straight down onto lane (1,5): nothing in front, so it sails.
		const down = new THREE.Raycaster(new THREE.Vector3(1, 20, 5), new THREE.Vector3(0, -1, 0));
		expect(C.trySailLaneClick(down)).toBe(true);
		await new Promise(r => setTimeout(r, 0));
		expect(mockEmitted).toEqual([{ ev: 'ship_sail', data: { shipId: 'sh', to: { x: 1, z: 5 } } }]);
		C.clearShipSelection();
	});
});

describe('ship event notices', () => {
	const ctxFor = (extra = {}) => ({
		localId: 'me', players: { me: { name: 'Astrid' }, bot: { name: 'Bot 2' } }, ...extra,
	});

	test('your ship seized or boarded is an alert naming the taker; taking theirs is good news', () => {
		expect(shipEventToast({ kind: 'seized', from: 'me', to: 'bot', seizeKind: 'seize' }, ctxFor()))
			.toEqual({ text: 'Bot 2 seizes your empty longship!', variant: 'alert' });
		expect(shipEventToast({ kind: 'seized', from: 'me', to: 'bot', seizeKind: 'boarded' }, ctxFor()).text)
			.toBe('Bot 2 boards your longship and takes it!');
		expect(shipEventToast({ kind: 'seized', from: 'bot', to: 'me', seizeKind: 'seize' }, ctxFor()))
			.toEqual({ text: 'You seize Bot 2’s longship: she is yours.', variant: 'success' });
		expect(shipEventToast({ kind: 'seized', from: 'bot', to: 'other' }, ctxFor())).toBeNull();
	});

	test('sinking, destruction and a new keel, for your ships only', () => {
		const owner = (who) => ({ ownerOf: () => who, pieceTypeOf: () => 'ROOK' });
		expect(shipEventToast({ kind: 'sunk', shipId: 's', passengerId: 'p' }, ctxFor(owner('me'))).text)
			.toBe('The sea takes your longship, and your rook with her!');
		expect(shipEventToast({ kind: 'sunk', shipId: 's', passengerId: null }, ctxFor(owner('me'))).text)
			.toBe('The sea takes your empty longship.');
		expect(shipEventToast({ kind: 'sunk', shipId: 's' }, ctxFor(owner('bot')))).toBeNull();
		expect(shipEventToast({ kind: 'lost', seatId: 'me', reason: 'destroyed' }, ctxFor()).variant).toBe('alert');
		// 'seized' and 'sunk' were told when they happened: no second notice
		expect(shipEventToast({ kind: 'lost', seatId: 'me', reason: 'seized' }, ctxFor())).toBeNull();
		expect(shipEventToast({ kind: 'built', seatId: 'me' }, ctxFor()).variant).toBe('success');
		expect(shipEventToast({ kind: 'built', seatId: 'bot' }, ctxFor())).toBeNull();
	});

	test('an enemy landing or raiding on your shore is an alert; your own landings are not', () => {
		const move = (playerId, kind, extra = {}) => ({
			kind, move: { playerId, movedPiece: { type: 'KNIGHT' }, ship: { kind, landOwner: 'me' }, ...extra },
		});
		expect(shipEventToast(move('bot', 'land'), ctxFor()))
			.toEqual({ text: '⛵ Bot 2’s knight lands on your shore!', variant: 'alert' });
		expect(shipEventToast(move('bot', 'raid', { capturedPiece: { type: 'PAWN' } }), ctxFor()).text)
			.toBe('⚔ Bot 2’s knight raids your shore and takes your pawn!');
		expect(shipEventToast(move('me', 'land'), ctxFor())).toBeNull();
		expect(shipEventToast({ kind: 'land', move: { playerId: 'bot', ship: { landOwner: 'x' } } }, ctxFor())).toBeNull();
		// nameless rivals still read well
		expect(shipEventToast(move('ghost', 'land'), ctxFor()).text).toBe('⛵ A rival’s knight lands on your shore!');
	});
});

describe('toasts clear the selected piece card when asked', () => {
	const { showToastMessage } = require('../../public/js/showToastMessage.js');
	const rect = (r) => () => ({ ...r, width: r.right - r.left, height: r.bottom - r.top, x: r.left, y: r.top });

	beforeEach(() => { document.body.innerHTML = ''; });

	function phoneCard() {
		Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
		const card = document.createElement('div');
		card.id = 'selected-piece-card';
		card.style.display = 'block';
		card.getBoundingClientRect = rect({ left: 60, right: 320, top: 700, bottom: 826 });
		document.body.appendChild(card);
		const orig = HTMLElement.prototype.getBoundingClientRect;
		jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
			if (this.id === 'toast-container') return rect({ left: 40, right: 350, top: 770, bottom: 824 })();
			return orig.call(this);
		});
	}
	afterEach(() => jest.restoreAllMocks());

	test('a longship hint moves above the card; other toasts stay put', () => {
		phoneCard();
		showToastMessage('Out at sea: sail next to land to step off.', { duration: 3000, aboveInfoCard: true });
		const box = document.getElementById('toast-container');
		expect(parseFloat(box.style.bottom)).toBeGreaterThanOrEqual(844 - 700);
		showToastMessage('Line cleared!', 3000);
		expect(box.style.bottom).toBe('20px');
	});

	test('with no card on screen the hint stays at the bottom', () => {
		showToastMessage('Still rowing.', { duration: 3000, aboveInfoCard: true });
		expect(document.getElementById('toast-container').style.bottom).toBe('20px');
	});
});

describe('painting priority', () => {
	const { priorityOf, PaintingQueue } = require('../../public/js/paintings/paintingQueue.js');

	test('a longship scene outranks a capture, and is outranked by a queen or a king', () => {
		const ship = { kind: 'ship', scene: 'embark' };
		const capture = { kind: 'capture', attackerType: 'rook', victimType: 'pawn' };
		expect(priorityOf(ship)).toBeGreaterThan(priorityOf(capture));
		expect(priorityOf({ kind: 'arrival', pieceType: 'queen' })).toBeGreaterThan(priorityOf(ship));
		expect(priorityOf({ kind: 'kingfall' })).toBeGreaterThan(priorityOf(ship));
	});

	test('a waiting ship scene is next, ahead of an older capture', () => {
		const q = new PaintingQueue();
		q.push({ kind: 'capture', attackerType: 'rook', victimType: 'pawn' }, 0);
		q.push({ kind: 'ship', scene: 'embark', staleMs: 3000 }, 100);
		expect(q.hasUrgent(priorityOf({ kind: 'capture' }) + 0.25, 200)).toBe(true);
		expect(q.next(200).kind).toBe('ship');
	});
});

describe('the director: captures without a painting get no card', () => {
	const MANIFEST = {
		version: 1, base: '/img/paintings/',
		paintings: { 'capture.knight.bishop': { file: 'capture.knight.bishop.v1.webp', alt: '' } },
	};
	let director;
	beforeAll(async () => {
		global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(MANIFEST) }));
		director = await import('../../public/js/paintings/paintingDirector.js');
	});

	test('an unpainted pairing is a toast only; a painted one is carded once', async () => {
		gameState.localPlayerId = 'me';
		gameState.players = { me: { name: 'Astrid' }, bot: { name: 'Bot 2' } };
		gameState.activeBattle = { id: 'b-capture', edition: 'viking' };
		director.initPaintings();
		await new Promise(r => setTimeout(r, 20));      // the manifest arrives
		const { counts } = window.tetchesPaintings;
		director.handlePaintingEvent('chess_capture', {
			capturedPiece: { id: 'p1', type: 'PAWN', player: 'bot' }, capturedBy: { playerId: 'me', pieceType: 'rook' },
		});
		expect(counts['chess_capture:no-card:capture']).toBe(1);
		director.handlePaintingEvent('chess_capture', {
			capturedPiece: { id: 'b1', type: 'BISHOP', player: 'bot' }, capturedBy: { playerId: 'me', pieceType: 'knight' },
		});
		expect(counts['chess_capture:no-card:capture']).toBe(1);   // still only the first
		const { queue } = window.tetchesPaintings;
		const carded = [queue.current, ...queue.waiting].filter(m => m && m.kind === 'capture');
		expect(carded.map(m => m.victimType || m.attackerType)).toHaveLength(1);
		expect(carded[0].throttleKey).toBe('b-capture:capture:capture.knight.bishop');
	});
});

describe('the fjord', () => {
	const T = require('../../public/js/viking/theme.js');

	test('the ridges open a valley toward the sun and close again either side', () => {
		expect(T.sunValley(T.SUN.azimuth)).toBe(0);
		expect(T.sunValley(T.SUN.azimuth + T.SUN_NOTCH.floor * 0.9)).toBe(0);
		expect(T.sunValley(T.SUN.azimuth + Math.PI)).toBe(1);
		const mid = T.sunValley(T.SUN.azimuth - (T.SUN_NOTCH.floor + T.SUN_NOTCH.shoulder) / 2);
		expect(mid).toBeGreaterThan(0);
		expect(mid).toBeLessThan(1);
		// wraps round the circle
		expect(T.sunValley(T.SUN.azimuth + Math.PI * 2)).toBe(0);
	});

	test('the low sun sits above the valley floor and the sky glows red-gold under it', () => {
		expect(T.SUN.elevation).toBeGreaterThan(0.1);
		const under = T.skyColour(0.02, 1);
		const away = T.skyColour(0.02, -1);
		expect(under[0] - under[2]).toBeGreaterThan(away[0] - away[2] + 0.1);
	});
});
