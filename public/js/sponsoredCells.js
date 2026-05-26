/**
 * Sponsored cell placements — adverts on board cells when a run of
 * four or more tetromino cells exists, applied along the flank of
 * that run (one cell outboard on each long side).
 */

import { fetchNextSponsor, recordImpression } from '../utils/sponsors.js';

const MIN_RUN_LENGTH = 4;
const MAX_SPONSORED_PER_RUN = 4;

let cachedSponsor = null;
let cacheAt = 0;
const CACHE_MS = 8000;
const impressedKeys = new Set();

function cellKey(x, z) {
	return `${x},${z}`;
}

function parseKey(key) {
	const idx = key.indexOf(',');
	return { x: Number(key.slice(0, idx)), z: Number(key.slice(idx + 1)) };
}

function isTetrominoTerrain(cellData) {
	if (!Array.isArray(cellData)) return false;
	return cellData.some(item =>
		item && item.type === 'tetromino' && item.fromHomeZone !== true
	);
}

async function ensureSponsor() {
	if (cachedSponsor && (Date.now() - cacheAt) < CACHE_MS) return cachedSponsor;
	const sponsor = await fetchNextSponsor();
	if (sponsor) {
		cachedSponsor = sponsor;
		cacheAt = Date.now();
	}
	return cachedSponsor;
}

/**
 * Find maximal consecutive runs along one axis.
 * @param {Array<{x:number,z:number}>} coords sorted by the varying axis
 * @param {'x'|'z'} axis
 */
function findRuns(coords, axis) {
	const runs = [];
	if (coords.length === 0) return runs;
	let start = 0;
	for (let i = 1; i <= coords.length; i++) {
		const prev = coords[i - 1];
		const cur = coords[i];
		const varied = axis === 'x' ? 'x' : 'z';
		if (!cur || cur[varied] !== prev[varied] + 1) {
			if (i - start >= MIN_RUN_LENGTH) runs.push(coords.slice(start, i));
			start = i;
		}
	}
	return runs;
}

/**
 * Cells that qualify for a sponsor decal: flank cells one step
 * perpendicular to a run of ≥4 tetromino cells.
 *
 * @param {Object} boardCells — `gameState.board.cells`
 * @returns {Map<string, object>} key → sponsor payload
 */
export function computeSponsoredCellPlacements(boardCells) {
	const placements = new Map();
	if (!boardCells || typeof boardCells !== 'object') return placements;

	const tetraKeys = [];
	for (const key of Object.keys(boardCells)) {
		if (!isTetrominoTerrain(boardCells[key])) continue;
		tetraKeys.push(parseKey(key));
	}

	// Horizontal runs (fixed z, consecutive x)
	const byZ = new Map();
	for (const c of tetraKeys) {
		if (!byZ.has(c.z)) byZ.set(c.z, []);
		byZ.get(c.z).push(c);
	}
	for (const [, row] of byZ) {
		row.sort((a, b) => a.x - b.x);
		for (const run of findRuns(row, 'x')) {
			addFlankPlacements(placements, run, 'z', boardCells);
		}
	}

	// Vertical runs (fixed x, consecutive z)
	const byX = new Map();
	for (const c of tetraKeys) {
		if (!byX.has(c.x)) byX.set(c.x, []);
		byX.get(c.x).push(c);
	}
	for (const [, col] of byX) {
		col.sort((a, b) => a.z - b.z);
		for (const run of findRuns(col, 'z')) {
			addFlankPlacements(placements, run, 'x', boardCells);
		}
	}

	return placements;
}

function addFlankPlacements(placements, run, perpAxis, boardCells) {
	const mid = run[Math.floor(run.length / 2)];
	for (const side of [-1, 1]) {
		let added = 0;
		for (const c of run) {
			if (added >= MAX_SPONSORED_PER_RUN) break;
			const flank = perpAxis === 'z'
				? { x: c.x, z: c.z + side }
				: { x: c.x + side, z: c.z };
			const key = cellKey(flank.x, flank.z);
			if (!boardCells[key]) continue;
			if (!isTetrominoTerrain(boardCells[key])) continue;
			placements.set(key, true);
			added++;
		}
		// If no flank cells exist, sponsor the run end caps instead.
		if (added === 0 && run.length >= MIN_RUN_LENGTH) {
			const caps = [run[0], run[run.length - 1]];
			for (const c of caps) {
				placements.set(cellKey(c.x, c.z), true);
			}
		}
		void mid;
	}
}

const sponsorTextures = new Map();
const sponsorLoadPromises = new Map();

function loadSponsorTexture(THREE, imageUrl) {
	if (!imageUrl) return null;
	if (sponsorTextures.has(imageUrl)) return sponsorTextures.get(imageUrl);
	if (sponsorLoadPromises.has(imageUrl)) return null;

	const loader = new THREE.TextureLoader();
	const promise = new Promise((resolve) => {
		loader.load(
			imageUrl,
			(tex) => {
				tex.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
				sponsorTextures.set(imageUrl, tex);
				sponsorLoadPromises.delete(imageUrl);
				resolve(tex);
			},
			undefined,
			() => {
				sponsorLoadPromises.delete(imageUrl);
				resolve(null);
			}
		);
	});
	sponsorLoadPromises.set(imageUrl, promise);
	return null;
}

/**
 * Attach or refresh a sponsor decal on a cell mesh.
 */
export function applySponsorDecal(cellMesh, sponsor, THREE) {
	if (!cellMesh || !sponsor || !THREE) return;
	const imageUrl = sponsor.image || sponsor.adImage;
	if (!imageUrl) return;

	let decal = cellMesh.getObjectByName('sponsor-decal');
	if (!decal) {
		const geom = new THREE.PlaneGeometry(0.88, 0.88);
		const mat = new THREE.MeshBasicMaterial({
			transparent: true,
			opacity: 0.92,
			depthWrite: false,
		});
		decal = new THREE.Mesh(geom, mat);
		decal.name = 'sponsor-decal';
		decal.position.set(0, 0.48, 0.47);
		decal.renderOrder = 5;
		cellMesh.add(decal);
	}

	const tex = sponsorTextures.get(imageUrl) || loadSponsorTexture(THREE, imageUrl);
	if (tex && decal.material) {
		decal.material.map = tex;
		decal.material.needsUpdate = true;
		decal.visible = true;
	}
	cellMesh.userData.sponsored = true;
	cellMesh.userData.sponsorId = sponsor.id;
}

export function removeSponsorDecal(cellMesh) {
	if (!cellMesh) return;
	const decal = cellMesh.getObjectByName('sponsor-decal');
	if (decal) {
		cellMesh.remove(decal);
		if (decal.geometry) decal.geometry.dispose();
		if (decal.material) decal.material.dispose();
	}
	cellMesh.userData.sponsored = false;
	cellMesh.userData.sponsorId = null;
}

/**
 * Resolve sponsor data and record impressions once per cell key.
 */
export async function refreshSponsoredCells(gameState, boardGroup, THREE) {
	if (!gameState?.board?.cells || !boardGroup || !THREE) return;
	const placements = computeSponsoredCellPlacements(gameState.board.cells);
	const sponsor = await ensureSponsor();
	if (!sponsor) return;

	gameState.sponsoredCellKeys = [...placements.keys()];

	for (const child of boardGroup.children) {
		if (!child?.userData || child.userData.type !== 'cell') continue;
		const pos = child.userData.position;
		if (!pos) continue;
		const key = cellKey(pos.x, pos.z);
		if (placements.has(key)) {
			applySponsorDecal(child, sponsor, THREE);
			if (!impressedKeys.has(key) && sponsor.id) {
				impressedKeys.add(key);
				recordImpression(sponsor.id);
			}
		} else if (child.userData.sponsored) {
			removeSponsorDecal(child);
		}
	}
}
