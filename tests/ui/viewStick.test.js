/**
 * View joystick (public/js/viewStick.js): the stick's maths.
 */

jest.mock('../../public/js/gameContext.js', () => ({ getCamera: () => null, getControls: () => null }));

const { stickVector, panDelta, turnAngles, DEAD_ZONE } = require('../../public/js/viewStick.js');

describe('stick deflection', () => {
	test('rests inside the dead zone, caps at full lean', () => {
		expect(stickVector(1, 1, 46)).toEqual({ x: 0, y: 0 });
		const far = stickVector(500, 0, 46);
		expect(far.x).toBeCloseTo(1);
		expect(far.y).toBeCloseTo(0);
		const diagonal = stickVector(400, -400, 46);
		expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
		expect(DEAD_ZONE).toBeGreaterThan(0);
	});
});

describe('Move', () => {
	const forward = { x: 0, z: -1 }; // camera looks towards -z

	test('stick up glides away from the camera, stick right to its right', () => {
		const up = panDelta({ x: 0, y: -1 }, forward, 20, 1);
		expect(up.x).toBeCloseTo(0);
		expect(up.z).toBeLessThan(0);
		const right = panDelta({ x: 1, y: 0 }, forward, 20, 1);
		expect(right.x).toBeGreaterThan(0);
		expect(right.z).toBeCloseTo(0);
	});

	test('further out, the same lean covers more ground', () => {
		const near = panDelta({ x: 0, y: -1 }, forward, 10, 1);
		const far = panDelta({ x: 0, y: -1 }, forward, 40, 1);
		expect(Math.abs(far.z)).toBeCloseTo(Math.abs(near.z) * 4);
	});
});

describe('Turn', () => {
	test('tilt stops at the camera\'s limits', () => {
		const max = Math.PI / 2 - 0.1;
		expect(turnAngles({ x: 0, y: 1 }, 0, max, max, 5).phi).toBeCloseTo(max);
		expect(turnAngles({ x: 0, y: -1 }, 0, 0.2, max, 5).phi).toBeGreaterThan(0);
	});

	test('left and right swing opposite ways', () => {
		const left = turnAngles({ x: -1, y: 0 }, 1, 1, 1.4, 0.1).theta;
		const right = turnAngles({ x: 1, y: 0 }, 1, 1, 1.4, 0.1).theta;
		expect(left).toBeGreaterThan(1);
		expect(right).toBeLessThan(1);
	});
});
