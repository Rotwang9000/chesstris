/**
 * @jest-environment jsdom
 *
 * Phone declutter and id leaks (2026-11-19):
 *   • zoom: the orbit camera may come in to 3 units, and its near plane
 *     follows it down so a close piece isn't sliced open;
 *   • a raw player id (UUID) never reaches a toast;
 *   • Cancel Detonation lives in the turn-action stack, above messages.
 */

import { nearPlaneFor, adaptNearPlane, MIN_ORBIT_DISTANCE } from '../../public/js/cameraNear.js';
import { scrubIds, showToastMessage } from '../../public/js/showToastMessage.js';
import { displayNameOf } from '../../public/js/playerNames.js';
import { ensureActionStack } from '../../public/js/skipChessButton.js';

describe('zoom range', () => {
	test('the camera may come in closer than the old limit of 10', () => {
		expect(MIN_ORBIT_DISTANCE).toBeLessThan(8);
	});

	test('the near plane is 1 from 8 units out and shrinks to a floor below that', () => {
		expect(nearPlaneFor(40)).toBe(1);
		expect(nearPlaneFor(8)).toBe(1);
		expect(nearPlaneFor(4)).toBeCloseTo(0.5);
		expect(nearPlaneFor(MIN_ORBIT_DISTANCE)).toBeLessThan(0.5);
		expect(nearPlaneFor(0.5)).toBe(0.3);
		expect(nearPlaneFor(NaN)).toBe(1);
	});

	test('adaptNearPlane only touches the projection when the value changes', () => {
		const camera = { near: 1, position: { distanceTo: () => 3 }, updateProjectionMatrix: jest.fn() };
		const controls = { target: {} };
		adaptNearPlane(camera, controls);
		expect(camera.near).toBeCloseTo(0.375);
		expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(1);
		adaptNearPlane(camera, controls);
		expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(1);
	});
});

describe('no ids on screen', () => {
	const ID = '1117161c-f939-4c9e-ae69-74f268baaf20';

	test('scrubIds replaces a UUID and leaves other text alone', () => {
		expect(scrubIds(`Check! ${ID} has 15s to escape`)).toBe('Check! a player has 15s to escape');
		expect(scrubIds('Line cleared!')).toBe('Line cleared!');
	});

	test('a toast never shows a UUID', () => {
		showToastMessage(`Piece: KING (${ID}).`, 3000);
		expect(document.getElementById('toast-container').textContent).not.toContain(ID);
	});

	test('placeholder names are no name', () => {
		const players = { [ID]: { name: 'Player_1117161c' }, b: { name: 'Hans' } };
		expect(displayNameOf(players, ID)).toBeNull();
		expect(displayNameOf(players, 'b')).toBe('Hans');
		expect(displayNameOf(players, ID, { localId: ID, localName: 'Rotwang' })).toBe('Rotwang');
	});
});

describe('turn-action stack', () => {
	test('sits above the one-time tips (z 11700)', () => {
		const stack = ensureActionStack();
		expect(Number(stack.style.zIndex)).toBeGreaterThan(11700);
	});
});
