/**
 * Bundle stub of viking/shipLayout.js (see vikingLazy/runtime.js).
 * `cellHasShip` is a few lines of pure board reading, so it is here in
 * full (the same as shipLayout's; tests/ui/vikingLazy.test.js): a ship
 * square is never drawn as land, chunk or no chunk.
 */

function isShipItem(item) {
	return !!item && typeof item === 'object' && item.type === 'ship';
}

/** A ship cell is water with a hull on it: it gets no land block or cloud. */
export function cellHasShip(cell) {
	if (Array.isArray(cell)) return cell.some(isShipItem);
	return isShipItem(cell);
}
