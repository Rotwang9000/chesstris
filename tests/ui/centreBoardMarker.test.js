/**
 * Centre-marker client logic.
 *
 * The marker is the render-space origin: every mesh is placed at
 * `boardCoord + marker`, so it must stay pinned even when board bounds
 * inflate (e.g. a battle arena spawning thousands of cells away). These
 * tests lock in the fixed (0,0) fallback that replaced the old
 * bounds-midpoint guess.
 */

import {
	findBoardCentreMarker,
	preserveCentreMarker,
} from '../../public/js/centreBoardMarker.js';

describe('findBoardCentreMarker', () => {
	test('returns the server-pinned board.centreMarker when present', () => {
		const gameState = { board: { centreMarker: { x: 0, z: 0 }, cells: {} } };
		expect(findBoardCentreMarker(gameState)).toEqual({ x: 0, z: 0 });
	});

	test('falls back to (0,0) — NOT a bounds midpoint — when no marker exists', () => {
		const gameState = {
			board: { cells: {} },
			// Bounds inflated by a remote battle arena; the old code would
			// have returned the midpoint (~(1120, 1036)) and teleported the
			// rendered world out from under the camera.
			boardBounds: { minX: 0, maxX: 2240, minZ: 0, maxZ: 2072 },
		};
		expect(findBoardCentreMarker(gameState)).toEqual({ x: 0, z: 0 });
	});

	test('still honours a legacy marker cell when the board property is missing', () => {
		const gameState = {
			board: {
				cells: {
					'4,7': [{ type: 'specialMarker', isCentreMarker: true }],
				},
			},
		};
		expect(findBoardCentreMarker(gameState)).toEqual({ x: 4, z: 7 });
	});
});

describe('preserveCentreMarker', () => {
	test('adopts the marker carried on incoming board data', () => {
		const gameState = { board: { centreMarker: { x: 0, z: 0 }, cells: {} } };
		const newBoardData = { centreMarker: { x: 0, z: 0 }, cells: {} };
		expect(preserveCentreMarker(gameState, newBoardData)).toEqual({ x: 0, z: 0 });
	});

	test('carries the current marker onto board data that lacks one', () => {
		const gameState = { board: { centreMarker: { x: 0, z: 0 }, cells: {} } };
		const newBoardData = { cells: { '1,1': [{ type: 'tetromino' }] } };
		const marker = preserveCentreMarker(gameState, newBoardData);
		expect(marker).toEqual({ x: 0, z: 0 });
		expect(newBoardData.centreMarker).toEqual({ x: 0, z: 0 });
	});

	test('does NOT inject a phantom marker cell into the new board data', () => {
		const gameState = { board: { centreMarker: { x: 0, z: 0 }, cells: {} } };
		const newBoardData = { cells: {} };
		preserveCentreMarker(gameState, newBoardData);
		// Board-level property only; a marker-only cell would render as a
		// floating tile in open sea.
		expect(newBoardData.cells['0,0']).toBeUndefined();
		expect(Object.keys(newBoardData.cells)).toHaveLength(0);
	});

	test('defaults to (0,0) when neither side has a marker, whatever the bounds', () => {
		const gameState = {
			board: { cells: {} },
			boardBounds: { minX: -6, maxX: 2226, minZ: -51, maxZ: 2121 },
		};
		const newBoardData = { cells: {} };
		expect(preserveCentreMarker(gameState, newBoardData)).toEqual({ x: 0, z: 0 });
		expect(newBoardData.centreMarker).toEqual({ x: 0, z: 0 });
	});
});
