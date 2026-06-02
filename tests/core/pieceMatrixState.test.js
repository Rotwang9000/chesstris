/**
 * Unit tests for the static-pieces matrix helpers.
 *
 * These pin the freeze/thaw/bake contract the renderer relies on:
 *   - freezing bakes the transform ONCE then stops per-frame recompute;
 *   - thawing resumes recompute WITHOUT an extra bake;
 *   - the "bake if static" safety valve only recomposes a frozen object,
 *     which is what stops the classic frozen-piece failure mode.
 *
 * The helper is deliberately THREE-free, so a tiny fake Object3D (just the
 * two properties + an `updateMatrix` spy the helper touches) is a faithful
 * stand-in rather than a mock that hides behaviour.
 */

const {
	setPieceMatrixStatic,
	bakePieceMatrixIfStatic,
} = require('../../public/js/pieceMatrixState.js');

function makeFakeObject(matrixAutoUpdate = true) {
	return {
		matrixAutoUpdate,
		updateMatrixCalls: 0,
		updateMatrix() { this.updateMatrixCalls += 1; },
	};
}

describe('setPieceMatrixStatic', () => {
	it('freezes: bakes the matrix once, then disables auto-update', () => {
		const obj = makeFakeObject(true);
		setPieceMatrixStatic(obj, true);
		expect(obj.updateMatrixCalls).toBe(1);
		expect(obj.matrixAutoUpdate).toBe(false);
	});

	it('thaws: re-enables auto-update without an extra bake', () => {
		const obj = makeFakeObject(false);
		setPieceMatrixStatic(obj, false);
		expect(obj.updateMatrixCalls).toBe(0);
		expect(obj.matrixAutoUpdate).toBe(true);
	});

	it('is idempotent when re-freezing an already-frozen object', () => {
		const obj = makeFakeObject(true);
		setPieceMatrixStatic(obj, true);
		setPieceMatrixStatic(obj, true);
		expect(obj.updateMatrixCalls).toBe(2); // one bake per freeze call
		expect(obj.matrixAutoUpdate).toBe(false);
	});

	it('tolerates a null/undefined object (no throw)', () => {
		expect(() => setPieceMatrixStatic(null, true)).not.toThrow();
		expect(() => setPieceMatrixStatic(undefined, false)).not.toThrow();
	});
});

describe('bakePieceMatrixIfStatic', () => {
	it('re-bakes a frozen object so an external transform write renders', () => {
		const obj = makeFakeObject(false);
		bakePieceMatrixIfStatic(obj);
		expect(obj.updateMatrixCalls).toBe(1);
		expect(obj.matrixAutoUpdate).toBe(false); // stays frozen
	});

	it('does nothing for a dynamic object (renderer recomputes for free)', () => {
		const obj = makeFakeObject(true);
		bakePieceMatrixIfStatic(obj);
		expect(obj.updateMatrixCalls).toBe(0);
		expect(obj.matrixAutoUpdate).toBe(true);
	});

	it('tolerates a null/undefined object (no throw)', () => {
		expect(() => bakePieceMatrixIfStatic(null)).not.toThrow();
		expect(() => bakePieceMatrixIfStatic(undefined)).not.toThrow();
	});
});
