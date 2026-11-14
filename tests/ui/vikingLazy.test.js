/**
 * @jest-environment jsdom
 *
 * The Viking code's own file (scripts/vikingSplit.js): the app bundle's
 * stubs (public/js/vikingLazy/stubs/) stand in for the Viking-only
 * modules until dist/viking.bundle.js is here. They must
 *   • cover the real modules' names (the build swaps one for the other),
 *   • do nothing Viking before the chunk (the standard game, unchanged),
 *   • forward exactly once it is here,
 *   • and copy the few pure helpers they keep exactly.
 */

// The director's check-banner hook pulls in the 3D camera; not needed here.
jest.mock('../../public/js/checkAlert.js', () => ({ isDefenderInCheck: () => false }));

import fs from 'fs';
import path from 'path';

import * as realShipLayout from '../../public/js/viking/shipLayout.js';
import * as realRules from '../../public/js/viking/shipRulesClient.js';
import * as realShipEnv from '../../public/js/longships/shipEnv.js';
import * as realShipControls from '../../public/js/longships/shipControls.js';
import * as realShipRenderer from '../../public/js/viking/shipRenderer.js';
import * as realLandDress from '../../public/js/viking/landDress.js';
import * as realTheme from '../../public/js/viking/theme.js';
import * as realRuneStone from '../../public/js/viking/runeStone.js';
import * as realPieceFinish from '../../public/js/viking/pieceFinish.js';

import * as stubShipLayout from '../../public/js/vikingLazy/stubs/viking/shipLayout.js';
import * as stubRules from '../../public/js/vikingLazy/stubs/viking/shipRulesClient.js';
import * as stubShipEnv from '../../public/js/vikingLazy/stubs/longships/shipEnv.js';
import * as stubShipControls from '../../public/js/vikingLazy/stubs/longships/shipControls.js';
import * as stubShipRenderer from '../../public/js/vikingLazy/stubs/viking/shipRenderer.js';
import * as stubLandDress from '../../public/js/vikingLazy/stubs/viking/landDress.js';
import * as stubTheme from '../../public/js/vikingLazy/stubs/viking/theme.js';
import * as stubRuneStone from '../../public/js/vikingLazy/stubs/viking/runeStone.js';
import * as stubPieceFinish from '../../public/js/vikingLazy/stubs/viking/pieceFinish.js';
import { vk, vikingLoaded, onVikingReady } from '../../public/js/vikingLazy/runtime.js';

const PAIRS = {
	'viking/shipLayout.js': [realShipLayout, stubShipLayout],
	'viking/shipRulesClient.js': [realRules, stubRules],
	'longships/shipEnv.js': [realShipEnv, stubShipEnv],
	'longships/shipControls.js': [realShipControls, stubShipControls],
	'viking/shipRenderer.js': [realShipRenderer, stubShipRenderer],
	'viking/landDress.js': [realLandDress, stubLandDress],
	'viking/theme.js': [realTheme, stubTheme],
	'viking/runeStone.js': [realRuneStone, stubRuneStone],
	'viking/pieceFinish.js': [realPieceFinish, stubPieceFinish],
};

const JS = path.join(__dirname, '../../public/js');

afterEach(() => {
	delete window.__tetchesViking;
	delete document.documentElement.dataset.edition;
});

describe('stubs and the modules they stand in for', () => {
	test('every stub file is listed here (so each is checked)', () => {
		const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (
			e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
		const stubs = walk(path.join(JS, 'vikingLazy/stubs')).map(f => path.relative(path.join(JS, 'vikingLazy/stubs'), f));
		expect(stubs.sort()).toEqual(Object.keys(PAIRS).sort());
	});

	test.each(Object.keys(PAIRS))('%s: each stub export is the real module’s, of the same kind', (name) => {
		const [real, stub] = PAIRS[name];
		for (const key of Object.keys(stub)) {
			expect(real).toHaveProperty(key);
			expect(typeof stub[key]).toBe(typeof real[key]);
		}
	});

	test('the deck height the app bundle keeps is the real one', () => {
		expect(stubShipControls.SHIP_DECK_Y).toBeCloseTo(realShipControls.SHIP_DECK_Y, 12);
	});

	const CELLS = [
		null, undefined, [], {}, 'x', [{ type: 'tetromino' }], [{ type: 'chess' }, { type: 'ship', shipId: 1 }],
		{ type: 'ship' }, { type: 'tetromino' }, [null, { type: 'ship' }], [{ type: 'Ship' }],
	];

	test('cellHasShip copies are exact', () => {
		for (const cell of CELLS) {
			expect(stubShipLayout.cellHasShip(cell)).toBe(realShipLayout.cellHasShip(cell));
			expect(stubRules.cellHasShip(cell)).toBe(realRules.cellHasShip(cell));
		}
	});

	test('shipRulesActive and cellItems copies are exact', () => {
		const states = [
			null, {}, { activeBattle: { edition: 'viking' } }, { activeBattle: { edition: 'standard' } },
			{ board: { cells: { '1,2': [{ type: 'ship' }], '2,2': { contents: [{ type: 'x' }] }, '3,2': { type: 'tetromino' }, '4,2': 7 } } },
		];
		for (const gs of states) {
			expect(stubShipEnv.shipRulesActive(gs)).toBe(realShipEnv.shipRulesActive(gs));
			for (const x of [1, 2, 3, 4, 5]) expect(stubShipEnv.cellItems(gs, x, 2)).toEqual(realShipEnv.cellItems(gs, x, 2));
		}
	});
});

describe('before the Viking chunk (the standard game)', () => {
	const gs = { board: { cells: {} }, activeBattle: null };

	test('nothing Viking happens, and nothing is fetched for a standard page', () => {
		expect(vikingLoaded()).toBe(false);
		expect(vk('shipRenderer')).toBeNull();
		expect(stubLandDress.vikingLandWanted(gs)).toBe(false);
		expect(stubLandDress.vikingAppearance('A', 1, 2)).toBe('A');
		expect(stubShipRenderer.passengerPose(gs, 1, 2)).toBeNull();
		expect(stubShipRenderer.hasShipsDrawn()).toBe(false);
		expect(stubShipControls.selectedShipId()).toBeNull();
		expect(stubShipControls.currentSailLanes()).toEqual([]);
		expect(stubShipControls.trySailLaneClick({})).toBe(false);
		expect(stubShipControls.pickShipEntry({}, {})).toBeNull();
		expect(stubShipControls.handleShipClick({}, () => {})).toBe(false);
		expect(stubShipEnv.shipEntryAt(gs, 1, 2)).toBeNull();
		expect(stubShipEnv.noMoveShipTip(gs, {})).toBeNull();
		expect(stubShipEnv.SHIP_REFUSAL_TEXT.ship_rowing).toBeUndefined();
		expect(stubRuneStone.dressRuneStone({}, {})).toBe(false);
		stubTheme.updateVikingTheme({}, gs, 0);
		stubShipRenderer.animateShips({}, gs, 16);
		stubPieceFinish.vikingPieceFinish({}, true);
		// No <script> for the chunk was added.
		expect(document.querySelector('script[src*="viking.bundle"]')).toBeNull();
	});

	test('move lists are untouched', () => {
		const moves = [{ x: 1, z: 1 }];
		expect(stubShipEnv.applyShipRules(gs, { position: { x: 0, z: 0 } }, moves)).toEqual({ moves, refused: [] });
	});

	test('a Viking battle before the chunk: no move onto or across a ship is offered', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		const viking = {
			activeBattle: { edition: 'viking', id: 'b' },
			board: { cells: { '2,0': [{ type: 'ship', shipId: 's1' }], '0,2': { contents: [{ type: 'ship', shipId: 's2' }] } } },
		};
		const rook = { type: 'ROOK', position: { x: 0, z: 0 } };
		const moves = [{ x: 1, z: 0 }, { x: 2, z: 0 }, { x: 3, z: 0 }, { x: 0, z: 1 }, { x: 0, z: 2 }, { x: 0, z: 3 }];
		const { moves: kept, refused } = stubShipEnv.applyShipRules(viking, rook, moves);
		expect(kept).toEqual([{ x: 1, z: 0 }, { x: 0, z: 1 }]);
		expect(refused.map(r => `${r.x},${r.z}`)).toEqual(['2,0', '3,0', '0,2', '0,3']);
		expect(refused.every(r => r.reason === 'ship_loading' && /try that again/.test(r.message))).toBe(true);
		// A knight jumps: only the ship's own square is held back.
		const knight = { type: 'KNIGHT', position: { x: 0, z: 0 } };
		const jumps = [{ x: 2, z: 1 }, { x: 2, z: 0 }];
		expect(stubShipEnv.applyShipRules(viking, knight, jumps).moves).toEqual([{ x: 2, z: 1 }]);
		// A piece boxed in by them says so (not "nowhere to go").
		expect(stubShipEnv.noMoveShipTip(viking, rook, { refused })).toMatch(/still coming into view/);
		expect(stubShipEnv.noMoveShipTip(viking, rook, { refused: [] })).toBeNull();
		// Nothing to hold back: the list is the same.
		const clear = { activeBattle: { edition: 'viking' }, board: { cells: {} } };
		expect(stubShipEnv.applyShipRules(clear, rook, moves)).toEqual({ moves, refused: [] });
		// It asked for the chunk (which can't load here).
		await new Promise(resolve => setTimeout(resolve, 5));
		document.querySelectorAll('script[src*="viking.bundle"]').forEach(s => s.remove());
		warn.mockRestore();
	});

	test('installShipControls waits for the chunk', () => {
		const install = jest.fn();
		stubShipControls.installShipControls();
		expect(install).not.toHaveBeenCalled();
		window.__tetchesViking = { shipControls: { installShipControls: install } };
		// Once here, a later call goes straight through.
		stubShipControls.installShipControls();
		expect(install).toHaveBeenCalledTimes(1);
	});
});

describe('with the Viking chunk here', () => {
	test('the stubs forward to the real modules', () => {
		window.__tetchesViking = {
			shipRenderer: realShipRenderer, landDress: realLandDress, shipEnv: realShipEnv,
			shipControls: realShipControls, theme: realTheme,
		};
		const gs = { renderProfile: 'normal', activeBattle: { edition: 'viking', id: 'b' }, board: { cells: { '1,2': [{ type: 'ship', shipId: 's', player: 'p' }] } } };
		expect(stubLandDress.vikingLandWanted(gs)).toBe(true);
		expect(stubLandDress.vikingLandWanted(gs, () => false)).toBe(false);
		expect(stubShipEnv.SHIP_REFUSAL_TEXT.ship_rowing).toBe(realShipEnv.SHIP_REFUSAL_TEXT.ship_rowing);
		expect(stubShipEnv.shipEntryAt(gs, 1, 2)).toEqual(realShipEnv.shipEntryAt(gs, 1, 2));
		expect(stubShipRenderer.passengerPose(gs, 1, 2)).not.toBeNull();
		const ran = jest.fn();
		onVikingReady(ran);
		expect(ran).toHaveBeenCalled();
	});
});
