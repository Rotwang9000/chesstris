/**
 * Helpers
 * 
 * Utility functions for the game.
 */

/**
 * Generate a random ID
 * @param {number} length - Length of the ID
 * @returns {string} - Random ID
 */
export function generateId(length = 12) {
	try {
		const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
		let id = '';
		
		for (let i = 0; i < length; i++) {
			id += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		
		return id;
	} catch (error) {
		console.error('Error generating ID:', error);
		return `id-${Date.now()}`;
	}
}

/**
 * Throttle a function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Throttle limit in milliseconds
 * @returns {Function} - Throttled function
 */
export function throttle(func, limit) {
	let lastCall = 0;
	
	return function(...args) {
		const now = Date.now();
		
		if (now - lastCall >= limit) {
			lastCall = now;
			return func.apply(this, args);
		}
	};
}

/**
 * Debounce a function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Debounce wait time in milliseconds
 * @returns {Function} - Debounced function
 */
export function debounce(func, wait) {
	let timeout;
	
	return function(...args) {
		const context = this;
		
		clearTimeout(timeout);
		
		timeout = setTimeout(() => {
			func.apply(context, args);
		}, wait);
	};
}

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} - Clamped value
 */
export function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} - Interpolated value
 */
export function lerp(a, b, t) {
	return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Check if two objects are colliding
 * @param {Object} a - First object with x, y, width, height
 * @param {Object} b - Second object with x, y, width, height
 * @returns {boolean} - Whether the objects are colliding
 */
export function isColliding(a, b) {
	return (
		a.x < b.x + b.width &&
		a.x + a.width > b.x &&
		a.y < b.y + b.height &&
		a.y + a.height > b.y
	);
}

/**
 * Calculate distance between two points
 * @param {number} x1 - First point X
 * @param {number} y1 - First point Y
 * @param {number} x2 - Second point X
 * @param {number} y2 - Second point Y
 * @returns {number} - Distance
 */
export function distance(x1, y1, x2, y2) {
	const dx = x2 - x1;
	const dy = y2 - y1;
	return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Convert degrees to radians
 * @param {number} degrees - Degrees
 * @returns {number} - Radians
 */
export function degreesToRadians(degrees) {
	return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 * @param {number} radians - Radians
 * @returns {number} - Degrees
 */
export function radiansToDegrees(radians) {
	return radians * (180 / Math.PI);
}

/**
 * Get a random integer between min and max (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} - Random integer
 */
export function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min, max) {
	return Math.random() * (max - min) + min;
}

export function randomColor() {
	return `#${Math.floor(Math.random()*16777215).toString(16)}`;
}




/**
 * Shuffle an array in place
 * @param {Array} array - Array to shuffle
 * @returns {Array} - Shuffled array
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
 * Format a number with commas
 * @param {number} number - Number to format
 * @returns {string} - Formatted number
 */
export function formatNumber(number) {
	return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format time in seconds to MM:SS
 * @param {number} seconds - Time in seconds
 * @returns {string} - Formatted time
 */
export function formatTime(seconds) {
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.floor(seconds % 60);
	return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Deep clone an object
 * @param {Object} obj - Object to clone
 * @returns {Object} - Cloned object
 */
export function deepClone(obj) {
	try {
		return JSON.parse(JSON.stringify(obj));
	} catch (error) {
		console.error('Error deep cloning object:', error);
		return { ...obj };
	}
}

/**
 * Check if a value is null or undefined
 * @param {*} value - Value to check
 * @returns {boolean} - Whether the value is null or undefined
 */
export function isNullOrUndefined(value) {
	return value === null || value === undefined;
}

/**
 * Get a value from an object by path
 * @param {Object} obj - Object to get value from
 * @param {string} path - Path to value (e.g. 'a.b.c')
 * @param {*} defaultValue - Default value if path not found
 * @returns {*} - Value at path or default value
 */
export function getValueByPath(obj, path, defaultValue = undefined) {
	try {
		const keys = path.split('.');
		let result = obj;
		
		for (const key of keys) {
			if (isNullOrUndefined(result) || isNullOrUndefined(result[key])) {
				return defaultValue;
			}
			
			result = result[key];
		}
		
		return result;
	} catch (error) {
		console.error('Error getting value by path:', error);
		return defaultValue;
	}
}

/**
 * Set a value in an object by path
 * @param {Object} obj - Object to set value in
 * @param {string} path - Path to value (e.g. 'a.b.c')
 * @param {*} value - Value to set
 * @returns {Object} - Updated object
 */
export function setValueByPath(obj, path, value) {
	try {
		const keys = path.split('.');
		const lastKey = keys.pop();
		let current = obj;
		
		for (const key of keys) {
			if (isNullOrUndefined(current[key])) {
				current[key] = {};
			}
			
			current = current[key];
		}
		
		current[lastKey] = value;
		return obj;
	} catch (error) {
		console.error('Error setting value by path:', error);
		return obj;
	}
}

/**
 * Merge two objects deeply
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} - Merged object
 */
export function deepMerge(target, source) {
	try {
		const output = { ...target };
		
		if (isObject(target) && isObject(source)) {
			Object.keys(source).forEach(key => {
				if (isObject(source[key])) {
					if (!(key in target)) {
						output[key] = source[key];
					} else {
						output[key] = deepMerge(target[key], source[key]);
					}
				} else {
					output[key] = source[key];
				}
			});
		}
		
		return output;
	} catch (error) {
		console.error('Error merging objects:', error);
		return { ...target, ...source };
	}
}

/**
 * Check if a value is an object
 * @param {*} item - Value to check
 * @returns {boolean} - Whether the value is an object
 */
function isObject(item) {
	return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Create a promise that resolves after a delay
 * @param {number} ms - Delay in milliseconds
 * @returns {Promise} - Promise that resolves after delay
 */
export function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Try to parse JSON
 * @param {string} str - String to parse
 * @param {*} defaultValue - Default value if parsing fails
 * @returns {*} - Parsed JSON or default value
 */
export function tryParseJSON(str, defaultValue = null) {
	try {
		return JSON.parse(str);
	} catch (error) {
		return defaultValue;
	}
}

/**
 * Get URL parameters as an object
 * @returns {Object} - URL parameters
 */
export function getUrlParams() {
	try {
		const params = {};
		const queryString = window.location.search.substring(1);
		
		if (queryString) {
			const pairs = queryString.split('&');
			
			for (const pair of pairs) {
				const [key, value] = pair.split('=');
				params[decodeURIComponent(key)] = decodeURIComponent(value || '');
			}
		}
		
		return params;
	} catch (error) {
		console.error('Error getting URL parameters:', error);
		return {};
	}
}

/**
 * Check if the device is a mobile device
 * @returns {boolean} - Whether the device is mobile
 */
export function isMobileDevice() {
	try {
		return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
	} catch (error) {
		console.error('Error checking if device is mobile:', error);
		return false;
	}
}

/**
 * Get device orientation
 * @returns {string} - Device orientation ('portrait' or 'landscape')
 */
export function getDeviceOrientation() {
	try {
		return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
	} catch (error) {
		console.error('Error getting device orientation:', error);
		return 'landscape';
	}
}

/**
 * Check if WebGL is supported
 * @returns {boolean} - Whether WebGL is supported
 */
export function isWebGLSupported() {
	try {
		const canvas = document.createElement('canvas');
		return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
	} catch (error) {
		console.error('Error checking WebGL support:', error);
		return false;
	}
}
