/**
 * Browser Texture Generator
 * 
 * This script creates placeholder textures directly in the browser.
 * It can be used to generate textures on-the-fly without server-side dependencies.
 */

// Make sure THREE is available
let THREE;
if (typeof window !== 'undefined') {
	THREE = window.THREE;
	if (!THREE) {
		console.warn('THREE.js is not loaded. Texture generation will be disabled.');
	}
}

/**
 * Create a placeholder texture with text and patterns
 * @param {string} name - The name to display on the texture
 * @param {number} width - The width of the texture
 * @param {number} height - The height of the texture
 * @param {string} color - The background color in hex format
 * @returns {THREE.Texture|null} The created texture or null if THREE is not available
 */
function createPlaceholderTexture(name, width = 512, height = 512, color = '#444444') {
	try {
		// Check if THREE is available
		if (!THREE) {
			console.warn(`Cannot create texture "${name}" because THREE.js is not loaded.`);
			return null;
		}
		
		// Create canvas
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		
		// Fill background
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, width, height);
		
		// Add border
		ctx.strokeStyle = adjustColor(color, 30);
		ctx.lineWidth = Math.max(width, height) / 40;
		ctx.strokeRect(0, 0, width, height);
		
		// Add texture name
		ctx.font = `bold ${Math.floor(height / 10)}px Arial`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = getContrastColor(color);
		ctx.fillText(name, width / 2, height / 2);
		
		// Add pattern based on texture type
		switch (name) {
			case 'board':
				// Wooden pattern
				createWoodenPattern(ctx, width, height, color);
				break;
			case 'cell':
				// Grid pattern
				createGridPattern(ctx, width, height, color);
				break;
			case 'home_zone':
				// Diagonal stripes
				createDiagonalPattern(ctx, width, height, color);
				break;
			case 'birch':
				// Birch tree pattern
				createBirchPattern(ctx, width, height);
				break;
		}
		
		// Create texture from canvas
		const texture = new THREE.CanvasTexture(canvas);
		texture.needsUpdate = true;
		
		return texture;
	} catch (error) {
		console.error('Error creating placeholder texture:', error);
		
		// Create a basic colored texture as fallback
		const size = 2;
		const data = new Uint8Array(4 * size * size);
		
		// Convert hex color to RGB
		const r = parseInt(color.substring(1, 3), 16);
		const g = parseInt(color.substring(3, 5), 16);
		const b = parseInt(color.substring(5, 7), 16);
		
		for (let i = 0; i < size * size; i++) {
			const stride = i * 4;
			data[stride] = r;
			data[stride + 1] = g;
			data[stride + 2] = b;
			data[stride + 3] = 255; // alpha
		}
		
		const texture = new THREE.DataTexture(data, size, size);
		texture.needsUpdate = true;
		return texture;
	}
}

/**
 * Create a wooden pattern on the canvas
 */
function createWoodenPattern(ctx, width, height, baseColor) {
	// Create wood grain effect
	const numGrains = 20;
	const grainWidth = width / numGrains;
	
	for (let i = 0; i < numGrains; i++) {
		const x = i * grainWidth;
		const color = adjustColor(baseColor, Math.random() * 20 - 10);
		ctx.fillStyle = color;
		ctx.fillRect(x, 0, grainWidth, height);
		
		// Add some random darker streaks
		if (Math.random() > 0.7) {
			ctx.fillStyle = adjustColor(baseColor, -30);
			ctx.fillRect(x + grainWidth * 0.2, 0, grainWidth * 0.1, height);
		}
	}
	
	// Add some noise
	addNoise(ctx, width, height, 0.1);
}

/**
 * Create a grid pattern on the canvas
 */
function createGridPattern(ctx, width, height, baseColor) {
	const gridSize = Math.min(width, height) / 8;
	
	ctx.strokeStyle = adjustColor(baseColor, -20);
	ctx.lineWidth = 2;
	
	// Draw vertical lines
	for (let x = 0; x <= width; x += gridSize) {
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, height);
		ctx.stroke();
	}
	
	// Draw horizontal lines
	for (let y = 0; y <= height; y += gridSize) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}
	
	// Add some highlights
	ctx.fillStyle = adjustColor(baseColor, 20);
	for (let x = 0; x < width; x += gridSize) {
		for (let y = 0; y < height; y += gridSize) {
			if (Math.random() > 0.7) {
				ctx.fillRect(x, y, gridSize, gridSize);
			}
		}
	}
}

/**
 * Create a diagonal pattern on the canvas
 */
function createDiagonalPattern(ctx, width, height, baseColor) {
	const stripeWidth = Math.min(width, height) / 15;
	const numStripes = Math.ceil((width + height) / stripeWidth);
	
	// Draw diagonal stripes
	for (let i = 0; i < numStripes; i++) {
		const offset = i * stripeWidth * 2 - height;
		
		ctx.fillStyle = i % 2 === 0 ? baseColor : adjustColor(baseColor, 20);
		ctx.beginPath();
		ctx.moveTo(0, offset);
		ctx.lineTo(width, offset + width);
		ctx.lineTo(width, offset + width + stripeWidth);
		ctx.lineTo(0, offset + stripeWidth);
		ctx.closePath();
		ctx.fill();
	}
	
	// Add a subtle border
	ctx.strokeStyle = adjustColor(baseColor, -30);
	ctx.lineWidth = Math.max(width, height) / 50;
	ctx.strokeRect(0, 0, width, height);
}

/**
 * Create a birch tree pattern on the canvas
 */
function createBirchPattern(ctx, width, height) {
	// White background for birch
	ctx.fillStyle = '#f5f5f5';
	ctx.fillRect(0, 0, width, height);
	
	// Add horizontal black streaks for birch bark
	const numStreaks = 30;
	ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
	
	for (let i = 0; i < numStreaks; i++) {
		const y = Math.random() * height;
		const streakHeight = 2 + Math.random() * 5;
		const streakWidth = 10 + Math.random() * (width / 2);
		const x = Math.random() * (width - streakWidth);
		
		ctx.fillRect(x, y, streakWidth, streakHeight);
	}
	
	// Add some subtle vertical streaks
	ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
	ctx.lineWidth = 1;
	
	for (let i = 0; i < width; i += 20) {
		const x = i + Math.random() * 10;
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, height);
		ctx.stroke();
	}
}

/**
 * Add noise to the canvas
 */
function addNoise(ctx, width, height, intensity = 0.1) {
	const imageData = ctx.getImageData(0, 0, width, height);
	const data = imageData.data;
	
	for (let i = 0; i < data.length; i += 4) {
		const noise = Math.random() * 2 - 1;
		data[i] = Math.max(0, Math.min(255, data[i] + noise * intensity * 255));
		data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise * intensity * 255));
		data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise * intensity * 255));
	}
	
	ctx.putImageData(imageData, 0, 0);
}

/**
 * Adjust a color by a certain amount
 * @param {string} color - The color in hex format
 * @param {number} amount - The amount to adjust (-255 to 255)
 * @returns {string} The adjusted color
 */
function adjustColor(color, amount) {
	// Convert hex to RGB
	let r = parseInt(color.substring(1, 3), 16);
	let g = parseInt(color.substring(3, 5), 16);
	let b = parseInt(color.substring(5, 7), 16);
	
	// Adjust each component
	r = Math.max(0, Math.min(255, r + amount));
	g = Math.max(0, Math.min(255, g + amount));
	b = Math.max(0, Math.min(255, b + amount));
	
	// Convert back to hex
	return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Get a contrasting color (black or white) based on the background color
 * @param {string} hexColor - The background color in hex format
 * @returns {string} Either black or white, whichever contrasts better
 */
function getContrastColor(hexColor) {
	// Convert hex to RGB
	const r = parseInt(hexColor.substring(1, 3), 16);
	const g = parseInt(hexColor.substring(3, 5), 16);
	const b = parseInt(hexColor.substring(5, 7), 16);
	
	// Calculate luminance
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	
	// Return black for light colors, white for dark colors
	return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

/**
 * Generate all required textures and store them in the materials object
 * @param {Object} materials - The object to store the textures in
 * @returns {Object} The materials object with textures
 */
function generateAllTextures(materials = {}) {
	// Check if THREE is available
	if (!THREE) {
		console.warn('Cannot generate textures because THREE.js is not loaded.');
		return materials;
	}
	
	// Generate board texture
	materials.board = createPlaceholderTexture('board', 512, 512, '#5d4037');
	
	// Generate cell texture
	materials.cell = createPlaceholderTexture('cell', 512, 512, '#42a5f5');
	
	// Generate home zone texture
	materials.homeZone = createPlaceholderTexture('home_zone', 512, 512, '#7986cb');
	
	// Generate birch texture
	materials.birch = createPlaceholderTexture('birch', 512, 1024, '#f5f5f5');
	
	return materials;
}

// Export functions for use in other modules
export {
	createPlaceholderTexture,
	createPlaceholderTexture as createTexture,
	generateAllTextures,
	adjustColor,
	getContrastColor
}; 