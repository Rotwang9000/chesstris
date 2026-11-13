/**
 * @jest-environment jsdom
 *
 * Viking longships: a passenger stands smaller on the deck
 * (updateChessPieces sets userData.aboard + renderScale). Selecting it
 * and letting go must keep that deck size, not blow it back up to land
 * size. Pieces on land keep exactly the old behaviour (1.12 / 1).
 */

import * as THREE from 'three';
import { setTHREE } from '../../public/js/gameContext.js';
import {
	highlightSinglePiece, clearSinglePieceHighlight, removePlayerPiecesHighlight, setChessPiecesGroup,
} from '../../public/js/pieceHighlightManager.js';

beforeAll(() => {
	setTHREE(THREE);
	global.requestAnimationFrame = () => 0;
});

function piece(userData = {}) {
	const g = new THREE.Group();
	g.userData = { type: 'chessPiece', player: 'p1', ...userData };
	return g;
}

describe('selection scale', () => {
	test('a piece on land: 1.12 selected, 1 after (unchanged)', () => {
		const p = piece();
		highlightSinglePiece(p, { mode: 'selected' });
		expect(p.scale.x).toBeCloseTo(1.12);
		clearSinglePieceHighlight(p);
		expect(p.scale.x).toBe(1);
	});

	test('a passenger keeps its deck size through select and clear', () => {
		const p = piece({ aboard: true, renderScale: 0.58 });
		p.scale.setScalar(0.58);
		highlightSinglePiece(p, { mode: 'selected' });
		expect(p.scale.x).toBeCloseTo(0.58 * 1.12);
		clearSinglePieceHighlight(p);
		expect(p.scale.x).toBeCloseTo(0.58);
	});

	test('dropping the faint player rings leaves a passenger at deck size', () => {
		const group = new THREE.Group();
		const p = piece({ aboard: true, renderScale: 0.58 });
		const q = piece();
		group.add(p, q);
		setChessPiecesGroup(group);
		p.scale.setScalar(2); q.scale.setScalar(2);
		removePlayerPiecesHighlight();
		expect(p.scale.x).toBeCloseTo(0.58);
		expect(q.scale.x).toBe(1);
	});

	test('a piece that is not aboard ignores renderScale (opponents stay as before)', () => {
		const p = piece({ aboard: false, renderScale: 0.78 });
		clearSinglePieceHighlight(p);
		expect(p.scale.x).toBe(1);
	});
});
