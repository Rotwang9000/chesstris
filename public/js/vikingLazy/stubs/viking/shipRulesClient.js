/**
 * Bundle stub of viking/shipRulesClient.js (see vikingLazy/runtime.js):
 * the one pure helper the app bundle reads, in full (the same as the
 * rules mirror's; tests/ui/vikingLazy.test.js).
 */

/** Does a cell's item list hold a ship? */
export function cellHasShip(cell) {
	return Array.isArray(cell) && cell.some(item => !!(item && item.type === 'ship'));
}
