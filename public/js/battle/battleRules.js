/**
 * Client mirror of the server's battle-arena rules (server/battle/*).
 * Used by local placement validation and the camera so predictions
 * match what the server will decide.
 */

/** Furthest cell distance from the arena centre a seat may build on. */
export const BATTLE_PLAY_RADIUS = 14;

/**
 * Cells further than this from the origin belong to the battle-arena
 * grid (server ARENA_BASE is (2000, 2000); the organic world stays
 * within a few hundred cells of the origin). Used to keep arena cells
 * out of "fit the whole world" camera framing.
 */
export const BATTLE_REGION_MIN_DISTANCE = 1500;

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
	return Math.round(Math.sqrt(dx * dx + dz * dz)) <= BATTLE_PLAY_RADIUS;
}

/** Does this coordinate belong to the remote battle-arena region? */
export function isBattleRegionCell(x, z) {
	return Math.sqrt(x * x + z * z) >= BATTLE_REGION_MIN_DISTANCE;
}

/**
 * Everything a seated player may see: play area (≤14), ring wall
 * (15-16) plus a couple of cells of breathing room. Matches the server
 * arena geometry (`server/battle/geometry.js` RING_OUTER_RADIUS = 16).
 */
export const BATTLE_ARENA_VIEW_RADIUS = 20;

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
		return Math.sqrt(dx * dx + dz * dz) <= BATTLE_ARENA_VIEW_RADIUS;
	}
	return !isBattleRegionCell(x, z);
}
