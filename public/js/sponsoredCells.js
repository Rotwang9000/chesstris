/**
 * Sponsored cell placements — adverts mounted on the OUTER SIDE of
 * flank cells along any run of 4+ tetromino cells.
 *
 * Decisions baked into this file (all from explicit user feedback):
 *
 *   1. Decals sit on the SIDE of the cell, NOT on top, anchored to
 *      the top edge of that side. The earlier "lying flat on top"
 *      version covered every flank cell with a giant patch.
 *
 *   2. We never paint the same sponsor on two cells within 20 cells
 *      of each other (Manhattan distance). Big multi-row runs get a
 *      varied rotation instead of a wall of one logo.
 *
 *   3. Wide-aspect creative spreads across two adjacent flank cells
 *      automatically. We pair up consecutive same-sponsor slots,
 *      split the texture UVs left/right, and charge the campaign
 *      for both cells via `recordImpression(id, 2)`.
 *
 *   4. Only `active` advertisers ever appear — they come from the
 *      same `/api/advertisers/active` list the admin queue blesses.
 */

import {
	fetchActiveSponsors,
	recordImpression,
} from '../utils/sponsors.js';

const MIN_RUN_LENGTH = 4;
const MAX_SPONSORED_PER_RUN = 4;
// Minimum Manhattan distance, in cells, between two decals carrying
// the same sponsor id. User asked for "20 cells or more". Anything
// above this and the constraint quietly relaxes so we still place
// SOMETHING on sparse boards.
const MIN_REPEAT_DISTANCE = 20;
// Aspect-ratio threshold above which we try to pair the sponsor
// across two adjacent flank cells. 1.5 is wide enough to obviously
// be a banner but doesn't trigger on near-square logos.
const WIDE_ASPECT_THRESHOLD = 1.5;

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
 * Compute candidate flank placements. Each entry records the cell
 * key plus the outward face direction the decal should sit on, plus
 * the order of the cell along the run (used to pair adjacent
 * placements for wide-aspect sponsors).
 *
 * @param {Object} boardCells — `gameState.board.cells`
 * @returns {Map<string, {face: {axis:'x'|'z', sign:-1|1}, runAxis:'x'|'z', runIndex:number, runId:string}>}
 */
export function computeSponsoredCellPlacements(boardCells) {
	const placements = new Map();
	if (!boardCells || typeof boardCells !== 'object') return placements;

	const tetraKeys = [];
	for (const key of Object.keys(boardCells)) {
		if (!isTetrominoTerrain(boardCells[key])) continue;
		tetraKeys.push(parseKey(key));
	}

	const byZ = new Map();
	for (const c of tetraKeys) {
		if (!byZ.has(c.z)) byZ.set(c.z, []);
		byZ.get(c.z).push(c);
	}
	for (const [, row] of byZ) {
		row.sort((a, b) => a.x - b.x);
		for (const run of findRuns(row, 'x')) {
			addFlankPlacements(placements, run, 'x', boardCells);
		}
	}

	const byX = new Map();
	for (const c of tetraKeys) {
		if (!byX.has(c.x)) byX.set(c.x, []);
		byX.get(c.x).push(c);
	}
	for (const [, col] of byX) {
		col.sort((a, b) => a.z - b.z);
		for (const run of findRuns(col, 'z')) {
			addFlankPlacements(placements, run, 'z', boardCells);
		}
	}

	return placements;
}

function addFlankPlacements(placements, run, runAxis, boardCells) {
	// runAxis is the axis varying ALONG the run. The flank lies on
	// the perpendicular axis. Face direction equals +/-perpAxis,
	// pointing AWAY from the run (outward).
	const perpAxis = runAxis === 'x' ? 'z' : 'x';
	const runId = `${runAxis}:${run[0].x},${run[0].z}-${run[run.length - 1].x},${run[run.length - 1].z}`;

	for (const side of [-1, 1]) {
		let placedOnThisSide = 0;
		for (let i = 0; i < run.length; i++) {
			if (placedOnThisSide >= MAX_SPONSORED_PER_RUN) break;
			const c = run[i];
			const flank = perpAxis === 'z'
				? { x: c.x, z: c.z + side }
				: { x: c.x + side, z: c.z };
			const key = cellKey(flank.x, flank.z);
			if (!boardCells[key]) continue;
			if (!isTetrominoTerrain(boardCells[key])) continue;
			if (placements.has(key)) continue;
			placements.set(key, {
				face: { axis: perpAxis, sign: side },
				runAxis,
				runIndex: i,
				runId: `${runId}:${side}`,
			});
			placedOnThisSide++;
		}
	}
}

const sponsorTextures = new Map();
const sponsorAspect = new Map();   // imageUrl -> width/height ratio (or null if unknown)
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
				const w = tex.image?.naturalWidth || tex.image?.width || 1;
				const h = tex.image?.naturalHeight || tex.image?.height || 1;
				sponsorAspect.set(imageUrl, w / Math.max(1, h));
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

function getSponsorAspect(imageUrl) {
	if (!imageUrl) return null;
	return sponsorAspect.has(imageUrl) ? sponsorAspect.get(imageUrl) : null;
}

/**
 * Configure the geometry, rotation and position of the decal so it
 * sits at the TOP of the cell's outward-facing side. UV remapping
 * supports half-image slices for wide-aspect spreads.
 *
 * @param {THREE.Mesh} decal — the plane mesh
 * @param {{axis:'x'|'z', sign:-1|1}} face — outward face direction
 * @param {'left'|'right'|'full'} slice — which slice of the texture this cell renders
 * @param {object} THREE
 */
function orientDecal(decal, face, slice, THREE) {
	// Default PlaneGeometry faces +Z (its normal vector is +Z, UV
	// 0..1 reads left-to-right when viewed from +Z). We rotate
	// around Y so the plane's normal matches the cell's outward
	// face. ANY rotation away from +Z mirrors the texture from the
	// viewer's perspective in a right-handed Y-up world, so we
	// horizontally flip the UVs for every face except +Z to keep
	// logos readable.
	const OUTWARD = 0.481;     // cell half-extent 0.47 + 2 mm
	const TOP_Y = 0.27;        // decal centre Y so its top sits at cell top
	let needsUvMirror = false;
	if (face.axis === 'z') {
		decal.position.set(0, TOP_Y, OUTWARD * face.sign);
		decal.rotation.set(0, face.sign === 1 ? 0 : Math.PI, 0);
		needsUvMirror = face.sign !== 1;
	} else {
		decal.position.set(OUTWARD * face.sign, TOP_Y, 0);
		decal.rotation.set(0, face.sign === 1 ? -Math.PI / 2 : Math.PI / 2, 0);
		needsUvMirror = true;
	}

	const geom = decal.geometry;
	const uv = geom?.attributes?.uv;
	if (!uv) return;
	let u0 = slice === 'right' ? 0.5 : 0;
	let u1 = slice === 'left' ? 0.5 : 1;
	if (needsUvMirror) {
		const swap = u0;
		u0 = 1 - u1;
		u1 = 1 - swap;
	}
	// IMPORTANT — Three.js `PlaneGeometry` actually emits vertices
	// in TOP-LEFT, TOP-RIGHT, BOTTOM-LEFT, BOTTOM-RIGHT order (not
	// BL/BR/TL/TR). Mapping V=0 to the first two vertices flipped
	// the texture upside-down. Correct mapping:
	//   vertex 0 = TL → (u, 1)
	//   vertex 1 = TR → (u, 1)
	//   vertex 2 = BL → (u, 0)
	//   vertex 3 = BR → (u, 0)
	uv.setXY(0, u0, 1);
	uv.setXY(1, u1, 1);
	uv.setXY(2, u0, 0);
	uv.setXY(3, u1, 0);
	uv.needsUpdate = true;
}

/**
 * Attach or refresh a sponsor decal on a cell mesh.
 *
 * @param {THREE.Mesh} cellMesh
 * @param {object} sponsor
 * @param {object} THREE
 * @param {object} options
 * @param {{axis:'x'|'z', sign:-1|1}} options.face — outward face of the cell
 * @param {'left'|'right'|'full'} [options.slice='full'] — UV slice
 * @param {boolean} [options.wide=false] — geometry should be 2× wider (single mesh on a paired cell)
 */
export function applySponsorDecal(cellMesh, sponsor, THREE, options = {}) {
	if (!cellMesh || !sponsor || !THREE) return;
	const imageUrl = sponsor.image || sponsor.adImage;
	if (!imageUrl) return;
	const face = options.face || { axis: 'z', sign: 1 };
	const slice = options.slice || 'full';
	// Decal width — single cell (0.92, slightly inset from the
	// 0.94-wide cell face) or twice-as-wide (1.96, exact span of
	// two cells PLUS a hair of overlap so the seam between cells
	// doesn't peek through). HEIGHT keeps the decal at the top of
	// the side rather than dominating it.
	const widthFactor = options.wide ? 1.96 : 0.92;
	const HEIGHT = 0.42;

	let decal = cellMesh.getObjectByName('sponsor-decal');
	if (!decal) {
		const geom = new THREE.PlaneGeometry(widthFactor, HEIGHT);
		const mat = new THREE.MeshBasicMaterial({
			transparent: true,
			opacity: 0.95,
			depthWrite: false,
			depthTest: true,
			// FrontSide only — the decal lives on the OUTWARD side
			// of the cell; the back side (visible from the run
			// interior) should be culled so we don't see a mirrored
			// ad from inside the build.
			side: THREE.FrontSide,
			polygonOffset: true,
			polygonOffsetFactor: -1,
			polygonOffsetUnits: -1,
		});
		decal = new THREE.Mesh(geom, mat);
		decal.name = 'sponsor-decal';
		// `renderOrder 1` keeps the decal above the cell face but
		// below pieces / falling tetrominoes (renderOrder ≥ 10).
		decal.renderOrder = 1;
		cellMesh.add(decal);
	} else if (decal.userData?.widthFactor !== widthFactor) {
		// Geometry needs to change (single → wide-pair or vice versa).
		const newGeom = new THREE.PlaneGeometry(widthFactor, HEIGHT);
		if (decal.geometry) decal.geometry.dispose();
		decal.geometry = newGeom;
	}
	decal.userData.widthFactor = widthFactor;

	orientDecal(decal, face, slice, THREE);

	// If we're the wide-pair anchor we need to shift the plane along
	// the run axis so it actually spans BOTH cells. The geometry's
	// centre stays at cell-local (0,0,0); offset by half a cell in
	// the run direction for the anchor.
	if (options.wide && options.shiftAlong) {
		const dx = options.shiftAlong.axis === 'x' ? 0.5 * options.shiftAlong.sign : 0;
		const dz = options.shiftAlong.axis === 'z' ? 0.5 * options.shiftAlong.sign : 0;
		decal.position.x += dx;
		decal.position.z += dz;
	}

	const tex = sponsorTextures.get(imageUrl) || loadSponsorTexture(THREE, imageUrl);
	if (tex && decal.material) {
		decal.material.map = tex;
		decal.material.needsUpdate = true;
		decal.visible = true;
	}
	cellMesh.userData.sponsored = true;
	cellMesh.userData.sponsorId = sponsor.id;
	cellMesh.userData.sponsor = sponsor;
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
	cellMesh.userData.sponsor = null;
}

/**
 * Pick a sponsor for each placement subject to:
 *   - sponsor must be `active` and have remaining cells;
 *   - no two cells within MIN_REPEAT_DISTANCE may carry the same sponsor id;
 *   - if a sponsor's image is wide-aspect AND the next adjacent placement
 *     on the same face is free, pair them and mark wide.
 *
 * @param {Map<string, object>} placements
 * @param {Array<object>} pool — active sponsor list from /api/advertisers/active
 * @returns {Map<string, {sponsor, slice, wide, shiftAlong}>}
 */
function assignSponsors(placements, pool) {
	const assignments = new Map();
	if (!pool || pool.length === 0) return assignments;

	// Weighted rotation index seeded by costPerCell. Highest bid
	// goes first, then we cycle.
	const sorted = pool.slice().sort((a, b) => (b.costPerCell || 0) - (a.costPerCell || 0));
	let cursor = 0;

	const keys = Array.from(placements.keys());
	// Process by run then in-run index so paired wide cells stay
	// adjacent and we can detect "next cell along the run" easily.
	keys.sort((a, b) => {
		const pa = placements.get(a);
		const pb = placements.get(b);
		if (pa.runId !== pb.runId) return pa.runId < pb.runId ? -1 : 1;
		return pa.runIndex - pb.runIndex;
	});

	function pickSponsorFor(key) {
		const placement = placements.get(key);
		const here = parseKey(key);
		// Try each sponsor starting at the cursor; skip any whose
		// existing assignment is within MIN_REPEAT_DISTANCE.
		for (let attempt = 0; attempt < sorted.length; attempt++) {
			const candidate = sorted[(cursor + attempt) % sorted.length];
			if (!candidate) continue;
			let tooClose = false;
			for (const [otherKey, asg] of assignments) {
				if (asg.sponsor.id !== candidate.id) continue;
				const o = parseKey(otherKey);
				const d = Math.abs(o.x - here.x) + Math.abs(o.z - here.z);
				if (d < MIN_REPEAT_DISTANCE) {
					tooClose = true;
					break;
				}
			}
			if (!tooClose) {
				cursor = (cursor + attempt + 1) % sorted.length;
				return candidate;
			}
		}
		return null;     // pool too small for distance constraint
	}

	for (const key of keys) {
		if (assignments.has(key)) continue;     // already filled by a wide pair
		const sponsor = pickSponsorFor(key);
		if (!sponsor) continue;

		const placement = placements.get(key);
		const aspect = getSponsorAspect(sponsor.image || sponsor.adImage);
		// Look at the next placement on the same run+side. If it's
		// free and the sponsor's image is wide, pair them up.
		const sameSideKeys = keys.filter(k => {
			const p = placements.get(k);
			return p.runId === placement.runId
				&& p.runIndex === placement.runIndex + 1
				&& !assignments.has(k);
		});
		const partner = sameSideKeys[0] || null;

		const isWide = aspect != null && aspect >= WIDE_ASPECT_THRESHOLD;
		if (isWide && !partner) {
			// User directive: "don't try and spread it over 2 cells if
			// there is only 1 on its own." Wide creatives only render
			// when a partner cell is actually available — never on a
			// solo cell. The cell stays bare; the next refresh might
			// still pair it up if neighbouring runs grow.
			continue;
		}
		if (isWide && partner) {
			// Single-mesh wide ad on the FIRST cell, spanning into
			// the partner. Partner stays mesh-less (no second decal)
			// but inherits the sponsor for clicks / impression
			// accounting. Charge campaign for 2 cells.
			const partnerPlacement = placements.get(partner);
			const shiftAxis = partnerPlacement.runAxis;
			assignments.set(key, {
				sponsor,
				slice: 'full',
				wide: true,
				shiftAlong: { axis: shiftAxis, sign: 1 },
				weight: 2,
			});
			assignments.set(partner, {
				sponsor,
				partnerOf: key,
				weight: 0,
				slice: 'partner-blank',
			});
		} else {
			assignments.set(key, { sponsor, slice: 'full', wide: false, weight: 1 });
		}
	}

	return assignments;
}

// Cells whose impressions we've already counted for this sponsor.
// Keyed by `${sponsorId}:${cellKey}` so the same cell can be re-
// counted if its sponsor changes between updates.
const impressedKeys = new Set();

/**
 * Resolve sponsor data and record impressions once per cell key.
 */
export async function refreshSponsoredCells(gameState, boardGroup, THREE) {
	if (!gameState?.board?.cells || !boardGroup || !THREE) return;
	const placements = computeSponsoredCellPlacements(gameState.board.cells);
	const pool = await fetchActiveSponsors();
	if (!pool || pool.length === 0) {
		// Strip any leftover decals when the pool empties.
		for (const child of boardGroup.children) {
			if (child?.userData?.sponsored) removeSponsorDecal(child);
		}
		gameState.sponsoredCellKeys = [];
		return;
	}

	// Make sure we have aspect info for every active sponsor before
	// assigning — otherwise wide-spread decisions will be wrong on
	// the first frame the sponsor appears.
	for (const sp of pool) {
		const url = sp.image || sp.adImage;
		if (url && !sponsorTextures.has(url) && !sponsorLoadPromises.has(url)) {
			loadSponsorTexture(THREE, url);
		}
	}

	const assignments = assignSponsors(placements, pool);
	gameState.sponsoredCellKeys = [...assignments.keys()].filter(k => {
		const a = assignments.get(k);
		return a && a.slice !== 'partner-blank';
	});

	for (const child of boardGroup.children) {
		if (!child?.userData || child.userData.type !== 'cell') continue;
		const pos = child.userData.position;
		if (!pos) continue;
		const key = cellKey(pos.x, pos.z);
		const asg = assignments.get(key);
		if (asg && asg.slice === 'partner-blank') {
			// The wide-pair partner cell renders nothing of its own
			// but should still know about the sponsor for clicks.
			if (child.userData.sponsored && child.userData.sponsorId !== asg.sponsor.id) {
				removeSponsorDecal(child);
			}
			child.userData.sponsored = true;
			child.userData.sponsorId = asg.sponsor.id;
			child.userData.sponsor = asg.sponsor;
			continue;
		}
		if (asg) {
			const placement = placements.get(key);
			applySponsorDecal(child, asg.sponsor, THREE, {
				face: placement.face,
				slice: asg.slice,
				wide: asg.wide,
				shiftAlong: asg.shiftAlong,
			});
			const impressionKey = `${asg.sponsor.id}:${key}`;
			if (asg.weight > 0 && !impressedKeys.has(impressionKey)) {
				impressedKeys.add(impressionKey);
				recordImpression(asg.sponsor.id, asg.weight);
			}
		} else if (child.userData.sponsored) {
			removeSponsorDecal(child);
		}
	}
}
