/**
 * Right-hand HUD layout (public/js/hudLayout.js): the panel-size cycle
 * and what the announcements feed carries.
 */

jest.mock('../../public/js/utils/inputMode.js', () => ({ isTouchPrimary: () => false }));
jest.mock('../../public/js/skipChessButton.js', () => ({
	ensureActionStack: () => null, positionUnderNextPiece: () => {},
}));
jest.mock('../../public/js/showToastMessage.js', () => ({ showToastMessage: () => {} }));
jest.mock('../../public/js/viewStick.js', () => ({ setViewStick: () => {} }));
jest.mock('../../public/js/activityLog.js', () => ({
	describeEvent: () => ({ icon: '', color: '', text: '', target: null }),
	flyTo: () => {},
	isLocalPlayerEvent: ev => ev.payload?.playerId === 'me',
	isEventInView: ev => !ev.payload?.elsewhere,
	onLiveActivityEvent: () => () => {},
}));

const {
	availableModes, normaliseMode, nextMode, feedAccepts, feedText,
} = require('../../public/js/hudLayout.js');

describe('panel size', () => {
	test('desktop cycles full, compact, collapsed', () => {
		expect(availableModes(false)).toEqual(['full', 'compact', 'collapsed']);
		expect(nextMode('full', false)).toBe('compact');
		expect(nextMode('compact', false)).toBe('collapsed');
		expect(nextMode('collapsed', false)).toBe('full');
	});

	test('a phone has no key legend, so no full size', () => {
		expect(normaliseMode('full', true)).toBe('compact');
		expect(nextMode('collapsed', true)).toBe('compact');
	});

	test('a junk stored value falls back to the default', () => {
		expect(normaliseMode('huge', false)).toBe('full');
		expect(normaliseMode(null, false)).toBe('full');
	});
});

describe('announcements feed', () => {
	test('carries other players\' news only', () => {
		expect(feedAccepts({ type: 'king_captured', payload: { captorId: 'a' } })).toBe(true);
		expect(feedAccepts({ type: 'king_captured', payload: { playerId: 'me' } })).toBe(false);
		expect(feedAccepts({ type: 'tetromino_placed', payload: { playerId: 'a' } })).toBe(false);
		expect(feedAccepts({ type: 'king_captured', payload: { elsewhere: true } })).toBe(false);
		expect(feedAccepts(null)).toBe(false);
	});

	test('drops board coordinates from the wording', () => {
		expect(feedText("Ann's rook (595, -22) captured by Bo")).toBe("Ann's rook captured by Bo");
	});
});
