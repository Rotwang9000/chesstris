/**
 * @jest-environment jsdom
 *
 * A painting card that can't be made (the card or woodcut throws) must
 * end its turn like a close: the queue's busy period finishes, so the
 * moments behind it keep aging, and the next one is shown.
 */

jest.mock('../../public/js/checkAlert.js', () => ({ isDefenderInCheck: () => false }));

let mockFailNext = 0;
jest.mock('../../public/js/paintings/paintingCard.js', () => {
	const real = jest.requireActual('../../public/js/paintings/paintingCard.js');
	return {
		...real,
		showPaintingCard: (opts) => {
			if (mockFailNext > 0) { mockFailNext--; throw new Error('no card today'); }
			return real.showPaintingCard(opts);
		},
	};
});

import gameState from '../../public/js/utils/gameState.js';
import * as director from '../../public/js/paintings/paintingDirector.js';
import { closePaintingCard } from '../../public/js/paintings/paintingCard.js';

const ME = 'seat_me';
const move = (id, type) => ({
	playerId: ME,
	movedPiece: { id, type, player: ME },
	movedFrom: { x: 1, z: 1 },
	movedTo: { x: 1, z: 2 },
	capturedPiece: null,
	ship: { kind: 'embark', shipId: `s-${id}` },
});

test('a card that fails to show ends its turn, and the next moment is shown', async () => {
	const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	gameState.localPlayerId = ME;
	gameState.players = { [ME]: { name: 'Guest' } };
	gameState.activeBattle = { id: 'b-fail', edition: 'viking' };
	gameState.board = { cells: {} };
	gameState.chessPieces = [];

	mockFailNext = 1;
	director.handlePaintingEvent('ship', { kind: 'embark', move: move('n1', 'KNIGHT') });
	await new Promise(resolve => setTimeout(resolve, 400));
	const { queue } = window.tetchesPaintings;
	expect(document.querySelector('#tetches-painting .tp-caption')).toBeNull();
	expect(queue.busySince).toBeNull();
	expect(warn).toHaveBeenCalledWith('[paintings] could not show a painting:', 'no card today');

	// (A new battle: each scene is painted once per battle.)
	gameState.activeBattle = { id: 'b-fail-2', edition: 'viking' };
	director.handlePaintingEvent('ship', { kind: 'embark', move: move('r1', 'ROOK') });
	await new Promise(resolve => setTimeout(resolve, 400));
	expect(document.querySelector('#tetches-painting .tp-caption').textContent)
		.toBe('Your rook steps aboard your longship');
	closePaintingCard();
	warn.mockRestore();
});
