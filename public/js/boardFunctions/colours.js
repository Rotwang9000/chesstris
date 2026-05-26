/**
 * Player-aware colour resolver.
 *
 * Three distinct visual contexts ask for a colour:
 *   - 'home'     — home zone tiles
 *   - 'tetromino' — falling/placed tetromino blocks
 *   - 'chess'    — chess pieces (default)
 *
 * The local player always gets the same warm wood tones; remote
 * players are hashed onto a stable blue/green hue. Retro mode swaps
 * everything to a green/amber CRT palette.
 */

const LOCAL_PALETTE = Object.freeze({
	home: 0xC4A265,
	tetromino: 0xDEB887,
	chess: 0xC4A265,
});

const RETRO_LOCAL = Object.freeze({ home: 0x004400, default: 0x00ff41 });
const RETRO_REMOTE = Object.freeze({ home: 0x332200, default: 0xff8800 });

function isLocal(playerId, gameState) {
	if (!gameState) return false;
	const id = String(playerId);
	// CRITICAL: never check `currentPlayer` here. `currentPlayer` is
	// "whose turn is it" in the player-bar semantics — completely
	// unrelated to "is this MY player". Previously this comparison
	// caused every chess piece owned by the active-turn player to be
	// repainted in the local warm-wood palette, which the user saw
	// as "all the pieces flick to the same colour as mine".
	const localId = gameState.localPlayerId || gameState.myPlayerId;
	if (!localId) return false;
	return id === String(localId);
}

function hashString(str) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = str.charCodeAt(i) + ((hash << 5) - hash);
	}
	return hash;
}

function hslToRgb(h, s, l) {
	const c = (1 - Math.abs(2 * l / 100 - 1)) * s / 100;
	const x = c * (1 - Math.abs((h / 60) % 2 - 1));
	const m = l / 100 - c / 2;
	const [r, g, b] = h < 180 ? [0, c, x] : [0, x, c];
	return [
		Math.round((r + m) * 255),
		Math.round((g + m) * 255),
		Math.round((b + m) * 255),
	];
}

function brighten(color) {
	const r = Math.min(255, ((color >> 16) & 0xFF) + 40);
	const g = Math.min(255, ((color >> 8) & 0xFF) + 40);
	const b = Math.min(255, (color & 0xFF) + 40);
	return (r << 16) | (g << 8) | b;
}

export function getPlayerColor(playerId, gameState = null, type = 'chess') {
	const playerIdStr = String(playerId);
	const local = isLocal(playerIdStr, gameState);

	if (gameState && gameState.retroMode) {
		const palette = local ? RETRO_LOCAL : RETRO_REMOTE;
		return type === 'home' ? palette.home : palette.default;
	}

	if (local) return LOCAL_PALETTE[type] ?? LOCAL_PALETTE.chess;

	const hash = hashString(playerIdStr);
	const h = 120 + (Math.abs(hash) % 120);
	const s = 65 + (Math.abs(hash >> 8) % 35);
	const l = 45 + (Math.abs(hash >> 16) % 20);
	const [red, green, blue] = hslToRgb(h, s, l);
	let color = (red << 16) | (green << 8) | blue;

	if (type === 'tetromino') color = brighten(color);
	return color;
}
