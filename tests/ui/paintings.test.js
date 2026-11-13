/**
 * @jest-environment jsdom
 *
 * Viking edition event paintings (public/js/paintings/): the slot
 * chain, the queue's rules, turning server payloads into moments, the
 * captions and the Full / Small / Off setting.
 */

// The director's check-banner hook pulls in the 3D camera; not needed here.
jest.mock('../../public/js/checkAlert.js', () => ({ isDefenderInCheck: () => false }));

import fs from 'fs';
import path from 'path';
import {
	slotCandidates, resolvePainting, allPaintingSources, normalisePieceType,
} from '../../public/js/paintings/paintingCatalogue.js';
import { PaintingQueue, priorityOf, durationFor, COALESCE_MS } from '../../public/js/paintings/paintingQueue.js';
import {
	fromChessCapture, fromChessMove, fromKingCaptured, fromPromotion, fromBattleEnd,
} from '../../public/js/paintings/paintingEvents.js';
import { captionFor, displayNameOf, isPlaceholderName, cleanName } from '../../public/js/paintings/paintingCaptions.js';
import {
	getPaintingSetting, setPaintingSetting, parsePaintingSetting,
	paintingSettingLabel, PAINTING_SETTING_KEY,
} from '../../public/js/paintings/paintingSettings.js';
import { drawWoodcut } from '../../public/js/paintings/fallbackArt.js';
import { showPaintingCard, closePaintingCard, ART_READY_TIMEOUT_MS } from '../../public/js/paintings/paintingCard.js';
import {
	ShipMoments, SHIP_SCENES, SHIP_STALE_MS, RAIDCHECK_WINDOW_MS, normaliseShipEvent,
} from '../../public/js/paintings/paintingShips.js';

const PAINTINGS_DIR = path.join(__dirname, '../../public/img/paintings');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PAINTINGS_DIR, 'manifest.json'), 'utf8'));

const capture = (overrides = {}) => ({
	kind: 'capture', attackerType: 'knight', victimType: 'bishop', extra: 0, ...overrides,
});

describe('slot chain', () => {
	test('capture: exact pair, then attacker, then generic', () => {
		expect(slotCandidates(capture())).toEqual(['capture.knight.bishop', 'capture.knight', 'capture']);
	});

	test('piece types are normalised from either case', () => {
		expect(normalisePieceType('KNIGHT')).toBe('knight');
		expect(normalisePieceType('dragon')).toBeNull();
		expect(slotCandidates(capture({ attackerType: 'ROOK', victimType: 'PAWN' }))[0]).toBe('capture.rook.pawn');
		expect(slotCandidates(capture({ attackerType: 'piece', victimType: 'PAWN' }))).toEqual(['capture']);
	});

	test('kingfall, arrival and battle slots', () => {
		expect(slotCandidates({ kind: 'kingfall' })).toEqual(['kingfall.blade']);
		expect(slotCandidates({ kind: 'kingfall', siege: true })).toEqual(['kingfall.siege', 'kingfall.blade']);
		expect(slotCandidates({ kind: 'arrival', pieceType: 'QUEEN' })).toEqual(['arrival.queen']);
		expect(slotCandidates({ kind: 'battle', outcome: 'victory' })).toEqual(['battle.victory']);
		expect(slotCandidates({ kind: 'battle', outcome: 'defeat' })).toEqual(['battle.defeat']);
		expect(slotCandidates(null)).toEqual([]);
	});

	test('resolves the first slot the manifest has', () => {
		expect(resolvePainting(MANIFEST, slotCandidates(capture()))).toEqual(expect.objectContaining({
			slot: 'capture.knight.bishop',
			src: '/img/paintings/capture.knight.bishop.v1.webp',
		}));
		// Bishop takes knight: no pair, no attacker painting → the woodcut.
		expect(resolvePainting(MANIFEST, slotCandidates(capture({ attackerType: 'bishop', victimType: 'knight' })))).toBeNull();
		// The siege falls back to the blade.
		expect(resolvePainting(MANIFEST, slotCandidates({ kind: 'kingfall', siege: true })).slot).toBe('kingfall.blade');
		// No defeat painting yet.
		expect(resolvePainting(MANIFEST, slotCandidates({ kind: 'battle', outcome: 'defeat' }))).toBeNull();
	});

	test('falls through to a less specific slot', () => {
		const manifest = { paintings: { 'capture.knight': { file: 'capture.knight.v1.webp', alt: 'A rider' } } };
		expect(resolvePainting(manifest, slotCandidates(capture()))).toEqual({
			slot: 'capture.knight', src: '/img/paintings/capture.knight.v1.webp', alt: 'A rider',
		});
	});

	test('tolerates a missing or malformed manifest and refuses odd paths', () => {
		expect(resolvePainting(null, ['capture'])).toBeNull();
		expect(resolvePainting({}, ['capture'])).toBeNull();
		expect(resolvePainting({ paintings: 'nope' }, ['capture'])).toBeNull();
		expect(resolvePainting({ paintings: { capture: { file: 'https://evil.example/x.webp' } } }, ['capture'])).toBeNull();
		expect(resolvePainting({ paintings: { capture: { file: '../../secret.png' } } }, ['capture'])).toBeNull();
		expect(resolvePainting({ paintings: { capture: { alt: 'no file' } } }, ['capture'])).toBeNull();
		expect(resolvePainting({ paintings: { toString: { file: 'x.webp' } } }, ['constructor'])).toBeNull();
	});

	test('every manifest entry is a versioned file that exists, with alt text', () => {
		const entries = Object.entries(MANIFEST.paintings);
		expect(entries.map(([slot]) => slot).sort()).toEqual([
			'arrival.queen', 'battle.victory', 'capture.knight.bishop', 'kingfall.blade',
			...SHIP_SCENES.map(scene => `ship.${scene}`),
		].sort());
		for (const [slot, entry] of entries) {
			expect(entry.file).toMatch(new RegExp(`^${slot.replace(/\./g, '\\.')}\\.v\\d+\\.webp$`));
			expect(fs.existsSync(path.join(PAINTINGS_DIR, entry.file))).toBe(true);
			expect(entry.alt.length).toBeGreaterThan(20);
		}
		expect(allPaintingSources(MANIFEST)).toHaveLength(entries.length);
	});
});

describe('painting queue', () => {
	test('one at a time, king > queen > the rest, else in order', () => {
		const q = new PaintingQueue();
		q.push(capture({ dedupeKey: 'piece:1' }), 0);
		q.push({ kind: 'arrival', pieceType: 'queen', dedupeKey: 'arrival:1' }, 2000);
		q.push({ kind: 'kingfall', dedupeKey: 'kingfall:p2' }, 4000);
		expect(q.next().kind).toBe('kingfall');
		expect(q.next().kind).toBe('arrival');
		expect(q.next().kind).toBe('capture');
		expect(q.next()).toBeNull();
	});

	test('priorities and durations', () => {
		expect(priorityOf({ kind: 'kingfall' })).toBeGreaterThan(priorityOf({ kind: 'arrival', pieceType: 'queen' }));
		expect(priorityOf({ kind: 'arrival', pieceType: 'queen' })).toBeGreaterThan(priorityOf(capture()));
		expect(durationFor(capture())).toBe(4000);
		expect(durationFor({ kind: 'kingfall' })).toBe(6000);
		expect(durationFor({ kind: 'arrival', pieceType: 'queen' })).toBe(6000);
		expect(durationFor({ kind: 'battle', outcome: 'victory' })).toBe(6000);
		expect(durationFor({ kind: 'battle', outcome: 'defeat' })).toBe(4000);
	});

	test('dedupes by captured piece id (chess_capture + chess_move)', () => {
		const q = new PaintingQueue();
		expect(q.push(capture({ dedupeKey: 'piece:7' }), 0)).toBe('queued');
		expect(q.push(capture({ dedupeKey: 'piece:7' }), 5)).toBe('duplicate');
		expect(q.size).toBe(1);
		expect(q.next().extra).toBe(0);
	});

	test('a king captured directly is painted once, not again by king_captured', () => {
		const q = new PaintingQueue();
		expect(q.push({ kind: 'kingfall', dedupeKey: 'kingfall:p2' }, 0)).toBe('queued');
		expect(q.push({ kind: 'kingfall', dedupeKey: 'kingfall:p2', siege: true }, 40)).toBe('duplicate');
	});

	test('the dedupe memory fades, so a respawned king can fall again later', () => {
		const q = new PaintingQueue({ dedupeTtlMs: 1000 });
		q.push({ kind: 'kingfall', dedupeKey: 'kingfall:p2' }, 0);
		q.next();
		q.finish();
		expect(q.push({ kind: 'kingfall', dedupeKey: 'kingfall:p2' }, 5000)).toBe('queued');
	});

	test('captures within 1.5 s coalesce into one card', () => {
		const q = new PaintingQueue();
		q.push(capture({ dedupeKey: 'piece:1' }), 0);
		expect(q.push(capture({ dedupeKey: 'piece:2', victimType: 'pawn' }), 500)).toBe('merged');
		expect(q.push(capture({ dedupeKey: 'piece:3' }), COALESCE_MS)).toBe('merged');
		expect(q.push(capture({ dedupeKey: 'piece:4' }), COALESCE_MS + 1)).toBe('queued');
		const first = q.next();
		expect(first.victimType).toBe('bishop');   // the first blow names the card
		expect(first.extra).toBe(2);
		expect(captionFor({ ...first, attackerName: 'Geofrey', victimName: 'Bot 2' }))
			.toBe('Geofrey’s knight slays Bot 2’s bishop\u00a0…and\u00a02\u00a0more');
	});

	test('a capture joins the card already on screen', () => {
		const q = new PaintingQueue();
		q.push(capture({ dedupeKey: 'piece:1' }), 0);
		const shown = q.next();
		expect(q.push(capture({ dedupeKey: 'piece:2' }), 900)).toBe('merged-current');
		expect(shown.extra).toBe(1);
		q.finish();
		expect(q.push(capture({ dedupeKey: 'piece:3' }), 1000)).toBe('queued');
	});

	test('kings and queens never coalesce into a capture', () => {
		const q = new PaintingQueue();
		q.push(capture({ dedupeKey: 'piece:1' }), 0);
		expect(q.push({ kind: 'kingfall', dedupeKey: 'kingfall:x' }, 100)).toBe('queued');
		expect(q.size).toBe(2);
	});

	test('at most 3 wait; the lowest-ranked, oldest goes first', () => {
		const q = new PaintingQueue();
		q.push(capture({ dedupeKey: 'piece:1' }), 0);
		q.push(capture({ dedupeKey: 'piece:2' }), 2000);
		q.push({ kind: 'arrival', pieceType: 'queen', dedupeKey: 'arrival:1' }, 4000);
		expect(q.push({ kind: 'kingfall', dedupeKey: 'kingfall:x' }, 6000)).toBe('queued');
		expect(q.size).toBe(3);
		const order = [q.next(), q.next(), q.next()].map(m => m.dedupeKey);
		expect(order).toEqual(['kingfall:x', 'arrival:1', 'piece:2']);
	});

	test('a newcomer ranked below everything waiting is the one dropped', () => {
		const q = new PaintingQueue();
		q.push({ kind: 'kingfall', dedupeKey: 'kingfall:a' }, 0);
		q.push({ kind: 'kingfall', dedupeKey: 'kingfall:b' }, 10);
		q.push({ kind: 'arrival', pieceType: 'queen', dedupeKey: 'arrival:1' }, 20);
		expect(q.push(capture({ dedupeKey: 'piece:9' }), 3000)).toBe('dropped');
		expect(q.size).toBe(3);
	});

	test('a card that has begun to close takes no more captures', () => {
		// The director calls finish() as the fade starts, so a blow
		// landing during the fade is a painting of its own.
		const q = new PaintingQueue();
		q.push(capture({ dedupeKey: 'piece:1' }), 0);
		q.next();
		q.finish();
		expect(q.push(capture({ dedupeKey: 'piece:2' }), 300)).toBe('queued');
		expect(q.next().dedupeKey).toBe('piece:2');
	});

	test('clear empties the waiting line', () => {
		const q = new PaintingQueue();
		q.push(capture({ dedupeKey: 'piece:1' }), 0);
		q.clear();
		expect(q.next()).toBeNull();
	});
});

describe('moments from server payloads', () => {
	const ME = 'me';

	test('chess_capture: types from the payload, either side of it', () => {
		const payload = {
			at: { x: 1, z: 2 },
			capturedPiece: { id: 'b1', type: 'BISHOP', player: 'bot2' },
			capturedBy: { playerId: ME, pieceId: 'n1', pieceType: 'knight' },
		};
		expect(fromChessCapture(payload, ME)).toEqual(expect.objectContaining({
			kind: 'capture', dedupeKey: 'piece:b1', attackerId: ME, victimId: 'bot2',
			attackerType: 'knight', victimType: 'bishop',
		}));
		// We were the victim.
		expect(fromChessCapture(payload, 'bot2')).not.toBeNull();
		// Someone else's fight is not ours to paint.
		expect(fromChessCapture(payload, 'stranger')).toBeNull();
		expect(fromChessCapture(payload, null)).toBeNull();
	});

	test('chess_move with a capture gives the same moment (AI check escape)', () => {
		const viaMove = fromChessMove({
			playerId: 'bot2',
			movedPiece: { id: 'q9', type: 'QUEEN' },
			capturedPiece: { id: 'r4', type: 'ROOK', player: ME },
		}, ME);
		expect(viaMove).toEqual(expect.objectContaining({
			kind: 'capture', dedupeKey: 'piece:r4', attackerType: 'queen', victimType: 'rook',
		}));
		expect(fromChessMove({ playerId: ME, movedPiece: { type: 'PAWN' }, capturedPiece: null }, ME)).toBeNull();
	});

	test('taking a king is a king’s fall, keyed to its owner', () => {
		const m = fromChessCapture({
			capturedPiece: { id: 'k2', type: 'KING', player: 'bot2' },
			capturedBy: { playerId: ME, pieceType: 'rook' },
		}, ME);
		expect(m).toEqual(expect.objectContaining({ kind: 'kingfall', dedupeKey: 'kingfall:bot2', attackerType: 'rook' }));
		const viaEvent = fromKingCaptured({ captorId: ME, defeatedId: 'bot2' }, ME);
		expect(viaEvent.dedupeKey).toBe(m.dedupeKey);
		expect(viaEvent.siege).toBe(true);
		expect(fromKingCaptured({ captorId: 'a', defeatedId: 'b' }, ME)).toBeNull();
	});

	test('promotion to a queen is her arrival; other pieces are not (yet)', () => {
		expect(fromPromotion({ playerId: ME, pieceId: 'q1', pieceType: 'QUEEN' }, ME))
			.toEqual(expect.objectContaining({ kind: 'arrival', pieceType: 'queen', dedupeKey: 'arrival:q1' }));
		expect(fromPromotion({ playerId: ME, pieceId: 'r1', pieceType: 'ROOK' }, ME)).toBeNull();
		expect(fromPromotion({ playerId: 'other', pieceId: 'q2', pieceType: 'QUEEN' }, ME)).toBeNull();
	});

	test('battle end: victory, or defeat (knocked out counts); draws are not painted', () => {
		expect(fromBattleEnd({ battleId: 'b', outcome: 'victory', playerId: ME }).outcome).toBe('victory');
		expect(fromBattleEnd({ battleId: 'b', outcome: 'out', playerId: ME }).outcome).toBe('defeat');
		expect(fromBattleEnd({ battleId: 'b', outcome: 'draw', playerId: ME })).toBeNull();
	});
});

describe('captions', () => {
	const players = {
		me: { name: 'Geofrey' },
		bot2: { name: 'Bot 2' },
		anon: { name: 'Player_3fa2c1' },
		bare: {},
	};

	test('the examples, word for word (typographic apostrophes, as in the UI)', () => {
		expect(captionFor({ ...capture(), attackerName: 'Geofrey', victimName: 'Bot 2' }))
			.toBe('Geofrey’s knight slays Bot 2’s bishop');
		expect(captionFor({ kind: 'kingfall', victimName: 'Bot 2' })).toBe('Bot 2’s king has fallen');
		expect(captionFor({ kind: 'arrival', pieceType: 'queen', playerName: 'Geofrey' }))
			.toBe('A queen comes ashore for Geofrey');
		expect(captionFor({ kind: 'battle', outcome: 'victory', playerName: 'Geofrey' })).toBe('Victory for Geofrey');
		expect(captionFor({ kind: 'battle', outcome: 'defeat', playerName: 'Geofrey' })).toBe('Defeat for Geofrey');
	});

	test('each attacker has its verb; names ending in s take a bare apostrophe', () => {
		expect(captionFor({ ...capture({ attackerType: 'pawn', victimType: 'queen' }), attackerName: 'Hans', victimName: 'Bot 2' }))
			.toBe('Hans’ pawn fells Bot 2’s queen');
		expect(captionFor({ ...capture({ attackerType: 'ROOK' }), attackerName: 'A', victimName: 'B' })).toMatch(/rook crushes/);
	});

	test('names come from the roster; ids and placeholders never show', () => {
		expect(displayNameOf(players, 'me')).toBe('Geofrey');
		expect(displayNameOf(players, 'anon')).toBeNull();
		expect(displayNameOf(players, 'bare')).toBeNull();
		expect(displayNameOf(players, 'missing')).toBeNull();
		expect(displayNameOf({ x1: { name: 'x1' } }, 'x1')).toBeNull();
		// The viewer's own chosen name stands in for a server placeholder.
		expect(displayNameOf(players, 'anon', { localId: 'anon', localName: 'Astrid' })).toBe('Astrid');
		expect(isPlaceholderName('Guest')).toBe(true);
		expect(isPlaceholderName('DevPlayer_9')).toBe(true);
		expect(isPlaceholderName('Sigrid')).toBe(false);

		const caption = captionFor({ ...capture(), attackerName: displayNameOf(players, 'anon'), victimName: 'Bot 2' });
		expect(caption).toBe('A rival’s knight slays Bot 2’s bishop');
		expect(caption).not.toMatch(/Player_|anon/);
		expect(captionFor({ kind: 'kingfall', victimName: null })).toBe('A rival’s king has fallen');
	});

	test('a nameless viewer is "your", never "a rival", and their own moments go unnamed', () => {
		expect(captionFor({ ...capture(), attackerName: null, attackerIsYou: true, victimName: 'Bot 2' }))
			.toBe('Your knight slays Bot 2’s bishop');
		expect(captionFor({ ...capture(), attackerName: 'Bot 2', victimName: null, victimIsYou: true }))
			.toBe('Bot 2’s knight slays your bishop');
		expect(captionFor({ kind: 'kingfall', victimName: null, victimIsYou: true })).toBe('Your king has fallen');
		expect(captionFor({ kind: 'arrival', pieceType: 'queen', playerName: null })).toBe('A queen comes ashore');
		expect(captionFor({ kind: 'battle', outcome: 'victory', playerName: null })).toBe('Victory');
		expect(captionFor({ kind: 'battle', outcome: 'defeat' })).toBe('Defeat');
	});

	test('battle seat badges are dropped from names', () => {
		const seats = { s0: { name: '⚔ Geofrey' }, s1: { name: '⚔ Bot 3' }, s2: { name: '⚔ Player_346eeb' } };
		expect(displayNameOf(seats, 's0')).toBe('Geofrey');
		expect(displayNameOf(seats, 's1')).toBe('Bot 3');
		expect(displayNameOf(seats, 's2')).toBeNull();
		expect(cleanName('  ⚔ 👑 Astrid ')).toBe('Astrid');
		expect(cleanName('Bot 2')).toBe('Bot 2');
	});

	test('an unknown attacker type still reads well', () => {
		expect(captionFor({ kind: 'capture', attackerType: 'piece', victimType: 'PAWN', attackerName: 'A', victimName: 'B' }))
			.toBe('A’s piece takes B’s pawn');
	});
});

describe('Full / Small / Off setting', () => {
	afterEach(() => localStorage.clear());

	test('defaults to Full; unknown values read as Full', () => {
		expect(getPaintingSetting()).toBe('full');
		localStorage.setItem(PAINTING_SETTING_KEY, 'huge');
		expect(getPaintingSetting()).toBe('full');
		expect(parsePaintingSetting(' SMALL ')).toBe('small');
	});

	test('persists', () => {
		setPaintingSetting('small');
		expect(localStorage.getItem(PAINTING_SETTING_KEY)).toBe('small');
		expect(getPaintingSetting()).toBe('small');
		expect(paintingSettingLabel('off')).toBe('Paintings: Off');
	});
});

describe('woodcut fallback', () => {
	test('returns a labelled canvas even without a 2D context', () => {
		// jsdom has no 2D canvas; say so quietly rather than logging.
		jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
		const canvas = drawWoodcut(capture(), { seed: 'capture.knight.bishop', label: 'A woodcut: test' });
		expect(canvas.tagName).toBe('CANVAS');
		expect(canvas.getAttribute('role')).toBe('img');
		expect(canvas.getAttribute('aria-label')).toBe('A woodcut: test');
	});
});

describe('painting card', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		document.body.innerHTML = '';
	});
	afterEach(() => {
		closePaintingCard();
		jest.runOnlyPendingTimers();
		jest.useRealTimers();
	});

	test('the caption alone is spoken, through a live region that is always there', () => {
		const art = document.createElement('img');
		art.alt = 'A long description of the painting';
		showPaintingCard({ art, caption: 'Bot 2’s king has fallen' });
		const live = document.getElementById('tetches-painting-live');
		const card = document.getElementById('tetches-painting');
		expect(live.getAttribute('role')).toBe('status');
		expect(card.getAttribute('role')).toBeNull();
		expect(card.getAttribute('aria-live')).toBeNull();
		expect(card.contains(live)).toBe(false);
		jest.advanceTimersByTime(100);
		expect(live.textContent).toBe('Bot 2’s king has fallen');
		closePaintingCard();
		jest.advanceTimersByTime(1000);
		// Still in the page, ready for the next one.
		expect(document.getElementById('tetches-painting-live')).toBe(live);
		expect(card.hidden).toBe(true);
	});

	test('onClosing fires as the fade starts, onClosed after it', () => {
		const calls = [];
		const handle = showPaintingCard({
			art: null,
			caption: 'x',
			onClosing: () => calls.push('closing'),
			onClosed: () => calls.push('closed'),
		});
		handle.close();
		expect(calls).toEqual(['closing']);
		jest.advanceTimersByTime(1000);
		expect(calls).toEqual(['closing', 'closed']);
		handle.close();
		expect(calls).toEqual(['closing', 'closed']);
	});

	test('its time on screen starts when the picture is ready and the fade-in begins', async () => {
		const art = document.createElement('img');
		Object.defineProperty(art, 'complete', { value: false });
		const onVisible = jest.fn();
		showPaintingCard({ art, caption: 'x', onVisible });
		const card = document.getElementById('tetches-painting');
		jest.advanceTimersByTime(500);
		await Promise.resolve();
		// Still loading: mounted, but not shown and not on the clock.
		expect(onVisible).not.toHaveBeenCalled();
		expect(card.classList.contains('tp-visible')).toBe(false);
		art.dispatchEvent(new Event('load'));
		for (let i = 0; i < 5; i++) await Promise.resolve();
		jest.advanceTimersByTime(100);
		expect(onVisible).toHaveBeenCalledTimes(1);
		expect(card.classList.contains('tp-visible')).toBe(true);
	});

	test('a picture that never loads still shows, after a short wait', async () => {
		const art = document.createElement('img');
		Object.defineProperty(art, 'complete', { value: false });
		const onVisible = jest.fn();
		showPaintingCard({ art, caption: 'x', onVisible });
		jest.advanceTimersByTime(ART_READY_TIMEOUT_MS + 10);
		for (let i = 0; i < 5; i++) await Promise.resolve();
		jest.advanceTimersByTime(100);
		expect(onVisible).toHaveBeenCalledTimes(1);
	});

	test('the woodcut (a canvas) is ready at once; a card closed first never starts its clock', async () => {
		const onVisible = jest.fn();
		showPaintingCard({ art: document.createElement('canvas'), caption: 'x', onVisible });
		for (let i = 0; i < 3; i++) await Promise.resolve();
		jest.advanceTimersByTime(100);
		expect(onVisible).toHaveBeenCalledTimes(1);
		const late = jest.fn();
		const handle = showPaintingCard({ art: document.createElement('canvas'), caption: 'y', onVisible: late });
		handle.close({ immediate: true });
		for (let i = 0; i < 3; i++) await Promise.resolve();
		jest.advanceTimersByTime(100);
		expect(late).not.toHaveBeenCalled();
	});

	test('the close button is a real button that passes no click to the board', () => {
		showPaintingCard({ art: null, caption: 'x' });
		const btn = document.querySelector('#tetches-painting .tp-close');
		expect(btn.tagName).toBe('BUTTON');
		expect(btn.getAttribute('aria-label')).toBe('Close painting');
	});
});

// ── Longships (Viking battles) ─────────────────────────────────────────────

describe('longship moments', () => {
	const ME = 'seat_me';
	const BOT = 'seat_bot2';
	const NOW = 1_000_000;
	const ctx = (extra = {}) => ({ localId: ME, now: NOW, cells: {}, pieces: [], ...extra });
	const move = (kind, over = {}) => ({
		kind,
		move: {
			playerId: ME,
			movedPiece: { id: 'n1', type: 'KNIGHT', player: ME },
			movedFrom: { x: 1, z: 1 },
			movedTo: { x: 1, z: 2 },
			capturedPiece: null,
			ship: { kind, shipId: 's1' },
			...over,
		},
	});
	const sailed = (over = {}) => ({
		kind: 'sailed', shipId: 's1', from: { x: 1, z: 2 }, to: { x: 1, z: 6 },
		playerId: ME, passengerId: 'n1', readyAt: NOW + 3000, ...over,
	});
	const slotOf = m => slotCandidates(m)[0];
	const caption = (m, names = { [ME]: null, [BOT]: 'Bot 2' }) => captionFor({
		...m,
		attackerName: names[m.attackerId] ?? null,
		victimName: names[m.victimId] ?? null,
		attackerIsYou: m.attackerId === ME,
		victimIsYou: m.victimId === ME,
	});

	test('every scene has a painting in the manifest', () => {
		for (const scene of SHIP_SCENES) {
			expect(resolvePainting(MANIFEST, slotCandidates({ kind: 'ship', scene }))?.slot).toBe(`ship.${scene}`);
		}
		expect(slotCandidates({ kind: 'ship', scene: 'nonsense' })).toEqual([]);
	});

	test('embark: your piece steps aboard → ship.embark', () => {
		const m = new ShipMoments().fromShipEvent(move('embark'), ctx());
		expect(slotOf(m)).toBe('ship.embark');
		expect(m.staleMs).toBe(SHIP_STALE_MS);
		expect(caption(m)).toBe('Your knight steps aboard your longship');
	});

	test('lifeboat: boarding from a square the sea takes within 10 s', () => {
		const sinkInMs = (x, z) => (x === 1 && z === 1 ? 6000 : 60000);
		const m = new ShipMoments().fromShipEvent(move('embark'), ctx({ sinkInMs }));
		expect(slotOf(m)).toBe('ship.lifeboat');
		expect(caption(m)).toBe('Your knight takes to the longship as the sea rises');
		// 12 s away is no flight; no sea at all is a plain embark.
		expect(slotOf(new ShipMoments().fromShipEvent(move('embark'), ctx({ sinkInMs: () => 12000 })))).toBe('ship.embark');
		expect(slotOf(new ShipMoments().fromShipEvent(move('embark'), ctx({ sinkInMs: null })))).toBe('ship.embark');
	});

	test('setsail: only the first laden sail of a voyage; empty sails never paint', () => {
		const ships = new ShipMoments();
		expect(ships.fromShipEvent(sailed({ passengerId: null, readyAt: NOW - 5000 }), ctx())).toBeNull();
		ships.fromShipEvent(move('embark'), ctx());
		const first = ships.fromShipEvent(sailed(), ctx());
		expect(slotOf(first)).toBe('ship.setsail');
		expect(caption(first)).toBe('Your longship sets sail with your knight aboard');
		// The next leg of the same voyage is not painted…
		expect(ships.fromShipEvent(sailed({ from: { x: 1, z: 6 }, to: { x: 4, z: 6 }, readyAt: NOW + 7000 }), ctx())).toBeNull();
		// …but a new voyage (land, embark again) is.
		ships.fromShipEvent(move('land', { movedFrom: { x: 4, z: 6 }, movedTo: { x: 4, z: 7 }, ship: { kind: 'land', shipId: 's1', landOwner: ME } }), ctx());
		ships.fromShipEvent(move('embark', { movedFrom: { x: 4, z: 7 }, movedTo: { x: 4, z: 6 } }), ctx());
		expect(slotOf(ships.fromShipEvent(sailed({ from: { x: 4, z: 6 }, to: { x: 8, z: 6 }, readyAt: NOW + 9000 }), ctx()))).toBe('ship.setsail');
	});

	test('setsail mid-voyage (joined late) still paints once', () => {
		const ships = new ShipMoments();
		const pieces = [{ id: 'r9', type: 'ROOK', player: ME }];
		const m = ships.fromShipEvent(sailed({ passengerId: 'r9' }), ctx({ pieces }));
		expect(caption(m)).toBe('Your longship sets sail with your rook aboard');
	});

	test('landing: onto enemy land only, told from either side', () => {
		const land = move('land', { ship: { kind: 'land', shipId: 's1', landOwner: BOT } });
		const mine = new ShipMoments().fromShipEvent(land, ctx());
		expect(slotOf(mine)).toBe('ship.landing');
		expect(caption(mine)).toBe('Your knight lands on Bot 2’s shore');
		// Bot 2 lands on my shore.
		const theirs = new ShipMoments().fromShipEvent(move('land', {
			playerId: BOT, movedPiece: { id: 'b7', type: 'BISHOP', player: BOT }, ship: { kind: 'land', shipId: 's2', landOwner: ME },
		}), ctx());
		expect(caption(theirs)).toBe('Bot 2’s bishop lands on your shore');
		// Home to your own shore is no landing.
		expect(new ShipMoments().fromShipEvent(move('land', { ship: { kind: 'land', shipId: 's1', landOwner: ME } }), ctx())).toBeNull();
	});

	test('raid: ship to land with a capture, keyed to the captured piece', () => {
		const raid = move('raid', {
			capturedPiece: { id: 'p3', type: 'PAWN', player: BOT },
			ship: { kind: 'raid', shipId: 's1', landOwner: BOT },
		});
		const m = new ShipMoments().fromShipEvent(raid, ctx());
		expect(slotOf(m)).toBe('ship.raid');
		expect(m.dedupeKey).toBe('piece:p3');
		expect(caption(m)).toBe('Your raiders storm Bot 2’s shore');
		const victim = new ShipMoments().fromShipEvent(move('raid', {
			playerId: BOT,
			movedPiece: { id: 'r2', type: 'ROOK', player: BOT },
			capturedPiece: { id: 'p1', type: 'PAWN', player: ME },
			ship: { kind: 'raid', shipId: 's2', landOwner: ME },
		}), ctx());
		expect(caption(victim)).toBe('Bot 2’s raiders storm your shore');
	});

	test('a queen coming ashore is her arrival (arrival.queen), ranked over the ship scenes', () => {
		const queen = { id: 'q1', type: 'QUEEN', player: ME };
		const m = new ShipMoments().fromShipEvent(move('land', {
			movedPiece: queen, ship: { kind: 'land', shipId: 's1', landOwner: BOT },
		}), ctx());
		expect(m.kind).toBe('arrival');
		expect(slotOf(m)).toBe('arrival.queen');
		expect(priorityOf(m)).toBeGreaterThan(priorityOf({ kind: 'ship', scene: 'raid' }));
		expect(caption(m)).toBe('Your queen comes ashore at Bot 2’s harbour');
		const raid = new ShipMoments().fromShipEvent(move('raid', {
			movedPiece: queen, capturedPiece: { id: 'k', type: 'KNIGHT', player: BOT }, ship: { kind: 'raid', shipId: 's1', landOwner: BOT },
		}), ctx());
		// storming ashore (a capture as she lands) is painted as the raid
		expect(slotOf(raid)).toBe('ship.raid');
		expect(caption(raid)).toBe('Your queen storms ashore at Bot 2’s harbour');
		// Even home: she comes ashore.
		const home = new ShipMoments().fromShipEvent(move('land', { movedPiece: queen, ship: { kind: 'land', shipId: 's1', landOwner: ME } }), ctx());
		expect(caption(home)).toBe('Your queen comes ashore');
		const theirs = new ShipMoments().fromShipEvent(move('land', {
			playerId: BOT, movedPiece: { id: 'q2', type: 'QUEEN', player: BOT }, ship: { kind: 'land', shipId: 's2', landOwner: ME },
		}), ctx());
		expect(caption(theirs)).toBe('Bot 2’s queen comes ashore on your shore');
	});

	test('raidcheck: a check by a piece that landed within 30 s', () => {
		const ships = new ShipMoments();
		ships.fromShipEvent(move('land', { ship: { kind: 'land', shipId: 's1', landOwner: BOT } }), ctx());
		const check = { attackerId: ME, attackerPieceId: 'n1', defenderId: BOT };
		const m = ships.fromCheck(check, ctx({ now: NOW + 12000 }));
		expect(slotOf(m)).toBe('ship.raidcheck');
		expect(caption(m)).toBe('Your raiders put Bot 2’s king in check');
		expect(ships.fromCheck(check, ctx({ now: NOW + RAIDCHECK_WINDOW_MS + 1 }))).toBeNull();
		// A piece that never sailed is no raider.
		expect(ships.fromCheck({ attackerId: ME, attackerPieceId: 'other', defenderId: BOT }, ctx({ now: NOW + 1000 }))).toBeNull();
		// The defender's side of it.
		const theirs = new ShipMoments();
		theirs.fromShipEvent(move('land', {
			playerId: BOT, movedPiece: { id: 'r2', type: 'ROOK', player: BOT }, ship: { kind: 'land', shipId: 's2', landOwner: ME },
		}), ctx());
		expect(caption(theirs.fromCheck({ attackerId: BOT, attackerPieceId: 'r2', defenderId: ME }, ctx({ now: NOW + 5000 }))))
			.toBe('Bot 2’s raiders threaten your king');
	});

	test('boarded: the passenger captured, keyed to it; ship_seized adds nothing', () => {
		const ships = new ShipMoments();
		// ship_seized arrives first (spread with the dispatch's kind on top).
		expect(ships.fromShipEvent({
			shipId: 's2', from: BOT, to: ME, byPieceId: 'n1', at: { x: 5, z: 5 }, capturedPieceId: 'r2', kind: 'seized',
		}, ctx())).toBeNull();
		const m = ships.fromShipEvent(move('boarded', {
			movedTo: { x: 5, z: 5 },
			capturedPiece: { id: 'r2', type: 'ROOK', player: BOT },
			ship: { kind: 'boarded', shipId: 's2' },
		}), ctx());
		expect(slotOf(m)).toBe('ship.boarded');
		expect(m.dedupeKey).toBe('piece:r2');
		expect(caption(m)).toBe('Your knight boards Bot 2’s longship');
		const victim = new ShipMoments().fromShipEvent(move('boarded', {
			playerId: BOT, movedPiece: { id: 'b4', type: 'BISHOP', player: BOT },
			capturedPiece: { id: 'n1', type: 'KNIGHT', player: ME }, ship: { kind: 'boarded', shipId: 's1' },
		}), ctx());
		expect(caption(victim)).toBe('Bot 2’s bishop boards your longship');
	});

	test('seized: an empty ship taken, from ship_seized (which names the loser)', () => {
		const ships = new ShipMoments();
		const seized = { shipId: 's1', from: ME, to: BOT, byPieceId: 'b4', at: { x: 2, z: 2 }, capturedPieceId: null };
		// Either spread order of the dispatch.
		const m = ships.fromShipEvent({ ...seized, kind: 'seized' }, ctx());
		expect(slotOf(m)).toBe('ship.seized');
		expect(caption(m)).toBe('Your longship is seized by Bot 2');
		expect(caption({ ...m, attackerId: 'nameless' })).toBe('Your longship is seized');
		expect(normaliseShipEvent({ kind: 'seized', ...seized, kind2: 1 }).seizeKind).toBe('seize');
		expect(normaliseShipEvent({ ...seized, kind: 'seize' }).type).toBe('seized');
		// The follow-up move paints nothing more.
		expect(ships.fromShipEvent(move('seize', {
			playerId: BOT, movedPiece: { id: 'b4', type: 'BISHOP', player: BOT }, movedTo: { x: 2, z: 2 },
		}), ctx())).toBeNull();
		// Nor does the sweep's ship_lost reason 'seized'.
		expect(ships.fromShipEvent({ kind: 'lost', shipId: 's1', seatId: ME, reason: 'seized', rebuildAt: NOW + 45000 }, ctx())).toBeNull();
		const mine = new ShipMoments().fromShipEvent({ ...seized, from: BOT, to: ME, byPieceId: 'n1', kind: 'seized' }, ctx());
		expect(caption(mine)).toBe('You seize Bot 2’s longship');
	});

	test('sunk: with a passenger → ship.lost, empty → ship.emptysunk (owner from the board)', () => {
		const cells = { '3,4': [{ type: 'ship', shipId: 's1', player: ME }] };
		const lost = new ShipMoments().fromShipEvent({ kind: 'sunk', shipId: 's1', x: 3, z: 4, passengerId: 'n1' }, ctx({ cells }));
		expect(slotOf(lost)).toBe('ship.lost');
		expect(caption(lost)).toBe('Your longship is lost with all hands');
		const empty = new ShipMoments().fromShipEvent({ kind: 'sunk', shipId: 's1', x: 3, z: 4, passengerId: null }, ctx({ cells }));
		expect(slotOf(empty)).toBe('ship.emptysunk');
		expect(caption(empty)).toBe('The sea swallows your empty longship');
		// Someone else's ship going down is not ours to paint.
		const theirs = { '3,4': [{ type: 'ship', shipId: 's2', player: BOT }] };
		expect(new ShipMoments().fromShipEvent({ kind: 'sunk', shipId: 's2', x: 3, z: 4, passengerId: null }, ctx({ cells: theirs }))).toBeNull();
		// The cell already gone: the owner is remembered from earlier events.
		const ships = new ShipMoments();
		ships.fromShipEvent(sailed({ passengerId: null }), ctx());
		expect(slotOf(ships.fromShipEvent({ kind: 'sunk', shipId: 's1', x: 1, z: 6, passengerId: null }, ctx()))).toBe('ship.emptysunk');
	});

	test('built: a new keel for you → ship.newkeel; for others, news from afar now and then', () => {
		const m = new ShipMoments().fromShipEvent({ kind: 'built', shipId: 's9', seatId: ME, x: 1, z: 0 }, ctx());
		expect(slotOf(m)).toBe('ship.newkeel');
		expect(caption(m)).toBe('A new keel is laid for you');
		expect(m.distant).toBeUndefined();
		const ships = new ShipMoments();
		const far = ships.fromShipEvent({ kind: 'built', shipId: 's8', seatId: BOT, x: 1, z: 0 }, ctx());
		expect(far.distant).toBe(true);
		expect(slotOf(far)).toBe('ship.newkeel');
		// at most one piece of news a minute
		expect(ships.fromShipEvent({ kind: 'built', shipId: 's7', seatId: BOT, x: 2, z: 0 }, ctx())).toBeNull();
	});

	test('news from afar: a ship seized between two others is told in the third person', () => {
		const ships = new ShipMoments();
		const t0 = ctx().now;
		const m = ships.fromShipEvent({ kind: 'seize', shipId: 's3', from: 'seat_x', to: BOT, byPieceId: 'b1', at: { x: 1, z: 1 }, capturedPieceId: null }, ctx());
		expect(m.distant).toBe(true);
		expect(slotOf(m)).toBe('ship.seized');
		expect(caption(m, { [BOT]: 'Bot 2', seat_x: 'Bot 3' })).toBe('Bot 2 seizes Bot 3’s longship');
		// a minute on, the next piece of news may be told
		const later = ships.fromShipEvent({ kind: 'built', shipId: 's4', seatId: BOT, x: 0, z: 0 }, { ...ctx(), now: t0 + 61000 });
		expect(later && later.distant).toBe(true);
		// small talk between others (an embark, a sail) is never news
		expect(ships.fromShipEvent(move('embark', { playerId: 'seat_x', movedPiece: { id: 'q', type: 'ROOK', player: 'seat_x' } }), { ...ctx(), now: t0 + 200000 })).toBeNull();
	});

	test('a landing on your shore is painted even when the move does not name the land’s owner', () => {
		const cells = { '4,0': [{ type: 'home', player: ME }] };
		const m = new ShipMoments().fromShipEvent(move('land', {
			playerId: BOT, movedPiece: { id: 'k1', type: 'KNIGHT', player: BOT }, movedTo: { x: 4, z: 0 },
			ship: { kind: 'land', shipId: 's2' },
		}), { ...ctx(), cells });
		expect(slotOf(m)).toBe('ship.landing');
		expect(m.victimId).toBe(ME);
	});

	test('only the viewer’s ships: strangers’ voyages are never painted', () => {
		const ships = new ShipMoments();
		const stranger = { playerId: 'seat_x', movedPiece: { id: 'z', type: 'ROOK', player: 'seat_x' } };
		expect(ships.fromShipEvent(move('embark', stranger), ctx())).toBeNull();
		expect(ships.fromShipEvent(sailed({ playerId: 'seat_x', passengerId: 'z' }), ctx())).toBeNull();
		expect(ships.fromShipEvent(move('land', { ...stranger, ship: { kind: 'land', shipId: 's1', landOwner: BOT } }), ctx())).toBeNull();
		expect(ships.fromShipEvent({ kind: 'lost', shipId: 's1', seatId: ME, reason: 'sunk', rebuildAt: 1 }, ctx())).toBeNull();
	});

	test('no double-fire: the same event delivered twice paints once', () => {
		const ships = new ShipMoments();
		const embark = move('embark');
		expect(ships.fromShipEvent(embark, ctx())).not.toBeNull();
		// The raw chess_move and the tetches:ship dispatch of it.
		expect(ships.fromShipEvent({ kind: 'embark', move: embark.move }, ctx())).toBeNull();
		const sail = sailed();
		expect(ships.fromShipEvent(sail, ctx())).not.toBeNull();
		expect(ships.fromShipEvent({ ...sail }, ctx())).toBeNull();
		const built = { kind: 'built', shipId: 's9', seatId: ME, x: 1, z: 0 };
		expect(ships.fromShipEvent(built, ctx())).not.toBeNull();
		expect(ships.fromShipEvent(built, ctx())).toBeNull();
	});

	test('a raid and its chess_capture make one card', () => {
		const q = new PaintingQueue();
		const raid = new ShipMoments().fromShipEvent(move('raid', {
			capturedPiece: { id: 'p3', type: 'PAWN', player: BOT }, ship: { kind: 'raid', shipId: 's1', landOwner: BOT },
		}), ctx());
		expect(q.push(raid, 0)).toBe('queued');
		const capture = fromChessCapture({
			capturedPiece: { id: 'p3', type: 'PAWN', player: BOT }, capturedBy: { playerId: ME, pieceType: 'knight' },
		}, ME);
		expect(q.push(capture, 10)).toBe('duplicate');
	});
});

describe('longship throttle', () => {
	const ship = (scene, over = {}) => ({
		kind: 'ship', scene, dedupeKey: `ship:${scene}:${Math.random()}`, staleMs: SHIP_STALE_MS,
		throttleKey: `b1:ship.${scene}`, ...over,
	});

	test('once per type per battle', () => {
		const q = new PaintingQueue();
		expect(q.push(ship('embark'), 0)).toBe('queued');
		// While one waits…
		expect(q.push(ship('embark'), 100)).toBe('throttled');
		q.next(200);
		// …is on screen…
		expect(q.push(ship('embark'), 300)).toBe('throttled');
		q.finish();
		// …or has been shown.
		expect(q.push(ship('embark'), 60000)).toBe('throttled');
		// Other scenes, and the same scene in another battle, are free.
		expect(q.push(ship('setsail'), 60000)).toBe('queued');
		expect(q.push(ship('embark', { throttleKey: 'b2:ship.embark' }), 60000)).toBe('queued');
	});

	test('a throttled raid leaves its capture free to be painted as a capture', () => {
		const q = new PaintingQueue();
		q.push(ship('raid', { dedupeKey: 'piece:a' }), 0);
		q.next(0);
		q.finish();
		expect(q.push(ship('raid', { dedupeKey: 'piece:b' }), 9000)).toBe('throttled');
		expect(q.push(capture({ dedupeKey: 'piece:b' }), 9010)).toBe('queued');
	});

	test('dropped if it waited more than 3 s; other moments keep 20 s', () => {
		const q = new PaintingQueue();
		q.push(ship('newkeel'), 0);
		q.push(capture({ dedupeKey: 'piece:1' }), 0);
		const next = q.next(SHIP_STALE_MS + 1);
		expect(next.kind).toBe('capture');
		expect(q.next(SHIP_STALE_MS + 2)).toBeNull();
		// Dropped unseen, so it may still come later in the battle.
		expect(q.push(ship('newkeel'), 10000)).toBe('queued');
		expect(q.next(10000 + SHIP_STALE_MS).scene).toBe('newkeel');
	});

	test('a waiting ship scene asks the card on screen to make way (it would expire)', () => {
		const q = new PaintingQueue();
		q.push(capture({ dedupeKey: 'piece:1' }), 0);
		expect(q.hasUrgent(1, 0)).toBe(false);   // captures wait their turn
		q.push(ship('setsail'), 100);
		expect(q.hasUrgent(1, 200)).toBe(true);
		expect(q.hasUrgent(3, 200)).toBe(false); // a king's fall is not cut short
		expect(q.hasUrgent(1, 100 + SHIP_STALE_MS + 1)).toBe(false);
	});

	test('king > queen (arrival.queen) > ship scenes', () => {
		const q = new PaintingQueue();
		q.push(ship('raid'), 0);
		q.push({ kind: 'arrival', pieceType: 'queen', viaShip: true, dedupeKey: 'q', throttleKey: 'b1:arrival.queen', staleMs: SHIP_STALE_MS }, 10);
		q.push({ kind: 'kingfall', dedupeKey: 'kingfall:x' }, 20);
		expect([q.next(30), q.next(30), q.next(30)].map(m => m.kind)).toEqual(['kingfall', 'arrival', 'ship']);
		expect(durationFor({ kind: 'ship', scene: 'raid' })).toBe(5000);
	});
});

describe('the director with longships', () => {
	const ME = 'seat_me';
	const BOT = 'seat_bot2';
	let director;
	let gameState;
	let paintsFor;
	const flush = () => new Promise(resolve => setTimeout(resolve, 30));
	const embark = {
		playerId: ME,
		movedPiece: { id: 'n1', type: 'KNIGHT', player: ME },
		movedFrom: { x: 1, z: 1 },
		movedTo: { x: 1, z: 2 },
		capturedPiece: null,
		ship: { kind: 'embark', shipId: 's1' },
	};

	beforeAll(async () => {
		gameState = (await import('../../public/js/utils/gameState.js')).default;
		director = await import('../../public/js/paintings/paintingDirector.js');
		({ paintsFor } = await import('../../public/js/paintings/index.js'));
	});
	beforeEach(() => {
		document.body.innerHTML = '';
		delete document.documentElement.dataset.edition;
		gameState.localPlayerId = ME;
		gameState.players = { [ME]: { name: 'Guest' }, [BOT]: { name: '⚔ Bot 2' } };
		gameState.activeBattle = null;
		gameState.board = { cells: {} };
		gameState.chessPieces = [];
	});
	afterEach(() => closePaintingCard());

	test('the standard game does no painting work at all', () => {
		expect(paintsFor('chess_move', embark)).toBe(false);
		director.handlePaintingEvent('chess_move', embark);
		director.handlePaintingEvent('ship', { kind: 'embark', move: embark });
		expect(window.tetchesPaintings).toBeUndefined();
		expect(document.getElementById('tetches-painting')).toBeNull();
	});

	test('a Viking battle joined from the standard game paints; its end is still Viking after the seat goes', () => {
		gameState.activeBattle = { id: 'b1', edition: 'viking' };
		expect(paintsFor('chess_move', embark)).toBe(true);
		gameState.activeBattle = null;
		expect(paintsFor('battle_end', { battle: { id: 'b1', edition: 'viking' } })).toBe(true);
		expect(paintsFor('battle_end', { battle: { id: 'b1', edition: 'standard' } })).toBe(false);
	});

	test('the raw chess_move and its tetches:ship dispatch make one card', async () => {
		gameState.activeBattle = { id: 'b-double', edition: 'viking' };
		director.handlePaintingEvent('chess_move', embark);
		director.handlePaintingEvent('ship', { kind: 'embark', move: embark });
		const { counts } = window.tetchesPaintings;
		expect(counts['ship:ship']).toBe(1);
		expect(counts['ship:-']).toBe(1);
		await flush();
		expect(document.querySelector('#tetches-painting .tp-caption').textContent)
			.toBe('Your knight steps aboard your longship');
	});

	test('a raid through the director: one card, captioned by name, and chess_capture adds none', async () => {
		gameState.activeBattle = { id: 'b-raid', edition: 'viking' };
		const raid = {
			...embark,
			movedFrom: { x: 1, z: 2 },
			movedTo: { x: 2, z: 3 },
			capturedPiece: { id: 'p3', type: 'PAWN', player: BOT },
			ship: { kind: 'raid', shipId: 's1', landOwner: BOT },
		};
		closePaintingCard();
		await new Promise(resolve => setTimeout(resolve, 800));
		const before = { ...window.tetchesPaintings.counts };
		director.handlePaintingEvent('chess_move', raid);
		director.handlePaintingEvent('ship', { kind: 'raid', move: raid });
		director.handlePaintingEvent('chess_capture', {
			capturedPiece: raid.capturedPiece, capturedBy: { playerId: ME, pieceType: 'knight' },
		});
		const after = window.tetchesPaintings.counts;
		expect((after['ship:ship'] || 0) - (before['ship:ship'] || 0)).toBe(1);
		// The capture reached the director, and the queue knew it already.
		expect(window.tetchesPaintings.queue.seen.has('piece:p3')).toBe(true);
		await flush();
		expect(document.querySelector('#tetches-painting .tp-caption').textContent)
			.toBe('Your raiders storm Bot 2’s shore');
	});
});
