/**
 * "Why didn't that line clear?" — home squares don't count.
 *
 * A line clears with 8 tetromino squares in a row (server/game/
 * BoardManager.js _findClearableLines). Home squares (and ex-home
 * terrain, and a degraded home's remnants) are treated as gaps: they
 * break the run. On the board that is easy to miss: a row of 9 land
 * squares with one home square in it looks complete and stays put.
 *
 * After each of our own placements we look along the row and column
 * of every square just placed. When the land there runs 8 or more but
 * only home squares stop it from counting, those home squares pulse
 * and (the first few times on this device) a tip says why.
 *
 * `findHomeBlockedLines` is the pure part, mirroring the server rule;
 * `noteOwnPlacement` is the effect.
 */

export const LINE_LENGTH = 8;
const TIP_KEY = 'tetches.hint.homeLines';
const TIP_LIMIT = 3;
const TIP_GAP_MS = 90 * 1000;

function items(cell) {
	if (Array.isArray(cell)) return cell.filter(Boolean);
	if (cell && typeof cell === 'object') return [cell];
	return [];
}

/**
 * How a square counts toward a line:
 *   'count' — tetromino land that a clear would remove;
 *   'home'  — land that breaks the run because it is home (a home
 *             marker, ex-home terrain, or a degraded home's remnant);
 *   'wall'  — anything else that breaks it (a battle ring, a pawn
 *             awaiting promotion), or empty water.
 */
export function lineRole(cell) {
	const list = items(cell);
	if (list.length === 0) return 'wall';
	let land = false;
	let counts = false;
	for (const item of list) {
		if (item.battleRing) return 'wall';
		if (item.type === 'chess' && item.awaitingPromotion === true) return 'wall';
		if (item.type === 'home') return 'home';
		if (item.type === 'tetromino') {
			land = true;
			if (item.fromHomeZone !== true) counts = true;
		}
	}
	if (counts) return 'count';
	return land ? 'home' : 'wall';
}

/**
 * The lines through `placed` that would have cleared but for home
 * squares: land runs LINE_LENGTH or more, has home squares in it, and
 * no stretch between them reaches LINE_LENGTH on its own.
 *
 * @param {(x:number, z:number) => any} getCell  board lookup (after the placement)
 * @param {Array<{x:number,z:number}>} placed    the squares just placed
 * @param {number} [length]
 * @returns {Array<{axis:'row'|'col', index:number, land:number, home:Array<{x:number,z:number}>}>}
 */
export function findHomeBlockedLines(getCell, placed, length = LINE_LENGTH) {
	const out = [];
	const seen = new Set();
	const placedKeys = new Set((placed || []).map(p => `${p.x},${p.z}`));
	const role = (x, z) => (placedKeys.has(`${x},${z}`) && lineRole(getCell(x, z)) === 'wall')
		? 'count'   // the board may not show our piece yet
		: lineRole(getCell(x, z));
	for (const p of placed || []) {
		for (const axis of ['row', 'col']) {
			const at = (s) => (axis === 'row' ? [s, p.z] : [p.x, s]);
			const start = axis === 'row' ? p.x : p.z;
			let lo = start;
			let hi = start;
			const limit = 64;   // a line never needs more than this to judge
			while (start - lo < limit && role(...at(lo - 1)) !== 'wall') lo--;
			while (hi - start < limit && role(...at(hi + 1)) !== 'wall') hi++;
			const key = `${axis}:${axis === 'row' ? p.z : p.x}:${lo}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const land = hi - lo + 1;
			if (land < length) continue;
			const home = [];
			let run = 0;
			let best = 0;
			for (let s = lo; s <= hi; s++) {
				const [x, z] = at(s);
				if (role(x, z) === 'home') {
					home.push({ x, z });
					run = 0;
				} else {
					run++;
					if (run > best) best = run;
				}
			}
			if (home.length === 0 || best >= length) continue;
			out.push({ axis, index: axis === 'row' ? p.z : p.x, land, home });
		}
	}
	return out;
}

/** The squares a tetromino covers, from its shape and position. */
export function placedSquares(tetromino) {
	const shape = tetromino && tetromino.shape;
	const pos = tetromino && tetromino.position;
	if (!Array.isArray(shape) || !pos) return [];
	const out = [];
	for (let z = 0; z < shape.length; z++) {
		const row = shape[z] || [];
		for (let x = 0; x < row.length; x++) {
			if (row[x] === 1) out.push({ x: pos.x + x, z: pos.z + z });
		}
	}
	return out;
}

/** May the tip show now? (the first TIP_LIMIT times on this device, spaced out) */
export function tipDue(record, now) {
	const r = record && typeof record === 'object' ? record : {};
	const count = Number(r.count) || 0;
	const at = Number(r.at) || 0;
	return count < TIP_LIMIT && now - at >= TIP_GAP_MS;
}

function readTipRecord() {
	try { return JSON.parse(localStorage.getItem(TIP_KEY) || '{}') || {}; } catch (_e) { return {}; }
}
function writeTipRecord(r) {
	try { localStorage.setItem(TIP_KEY, JSON.stringify(r)); } catch (_e) { /* best-effort */ }
}

/** The tip's words, in the edition's voice. */
export function homeLineTip(viking) {
	return viking
		? 'Hall floor doesn\'t count toward a line: the flagstones of a home row break it. Lay 8 squares of new land in a row.'
		: 'Home squares don\'t count toward a line: the striped home squares break it. Lay 8 tetromino squares in a row.';
}

/**
 * After our own placement is accepted: pulse the home squares that
 * stopped a line, and explain once in a while.
 *
 * @param {Object} gameState
 * @param {Object} tetromino   the piece as sent (shape + position)
 * @param {Object} deps        { pulse(squares, gameState), toast(text, opts), viking: boolean }
 * @returns {Array} the blocked lines found (for tests)
 */
export function noteOwnPlacement(gameState, tetromino, deps = {}) {
	const cells = gameState?.board?.cells;
	if (!cells) return [];
	const blocked = findHomeBlockedLines((x, z) => cells[`${x},${z}`], placedSquares(tetromino));
	if (blocked.length === 0) return blocked;
	const squares = [];
	const keys = new Set();
	for (const line of blocked) {
		for (const sq of line.home) {
			const k = `${sq.x},${sq.z}`;
			if (keys.has(k)) continue;
			keys.add(k);
			squares.push(sq);
		}
	}
	try { if (typeof deps.pulse === 'function') deps.pulse(squares, gameState); } catch (_e) { /* best-effort */ }
	const now = Date.now();
	const record = readTipRecord();
	if (tipDue(record, now) && typeof deps.toast === 'function') {
		writeTipRecord({ count: (Number(record.count) || 0) + 1, at: now });
		try { deps.toast(homeLineTip(!!deps.viking), { duration: 6500 }); } catch (_e) { /* best-effort */ }
	}
	return blocked;
}
