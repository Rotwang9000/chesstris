/**
 * Tetromino mesh object pool.
 *
 * Three.js BoxGeometries + MeshStandardMaterials are expensive to allocate
 * per-frame, so we keep a pool of disposed-but-cached meshes that can be
 * re-used for falling tetromino blocks.  The pool is capped to
 * `MAX_POOL_SIZE`; anything beyond that is fully disposed when returned.
 */

import { getTHREE } from '../gameContext.js';

const MAX_POOL_SIZE = 100;
const DEFAULT_PRELOAD_COUNT = 50;

const tetrominoBlocks = [];

function createBlockMesh() {
	const THREE = getTHREE();
	const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
	const material = new THREE.MeshStandardMaterial({
		color: 0x000000,
		metalness: 0.3,
		roughness: 0.7,
		transparent: false,
	});
	return new THREE.Mesh(geometry, material);
}

function getTetrominoBlock() {
	if (tetrominoBlocks.length > 0) {
		const reused = tetrominoBlocks.pop();
		reused.visible = true;
		return reused;
	}
	return createBlockMesh();
}

function returnTetrominoBlock(mesh) {
	if (!mesh) return;
	if (tetrominoBlocks.length >= MAX_POOL_SIZE) {
		if (mesh.geometry) mesh.geometry.dispose();
		if (mesh.material) mesh.material.dispose();
		return;
	}

	mesh.visible = false;
	mesh.scale.set(1, 1, 1);
	mesh.position.set(0, 0, 0);
	tetrominoBlocks.push(mesh);
}

function clearPool() {
	while (tetrominoBlocks.length > 0) {
		const mesh = tetrominoBlocks.pop();
		if (mesh.geometry) mesh.geometry.dispose();
		if (mesh.material) mesh.material.dispose();
	}
}

function preloadTetrominoBlocks(count = DEFAULT_PRELOAD_COUNT) {
	const target = Math.min(count, MAX_POOL_SIZE);
	const needed = target - tetrominoBlocks.length;
	if (needed <= 0) return 0;

	for (let i = 0; i < needed; i++) {
		const mesh = createBlockMesh();
		mesh.visible = false;
		tetrominoBlocks.push(mesh);
	}

	console.log(`[Pool] Preloaded ${needed} tetromino blocks (pool size ${tetrominoBlocks.length}/${MAX_POOL_SIZE}).`);
	return needed;
}

function getPoolSize() {
	return tetrominoBlocks.length;
}

export const tetrominoPool = {
	getTetrominoBlock,
	returnTetrominoBlock,
	clearPool,
	preloadTetrominoBlocks,
	getPoolSize,
	get tetrominoBlocks() { return tetrominoBlocks; },
	get maxPoolSize() { return MAX_POOL_SIZE; },
};

export {
	getTetrominoBlock,
	returnTetrominoBlock,
	clearPool,
	preloadTetrominoBlocks,
	getPoolSize,
	MAX_POOL_SIZE,
};
