/**
 * Canonical tetromino shapes and palette.
 *
 * Single source of truth on the client side — every module that needs
 * a shape or colour must import it from here rather than copy/pasting
 * its own switch statement.
 */

export const TETROMINO_SHAPES = Object.freeze({
	I: [
		[0, 0, 0, 0],
		[1, 1, 1, 1],
		[0, 0, 0, 0],
		[0, 0, 0, 0],
	],
	J: [
		[1, 0, 0],
		[1, 1, 1],
		[0, 0, 0],
	],
	L: [
		[0, 0, 1],
		[1, 1, 1],
		[0, 0, 0],
	],
	O: [
		[1, 1],
		[1, 1],
	],
	S: [
		[0, 1, 1],
		[1, 1, 0],
		[0, 0, 0],
	],
	T: [
		[0, 1, 0],
		[1, 1, 1],
		[0, 0, 0],
	],
	Z: [
		[1, 1, 0],
		[0, 1, 1],
		[0, 0, 0],
	],
});

const FALLBACK_SHAPE = [
	[1, 1],
	[1, 1],
];

/** CSS hex colours for canvas preview. */
export const TETROMINO_COLOURS_CSS = Object.freeze({
	I: '#00FFFF',
	J: '#0000FF',
	L: '#FF8000',
	O: '#FFFF00',
	S: '#00FF00',
	T: '#800080',
	Z: '#FF0000',
});

/** Three.js colour ints (matching the CSS palette). */
export const TETROMINO_COLOURS_HEX = Object.freeze({
	I: 0x00ffff,
	J: 0x0000ff,
	L: 0xff8000,
	O: 0xffff00,
	S: 0x00ff00,
	T: 0x800080,
	Z: 0xff0000,
});

export function getShape(type) {
	const shape = TETROMINO_SHAPES[type];
	return shape ? shape.map(row => row.slice()) : FALLBACK_SHAPE.map(row => row.slice());
}

export function getColourCss(type) {
	return TETROMINO_COLOURS_CSS[type] || '#888888';
}

export function getColourHex(type) {
	return TETROMINO_COLOURS_HEX[type] ?? 0x888888;
}
