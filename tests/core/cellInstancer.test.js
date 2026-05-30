/**
 * Unit tests for the instanced terrain-cell renderer.
 *
 * The instancer collapses ~900 plain cell meshes into one InstancedMesh.
 * These tests pin the contract `renderBoard` and `chessInteraction` rely
 * on: a full-rebuild populates the instance buffers and `count`, the
 * `instanceId → {x,z}` lookup stays in lock-step (needed for click
 * raycasting), the buffer grows past its initial capacity, and a rebuild
 * with fewer/zero cells shrinks `count` without leaking instances.
 *
 * THREE is mocked (the module takes it as a parameter — no import-time
 * coupling), so we can assert behaviour without a real WebGL context.
 */

const { createCellInstancer } = require('../../public/js/boardFunctions/cellInstancer.js');

function makeThreeMock() {
	class Matrix4 {
		constructor() { this.t = [0, 0, 0]; }
		makeTranslation(x, y, z) { this.t = [x, y, z]; return this; }
	}
	class Color {
		constructor() { this.hex = 0; }
		setHex(h) { this.hex = h; return this; }
		toArray(arr, off) { arr[off] = this.hex; }
	}
	class MeshStandardMaterial {
		constructor(opts) { Object.assign(this, opts); this.disposed = false; }
		dispose() { this.disposed = true; }
	}
	class InstancedMesh {
		constructor(geometry, material, capacity) {
			this.geometry = geometry;
			this.material = material;
			this.capacity = capacity;
			this.count = 0;
			this.matrices = new Array(capacity).fill(null);
			this.instanceMatrix = { needsUpdate: false, setUsage: jest.fn() };
			this.instanceColor = null;
			this.userData = {};
			this.visible = true;
			this.disposed = false;
		}
		setMatrixAt(i, m) { this.matrices[i] = m.t.slice(); }
		setColorAt(i, c) {
			if (!this.instanceColor) {
				this.instanceColor = { array: new Array(this.capacity * 3).fill(0), needsUpdate: false };
			}
			c.toArray(this.instanceColor.array, i * 3);
		}
		dispose() { this.disposed = true; }
	}
	return {
		Matrix4, Color, MeshStandardMaterial, InstancedMesh,
		DynamicDrawUsage: 'dynamic',
	};
}

function makeBoardGroup() {
	return {
		children: [],
		add(o) { this.children.push(o); },
		remove(o) { this.children = this.children.filter((c) => c !== o); },
	};
}

function makeCells(n, base = 0) {
	const cells = [];
	for (let i = 0; i < n; i++) {
		cells.push({
			pos: { x: base + i, z: base + i * 2 },
			absX: (base + i) * 0.95,
			absZ: (base + i * 2) * 0.95,
			color: 0x100000 + i,
		});
	}
	return cells;
}

describe('cellInstancer', () => {
	let THREE;
	let boardGroup;
	let geometry;

	beforeEach(() => {
		THREE = makeThreeMock();
		boardGroup = makeBoardGroup();
		geometry = { isGeometry: true };
	});

	it('adds a single instanced mesh tagged for raycast/cull filtering', () => {
		const inst = createCellInstancer(THREE, boardGroup, geometry);
		inst.rebuild(makeCells(3));
		const mesh = inst.getMesh();
		expect(mesh).toBeTruthy();
		expect(boardGroup.children).toContain(mesh);
		expect(mesh.userData.type).toBe('instancedCells');
		// Never per-object frustum culled — its instances span the board.
		expect(mesh.frustumCulled).toBe(false);
		// Shared geometry is reused, not cloned.
		expect(mesh.geometry).toBe(geometry);
	});

	it('writes one instance per cell and reports the right count', () => {
		const inst = createCellInstancer(THREE, boardGroup, geometry);
		const cells = makeCells(5);
		inst.rebuild(cells);
		const mesh = inst.getMesh();
		expect(mesh.count).toBe(5);
		expect(mesh.instanceMatrix.needsUpdate).toBe(true);
		expect(mesh.instanceColor.needsUpdate).toBe(true);
		// Matrix translation matches the supplied absolute position.
		expect(mesh.matrices[0]).toEqual([cells[0].absX, 0, cells[0].absZ]);
		expect(mesh.matrices[4]).toEqual([cells[4].absX, 0, cells[4].absZ]);
	});

	it('maps instanceId back to board coordinates for click raycasting', () => {
		const inst = createCellInstancer(THREE, boardGroup, geometry);
		const cells = makeCells(4, 10);
		inst.rebuild(cells);
		expect(inst.lookupCell(0)).toEqual(cells[0].pos);
		expect(inst.lookupCell(3)).toEqual(cells[3].pos);
		// Out-of-range / invalid ids are safely null.
		expect(inst.lookupCell(4)).toBeNull();
		expect(inst.lookupCell(-1)).toBeNull();
		expect(inst.lookupCell(null)).toBeNull();
		expect(inst.lookupCell(undefined)).toBeNull();
	});

	it('grows the buffer beyond the initial capacity without losing cells', () => {
		const inst = createCellInstancer(THREE, boardGroup, geometry);
		// 1500 > DEFAULT_CAPACITY (1024) forces a re-allocation.
		const cells = makeCells(1500);
		inst.rebuild(cells);
		const mesh = inst.getMesh();
		expect(mesh.capacity).toBeGreaterThanOrEqual(1500);
		expect(mesh.count).toBe(1500);
		expect(inst.lookupCell(1499)).toEqual(cells[1499].pos);
		// Exactly one live instanced mesh in the group after the grow
		// (the old, smaller mesh was removed + disposed).
		const liveMeshes = boardGroup.children.filter((c) => c.userData && c.userData.type === 'instancedCells');
		expect(liveMeshes.length).toBe(1);
	});

	it('shrinks count and clears the lookup when rebuilt with fewer/zero cells', () => {
		const inst = createCellInstancer(THREE, boardGroup, geometry);
		inst.rebuild(makeCells(6));
		inst.rebuild(makeCells(2));
		expect(inst.getMesh().count).toBe(2);
		expect(inst.lookupCell(5)).toBeNull();

		inst.rebuild([]);
		expect(inst.getMesh().count).toBe(0);
		expect(inst.lookupCell(0)).toBeNull();
	});

	it('mirrors the instanceId->cell map onto mesh.userData for raycasting', () => {
		const inst = createCellInstancer(THREE, boardGroup, geometry);
		const cells = makeCells(3, 7);
		inst.rebuild(cells);
		const mesh = inst.getMesh();
		// chessInteraction reads the map straight off the hit object, so it
		// must live on userData and match the lookup.
		expect(mesh.userData.cellAt).toBeTruthy();
		expect(mesh.userData.cellAt[0]).toEqual(cells[0].pos);
		expect(mesh.userData.cellAt[2]).toEqual(cells[2].pos);
		expect(mesh.userData.cellAt[0]).toEqual(inst.lookupCell(0));
	});

	it('applies transparent bucket material options (the ex-home bucket)', () => {
		const inst = createCellInstancer(THREE, boardGroup, geometry, {
			name: 'instancedCellsExhome', transparent: true, opacity: 0.72, metalness: 0.05,
		});
		inst.rebuild(makeCells(2));
		const mesh = inst.getMesh();
		expect(mesh.name).toBe('instancedCellsExhome');
		expect(mesh.material.transparent).toBe(true);
		expect(mesh.material.opacity).toBeCloseTo(0.72);
		expect(mesh.material.metalness).toBeCloseTo(0.05);
		// Still tagged as instanced terrain for the cull/raycast filters.
		expect(mesh.userData.type).toBe('instancedCells');
	});

	it('disposes the mesh + material and detaches from the group', () => {
		const inst = createCellInstancer(THREE, boardGroup, geometry);
		inst.rebuild(makeCells(3));
		const mesh = inst.getMesh();
		const material = mesh.material;
		inst.dispose();
		expect(mesh.disposed).toBe(true);
		expect(material.disposed).toBe(true);
		expect(boardGroup.children).not.toContain(mesh);
		expect(inst.getMesh()).toBeNull();
	});
});
