/**
 * Helpers Module
 * 
 * A collection of utility functions used throughout the game.
 */

/**
 * Generate a random integer between min and max (inclusive)
 * @param {number} min - The minimum value
 * @param {number} max - The maximum value
 * @returns {number} A random integer
 */
export function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a random color in hex format
 * @param {number} minBrightness - Minimum brightness (0-255)
 * @returns {string} A random color in hex format
 */
export function randomColor(minBrightness = 100) {
	const r = randomInt(minBrightness, 255);
	const g = randomInt(minBrightness, 255);
	const b = randomInt(minBrightness, 255);
	return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Check if two objects are colliding
 * @param {Object} obj1 - First object with x, y, width, height
 * @param {Object} obj2 - Second object with x, y, width, height
 * @returns {boolean} Whether the objects are colliding
 */
export function checkCollision(obj1, obj2) {
	return (
		obj1.x < obj2.x + obj2.width &&
		obj1.x + obj1.width > obj2.x &&
		obj1.y < obj2.y + obj2.height &&
		obj1.y + obj1.height > obj2.y
	);
}

/**
 * Calculate the distance between two points
 * @param {number} x1 - X coordinate of the first point
 * @param {number} y1 - Y coordinate of the first point
 * @param {number} x2 - X coordinate of the second point
 * @param {number} y2 - Y coordinate of the second point
 * @returns {number} The distance between the points
 */
export function distance(x1, y1, x2, y2) {
	return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Clamp a value between a minimum and maximum
 * @param {number} value - The value to clamp
 * @param {number} min - The minimum value
 * @param {number} max - The maximum value
 * @returns {number} The clamped value
 */
export function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

/**
 * Lerp (linear interpolation) between two values
 * @param {number} a - The start value
 * @param {number} b - The end value
 * @param {number} t - The interpolation factor (0-1)
 * @returns {number} The interpolated value
 */
export function lerp(a, b, t) {
	return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Debounce a function
 * @param {Function} func - The function to debounce
 * @param {number} wait - The debounce time in milliseconds
 * @returns {Function} The debounced function
 */
export function debounce(func, wait) {
	let timeout;
	return function(...args) {
		const context = this;
		clearTimeout(timeout);
		timeout = setTimeout(() => func.apply(context, args), wait);
	};
}

/**
 * Throttle a function
 * @param {Function} func - The function to throttle
 * @param {number} limit - The throttle time in milliseconds
 * @returns {Function} The throttled function
 */
export function throttle(func, limit) {
	let inThrottle;
	return function(...args) {
		const context = this;
		if (!inThrottle) {
			func.apply(context, args);
			inThrottle = true;
			setTimeout(() => inThrottle = false, limit);
		}
	};
}

/**
 * Format a number with commas
 * @param {number} num - The number to format
 * @returns {string} The formatted number
 */
export function formatNumber(num) {
	return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format a date as a string
 * @param {Date|string} date - The date to format
 * @param {string} format - The format to use (default: 'DD/MM/YYYY')
 * @returns {string} The formatted date
 */
export function formatDate(date, format = 'DD/MM/YYYY') {
	const d = new Date(date);
	const day = d.getDate().toString().padStart(2, '0');
	const month = (d.getMonth() + 1).toString().padStart(2, '0');
	const year = d.getFullYear();
	const hours = d.getHours().toString().padStart(2, '0');
	const minutes = d.getMinutes().toString().padStart(2, '0');
	const seconds = d.getSeconds().toString().padStart(2, '0');
	
	return format
		.replace('DD', day)
		.replace('MM', month)
		.replace('YYYY', year)
		.replace('HH', hours)
		.replace('mm', minutes)
		.replace('ss', seconds);
}

/**
 * Shuffle an array (Fisher-Yates algorithm)
 * @param {Array} array - The array to shuffle
 * @returns {Array} The shuffled array
 */
export function shuffleArray(array) {
	const newArray = [...array];
	for (let i = newArray.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[newArray[i], newArray[j]] = [newArray[j], newArray[i]];
	}
	return newArray;
}

/**
 * Generate a unique ID
 * @param {number} length - The length of the ID
 * @returns {string} A unique ID
 */
export function generateId(length = 8) {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let id = '';
	for (let i = 0; i < length; i++) {
		id += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return id;
}

/**
 * Deep clone an object
 * @param {Object} obj - The object to clone
 * @returns {Object} The cloned object
 */
export function deepClone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if an object is empty
 * @param {Object} obj - The object to check
 * @returns {boolean} Whether the object is empty
 */
export function isEmptyObject(obj) {
	return Object.keys(obj).length === 0;
}

/**
 * Get a query parameter from the URL
 * @param {string} name - The name of the parameter
 * @returns {string|null} The parameter value or null if not found
 */
export function getQueryParam(name) {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.get(name);
}

/**
 * Set a query parameter in the URL
 * @param {string} name - The name of the parameter
 * @param {string} value - The value of the parameter
 * @param {boolean} replace - Whether to replace the current history entry
 */
export function setQueryParam(name, value, replace = false) {
	const url = new URL(window.location.href);
	url.searchParams.set(name, value);
	if (replace) {
		window.history.replaceState({}, '', url);
	} else {
		window.history.pushState({}, '', url);
	}
}

export default {
	randomInt,
	randomColor,
	checkCollision,
	distance,
	clamp,
	lerp,
	debounce,
	throttle,
	formatNumber,
	formatDate,
	shuffleArray,
	generateId,
	deepClone,
	isEmptyObject,
	getQueryParam,
	setQueryParam
}; 