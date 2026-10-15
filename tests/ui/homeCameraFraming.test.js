/**
 * @jest-environment jsdom
 */
/**
 * Home-view camera framing (public/js/setupCamera.js → moveToPlayerZone).
 *
 * A newcomer's first tetromino waits in the air, a few cells in front of
 * the king at height 10, until their first key press. Aimed at the
 * king's feet the camera pitched down so far that the piece sat above
 * the top edge of the screen. These tests lock in the aim point ahead of
 * and above the king, the portrait pull-back, and the sideways pan
 * toward a waiting piece.
 */

jest.mock('../../public/js/boardFunctions.js', () => ({
	boardFunctions: {
		getPlayersKing: (gameState, playerId) => gameState.kings?.[playerId] || null,
	},
}));

import { moveToPlayerZone } from '../../public/js/setupCamera.js';

function makeCamera(aspect = 16 / 9) {
	return {
		aspect,
		position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
	};
}

function makeControls() {
	return {
		target: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
		update: jest.fn(),
	};
}

function gameStateWithKing(orientation, extra = {}) {
	return {
		localPlayerId: 'me',
		board: { centreMarker: { x: 0, z: 0 }, cells: {} },
		kings: { me: { position: { x: 10, z: 20 }, orientation } },
		...extra,
	};
}

describe('moveToPlayerZone home framing', () => {
	test('sits behind the king and aims ahead of and above it', () => {
		const camera = makeCamera();
		const controls = makeControls();
		// Orientation 0 faces +z, so "behind" is -z.
		expect(moveToPlayerZone(camera, controls, gameStateWithKing(0), null, null, false, true)).toBe(true);
		expect(camera.position.x).toBeCloseTo(10);
		expect(camera.position.z).toBeCloseTo(4);
		expect(controls.target.x).toBeCloseTo(10);
		expect(controls.target.z).toBeGreaterThan(20);
		expect(controls.target.y).toBeGreaterThan(0);
	});

	test('uses the king facing for every orientation', () => {
		const behind = { 0: [0, -1], 1: [-1, 0], 2: [0, 1], 3: [1, 0] };
		for (const [orientation, [bx, bz]] of Object.entries(behind)) {
			const camera = makeCamera();
			const controls = makeControls();
			moveToPlayerZone(camera, controls, gameStateWithKing(Number(orientation)), null, null, false, true);
			expect(Math.sign(Math.round(camera.position.x - 10))).toBe(bx);
			expect(Math.sign(Math.round(camera.position.z - 20))).toBe(bz);
			// The aim point is on the opposite side of the king.
			expect(Math.sign(Math.round(controls.target.x - 10))).toBe(-bx || 0);
			expect(Math.sign(Math.round(controls.target.z - 20))).toBe(-bz || 0);
		}
	});

	test('a waiting tetromino projects inside the vertical field of view', () => {
		const camera = makeCamera();
		const controls = makeControls();
		moveToPlayerZone(camera, controls, gameStateWithKing(0), null, null, false, true);
		// Pitch from camera to a block 3 cells ahead of the king at height
		// 10, compared with the pitch of the view's centre line.
		const pitch = (p) => Math.atan2(p.y - camera.position.y, Math.hypot(p.x - camera.position.x, p.z - camera.position.z));
		const centre = pitch(controls.target);
		const piece = pitch({ x: 10, y: 10, z: 23 });
		const king = pitch({ x: 10, y: 0, z: 20 });
		const halfFov = (50 / 2) * Math.PI / 180;
		expect(Math.abs(piece - centre)).toBeLessThan(halfFov);
		expect(Math.abs(king - centre)).toBeLessThan(halfFov);
	});

	test('backs off on a tall, narrow (portrait) screen', () => {
		const wide = makeCamera(16 / 9);
		const tall = makeCamera(390 / 844);
		moveToPlayerZone(wide, makeControls(), gameStateWithKing(0), null, null, false, true);
		moveToPlayerZone(tall, makeControls(), gameStateWithKing(0), null, null, false, true);
		expect(20 - tall.position.z).toBeGreaterThan(20 - wide.position.z);
		expect(tall.position.y).toBeGreaterThan(wide.position.y);
	});

	test('pans halfway toward a waiting piece beside the king', () => {
		const camera = makeCamera();
		const controls = makeControls();
		const gameState = gameStateWithKing(0, {
			// 1×4 I-piece whose centre is 6 cells to the king's side.
			currentTetromino: { position: { x: 4.5, z: 22 }, shape: [[1], [1], [1], [1]], heightAboveBoard: 10 },
		});
		moveToPlayerZone(camera, controls, gameState, null, null, false, true);
		expect(camera.position.x).toBeCloseTo(7.25);
		expect(controls.target.x).toBeCloseTo(7.25);
	});

	test('ignores a landed piece and other players\' kingdoms', () => {
		const landed = gameStateWithKing(0, {
			currentTetromino: { position: { x: 0, z: 22 }, shape: [[1]], heightAboveBoard: 0 },
		});
		const camera = makeCamera();
		moveToPlayerZone(camera, makeControls(), landed, null, null, false, true);
		expect(camera.position.x).toBeCloseTo(10);

		const other = gameStateWithKing(0, {
			kings: { me: { position: { x: 10, z: 20 }, orientation: 0 }, them: { position: { x: 50, z: 50 }, orientation: 0 } },
			currentTetromino: { position: { x: 0, z: 22 }, shape: [[1]], heightAboveBoard: 10 },
		});
		const camera2 = makeCamera();
		moveToPlayerZone(camera2, makeControls(), other, null, null, false, true, null, 'them');
		expect(camera2.position.x).toBeCloseTo(50);
	});
});
