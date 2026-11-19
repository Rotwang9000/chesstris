/**
 * Place names for board cells: "Hrafnby 47" instead of "(3432, 2345)".
 *
 * The world is cut into AREA × AREA squares of cells, each with a Norse
 * or Rus place name made from its square's grid position (the same name
 * on every client, forever: no table to keep in sync). The number is
 * the BLOCK × BLOCK patch inside the area, counted 1–100 row by row
 * from the area's low corner, like a postcode district.
 *
 * Battle arenas are a small board of their own: inside one, positions
 * stay as coordinates from the arena centre, which read like a chess
 * square there.
 *
 * With debug mode on, the raw coordinates follow in brackets.
 */

export const AREA = 100;
export const BLOCK = 10;

// Norse: first part + ending ("Hrafn" + "by").
const NORSE_HEADS = [
	'Hrafn', 'Ulf', 'Bjarn', 'Sigur', 'Thors', 'Grim', 'Ask', 'Kol', 'Ketil', 'Hald',
	'Ragn', 'Svein', 'Eyr', 'Hed', 'Bir', 'Kaup', 'Lade', 'Sax', 'Skjold', 'Frey',
	'Odins', 'Hjalm', 'Varg', 'Stein', 'Orm', 'Gunn', 'Hval', 'Snae', 'Jarl', 'Rimm',
];
const NORSE_TAILS = ['by', 'vik', 'heim', 'stad', 'fjord', 'holm', 'nes', 'dal', 'gard', 'ey', 'tun', 'havn', 'berg', 'vatn'];

// Rus: first part + ending ("Bel" + "ozero").
const RUS_HEADS = ['Novo', 'Staro', 'Bel', 'Yaro', 'Svyato', 'Volkh', 'Dobro', 'Pere', 'Vysh', 'Zlato', 'Ladog', 'Izbor', 'Polot', 'Smol', 'Turov'];
const RUS_TAILS = ['grad', 'gorod', 'sk', 'ovo', 'itsa', 'ets', 'ozero'];

/** A small, stable integer hash of an area's grid position. */
function hashArea(ax, az) {
	let h = Math.imul(ax | 0, 0x27d4eb2d) ^ Math.imul(az | 0, 0x165667b1);
	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Two parts joined: a vowel meeting a vowel drops the first ("Yaro" +
 * "ozero" → "Yarozero"), and no letter comes three times running
 * ("Gunn" + "nes" → "Gunnes").
 */
function join(head, tail) {
	const word = /[aeiou]$/i.test(head) && /^[aeiou]/i.test(tail) ? head.slice(0, -1) + tail : head + tail;
	return word.replace(/(.)\1\1/g, '$1$1');
}

/** The name of the area at grid position (ax, az). */
export function areaName(ax, az) {
	const h = hashArea(ax, az);
	// About one area in four is Rus, the rest Norse.
	if (h % 4 === 0) {
		return join(RUS_HEADS[(h >>> 2) % RUS_HEADS.length], RUS_TAILS[(h >>> 8) % RUS_TAILS.length]);
	}
	return join(NORSE_HEADS[(h >>> 2) % NORSE_HEADS.length], NORSE_TAILS[(h >>> 10) % NORSE_TAILS.length]);
}

/**
 * The place of cell (x, z): `{ name, block, text }`, e.g.
 * `{ name: 'Hrafnby', block: 47, text: 'Hrafnby 47' }`.
 */
export function placeOf(x, z) {
	const ax = Math.floor(x / AREA);
	const az = Math.floor(z / AREA);
	const lx = x - ax * AREA;
	const lz = z - az * AREA;
	const per = AREA / BLOCK;
	const block = Math.floor(lz / BLOCK) * per + Math.floor(lx / BLOCK) + 1;
	const name = areaName(ax, az);
	return { name, block, text: `${name} ${block}` };
}

/**
 * What the player reads for cell (x, z): its place name, or, inside a
 * battle arena, coordinates from the arena centre. `null` when x or z
 * isn't a number.
 */
export function placeLabel(x, z, gameState = null) {
	if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
	const centre = gameState?.activeBattle?.centre;
	if (centre && Number.isFinite(centre.x) && Number.isFinite(centre.z)) {
		return `(${x - centre.x}, ${z - centre.z})`;
	}
	const text = placeOf(x, z).text;
	return gameState?.debugMode ? `${text} (${x}, ${z})` : text;
}
