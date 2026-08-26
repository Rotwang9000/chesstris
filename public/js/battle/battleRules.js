/**
 * Client mirror of the server's battle-arena rules (server/battle/*).
 * Used by local placement validation and the camera so predictions
 * match what the server will decide.
 */

/** Play radius of a 2-seat arena (3-4 seat arenas are larger; the
 * server sends the actual radius on the battle object). */
export const BATTLE_PLAY_RADIUS = 14;

/** Effective play radius of the local player's battle. */
export function battlePlayRadius(battle) {
	const r = Number(battle?.playRadius);
	return Number.isFinite(r) && r > 0 ? r : BATTLE_PLAY_RADIUS;
}

/**
 * Battle-arena grid — keep in lockstep with `server/battle/geometry.js`
 * (`BATTLE.ARENA_BASE` / pitch / columns / max arenas).
 *
 * The region is an AABB around that grid, NOT "anything far from the
 * origin". The live world has drifted thousands of cells from (0,0);
 * treating distance-from-origin ≥ 1500 as "arena" hid the entire
 * global board.
 */
export const BATTLE_ARENA_BASE = Object.freeze({ x: 2000, z: 2000 });
export const BATTLE_ARENA_PITCH = 64;
export const BATTLE_ARENA_GRID_COLUMNS = 8;
export const BATTLE_MAX_ARENAS = 64;
/** PLAY_RADIUS_LARGE + RING_THICKNESS + KEEP_OUT_MARGIN */
export const BATTLE_REGION_MARGIN = 20;

function battleRegionBounds() {
	const lastCol = BATTLE_ARENA_GRID_COLUMNS - 1;
	const lastRow = Math.ceil(BATTLE_MAX_ARENAS / BATTLE_ARENA_GRID_COLUMNS) - 1;
	return Object.freeze({
		minX: BATTLE_ARENA_BASE.x - BATTLE_REGION_MARGIN,
		maxX: BATTLE_ARENA_BASE.x + lastCol * BATTLE_ARENA_PITCH + BATTLE_REGION_MARGIN,
		minZ: BATTLE_ARENA_BASE.z - BATTLE_REGION_MARGIN,
		maxZ: BATTLE_ARENA_BASE.z + lastRow * BATTLE_ARENA_PITCH + BATTLE_REGION_MARGIN,
	});
}

export const BATTLE_REGION_BOUNDS = battleRegionBounds();

/** The battle the local player is currently seated in, or null. */
export function getActiveBattle(gameState) {
	return gameState?.activeBattle || null;
}

/** Is this cell item a battle-ring wall segment? */
export function isBattleRingItem(item) {
	return !!(item && item.battleRing);
}

/**
 * May the local player treat this ring item as their own ground
 * (adjacency / path-to-king)? Only while seated in that battle.
 */
export function isRingItemUsable(gameState, item) {
	if (!isBattleRingItem(item)) return false;
	const battle = getActiveBattle(gameState);
	return !!battle && String(item.battleRing) === String(battle.id);
}

/**
 * Arena-bounds prediction for a placement cell. True when the local
 * player is not in a battle, or the cell is inside their arena's play
 * area.
 */
export function isCellInsideOwnArena(gameState, x, z) {
	const battle = getActiveBattle(gameState);
	if (!battle || !battle.centre) return true;
	const dx = x - battle.centre.x;
	const dz = z - battle.centre.z;
	return Math.round(Math.sqrt(dx * dx + dz * dz)) <= battlePlayRadius(battle);
}

/** Does this coordinate belong to the remote battle-arena grid? */
export function isBattleRegionCell(x, z) {
	return x >= BATTLE_REGION_BOUNDS.minX
		&& x <= BATTLE_REGION_BOUNDS.maxX
		&& z >= BATTLE_REGION_BOUNDS.minZ
		&& z <= BATTLE_REGION_BOUNDS.maxZ;
}

/**
 * Cells of breathing room past the ring wall a seated player may see.
 * The ring spans [playRadius+1, playRadius+2] (see
 * `server/battle/geometry.js`), so the view reaches playRadius + 6.
 */
export const BATTLE_VIEW_MARGIN = 6;

/** Everything a seated player may see for their battle. */
export function battleViewRadius(battle) {
	return battlePlayRadius(battle) + BATTLE_VIEW_MARGIN;
}

/**
 * View isolation — "the edge of the game is the edge of the world".
 *
 * While seated in a battle, ONLY the own arena exists visually: the
 * global world (and other arenas) must not render. Outside a battle
 * the reverse holds: the organic world renders, battle arenas do not.
 *
 * @returns {boolean} True when the cell belongs in the current view.
 */
export function isCellVisibleInCurrentView(gameState, x, z) {
	const battle = getActiveBattle(gameState);
	if (battle && battle.centre) {
		const dx = x - battle.centre.x;
		const dz = z - battle.centre.z;
		return Math.sqrt(dx * dx + dz * dz) <= battleViewRadius(battle);
	}
	return !isBattleRegionCell(x, z);
}

/** Battle-seat player ids follow `battle-<code>-s<n>` (server seatIdFor). */
const SEAT_ID_PREFIX = 'battle-';

/**
 * Does an event involving this player belong in the local player's
 * current view? Seated in a battle: only that battle's seats (and the
 * local identity) are news. In the world view: battle seats belong to
 * remote arenas and their events are noise.
 */
export function isPlayerInCurrentView(gameState, playerId) {
	if (playerId == null) return true;
	const id = String(playerId);
	const battle = getActiveBattle(gameState);
	if (battle) {
		if (id === String(gameState?.localPlayerId || '')) return true;
		const myBattlePrefix = `${SEAT_ID_PREFIX}${String(battle.code || '').toLowerCase()}-`;
		return id.startsWith(myBattlePrefix);
	}
	return !id.startsWith(SEAT_ID_PREFIX);
}

/**
 * View filter for multi-participant events (duels, captures, activity
 * log entries). Events with no participant info always pass; otherwise
 * at least one participant must belong to the current view.
 */
export function isEventInCurrentView(gameState, participantIds) {
	const ids = (Array.isArray(participantIds) ? participantIds : [participantIds])
		.filter(v => v != null);
	if (ids.length === 0) return true;
	return ids.some(id => isPlayerInCurrentView(gameState, id));
}
