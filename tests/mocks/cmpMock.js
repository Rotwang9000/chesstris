/**
 * CMP (Compare) Mock
 * 
 * A mock implementation of comparison functions.
 */

// Basic comparison function
const cmp = (a, b) => {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
};

// Numeric comparison
const numericCmp = (a, b) => {
	return cmp(Number(a), Number(b));
};

// String comparison
const stringCmp = (a, b) => {
	return String(a).localeCompare(String(b));
};

// Date comparison
const dateCmp = (a, b) => {
	return cmp(new Date(a).getTime(), new Date(b).getTime());
};

// Object comparison by key
const objectCmp = (key, direction = 'asc') => (a, b) => {
	const result = cmp(a[key], b[key]);
	return direction === 'desc' ? -result : result;
};

// Array comparison
const arrayCmp = (a, b) => {
	const minLength = Math.min(a.length, b.length);
	
	for (let i = 0; i < minLength; i++) {
		const comparison = cmp(a[i], b[i]);
		if (comparison !== 0) return comparison;
	}
	
	return cmp(a.length, b.length);
};

module.exports = {
	cmp,
	numericCmp,
	stringCmp,
	dateCmp,
	objectCmp,
	arrayCmp
}; 