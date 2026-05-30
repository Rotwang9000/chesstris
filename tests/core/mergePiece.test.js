/**
 * Unit tests for the PURE sub-mesh grouping logic used when collapsing a
 * chess piece's many sub-meshes into one merged mesh.
 *
 * `planMergeGroups` is intentionally THREE-free: given each source
 * geometry's material index + vertex count, it returns the concatenation
 * `order`, the geometry `groups` ({start,count,materialIndex} in VERTICES)
 * and the compacted `usedMaterialIndices`. That is the part with real
 * branching logic, so it is the part worth pinning. The geometry-baking
 * side of `mergeMeshesByMaterial` needs the live THREE CDN global (clone /
 * applyMatrix4 / toNonIndexed / BufferGeometry), which is not available in
 * Node — a faithful stub would be brittle, so it is exercised by the
 * client build + in-browser rendering instead, not mocked here.
 */

const { planMergeGroups } = require('../../public/js/chessPieceCreator/mergePiece.js');

function totalVertices(groups) {
	return groups.reduce((sum, g) => sum + g.count, 0);
}

describe('planMergeGroups', () => {
	it('produces one contiguous group per material when all three are used', () => {
		const { order, groups, usedMaterialIndices } = planMergeGroups([
			{ materialIndex: 0, vertexCount: 30 }, // primary
			{ materialIndex: 1, vertexCount: 12 }, // secondary
			{ materialIndex: 2, vertexCount: 6 },  // accent
		]);

		expect(usedMaterialIndices).toEqual([0, 1, 2]);
		expect(order).toEqual([0, 1, 2]);
		expect(groups).toEqual([
			{ start: 0, count: 30, materialIndex: 0 },
			{ start: 30, count: 12, materialIndex: 1 },
			{ start: 42, count: 6, materialIndex: 2 },
		]);
		expect(totalVertices(groups)).toBe(48);
	});

	it('buckets several sources of the same material into one contiguous group', () => {
		// Input order interleaves materials; the plan must reorder so each
		// material is one run (bucketed by ascending material index).
		const { order, groups } = planMergeGroups([
			{ materialIndex: 0, vertexCount: 9 },  // primary A
			{ materialIndex: 2, vertexCount: 3 },  // accent A
			{ materialIndex: 0, vertexCount: 6 },  // primary B
			{ materialIndex: 1, vertexCount: 12 }, // secondary
			{ materialIndex: 2, vertexCount: 3 },  // accent B
		]);

		// primary sources first (indices 0,2), then secondary (3), then accent (1,4).
		expect(order).toEqual([0, 2, 3, 1, 4]);
		expect(groups).toEqual([
			{ start: 0, count: 15, materialIndex: 0 },  // 9 + 6
			{ start: 15, count: 12, materialIndex: 1 }, // 12
			{ start: 27, count: 6, materialIndex: 2 },  // 3 + 3
		]);
	});

	it('skips unused materials and compacts the remaining indices', () => {
		// Pawn-like (primary + secondary, no accent) and rook-like
		// (primary + accent, no secondary) both compact to 0..n-1.
		const pawnLike = planMergeGroups([
			{ materialIndex: 0, vertexCount: 20 },
			{ materialIndex: 1, vertexCount: 8 },
		]);
		expect(pawnLike.usedMaterialIndices).toEqual([0, 1]);
		expect(pawnLike.groups.map(g => g.materialIndex)).toEqual([0, 1]);

		const rookLike = planMergeGroups([
			{ materialIndex: 0, vertexCount: 24 }, // body
			{ materialIndex: 2, vertexCount: 4 },  // accent merlon
			{ materialIndex: 2, vertexCount: 4 },  // accent merlon
		]);
		// Original index 2 (accent) compacts to group materialIndex 1.
		expect(rookLike.usedMaterialIndices).toEqual([0, 2]);
		expect(rookLike.groups).toEqual([
			{ start: 0, count: 24, materialIndex: 0 },
			{ start: 24, count: 8, materialIndex: 1 },
		]);
	});

	it('handles a single material as one group at index 0', () => {
		const { order, groups, usedMaterialIndices } = planMergeGroups([
			{ materialIndex: 0, vertexCount: 15 },
			{ materialIndex: 0, vertexCount: 15 },
		]);
		expect(usedMaterialIndices).toEqual([0]);
		expect(order).toEqual([0, 1]);
		expect(groups).toEqual([{ start: 0, count: 30, materialIndex: 0 }]);
	});

	it('keeps groups contiguous and covering the whole draw range', () => {
		const sources = [
			{ materialIndex: 2, vertexCount: 7 },
			{ materialIndex: 0, vertexCount: 11 },
			{ materialIndex: 1, vertexCount: 5 },
			{ materialIndex: 0, vertexCount: 13 },
		];
		const { order, groups } = planMergeGroups(sources);

		// Every source placed exactly once.
		expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);

		// Contiguous, starting at 0.
		let expectedStart = 0;
		for (const group of groups) {
			expect(group.start).toBe(expectedStart);
			expectedStart += group.count;
		}
		// Full coverage.
		const total = sources.reduce((s, x) => s + x.vertexCount, 0);
		expect(expectedStart).toBe(total);
		expect(totalVertices(groups)).toBe(total);
	});

	it('throws on invalid input', () => {
		expect(() => planMergeGroups([])).toThrow();
		expect(() => planMergeGroups('nope')).toThrow();
		expect(() => planMergeGroups([{ materialIndex: -1, vertexCount: 3 }])).toThrow();
		expect(() => planMergeGroups([{ materialIndex: 1.5, vertexCount: 3 }])).toThrow();
		expect(() => planMergeGroups([{ materialIndex: 0, vertexCount: 0 }])).toThrow();
		expect(() => planMergeGroups([{ materialIndex: 0, vertexCount: -3 }])).toThrow();
	});
});
