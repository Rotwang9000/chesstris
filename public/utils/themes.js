// Theme management for Chess-tris

/**
 * Available visual themes for the game
 */
const THEMES = {
	DEFAULT: 'default',
	RUSSIAN: 'russian'
};

/**
 * Contains configuration for each visual theme
 */
const themeConfigs = {
	[THEMES.DEFAULT]: {
		name: 'Default',
		description: 'Classic chess pieces with modern styling',
		boardBaseColor: 0x333333,
		cellColors: {
			light: 0xe0e0e0,
			dark: 0x909090
		},
		pieceConfig: {
			king: { model: 'models/default/king.glb', scale: 0.8 },
			queen: { model: 'models/default/queen.glb', scale: 0.8 },
			bishop: { model: 'models/default/bishop.glb', scale: 0.7 },
			knight: { model: 'models/default/knight.glb', scale: 0.7 },
			rook: { model: 'models/default/rook.glb', scale: 0.7 },
			pawn: { model: 'models/default/pawn.glb', scale: 0.6 }
		},
		backgroundTexture: null,
		musicTracks: ['audio/default_track_01.mp3', 'audio/default_track_02.mp3']
	},
	[THEMES.RUSSIAN]: {
		name: 'Russian Tetris',
		description: 'Soviet-era themed chess pieces inspired by Russian architecture and culture',
		boardBaseColor: 0x2a3d45,
		cellColors: {
			light: 0xdbd3c9,
			dark: 0x9c8c84
		},
		pieceConfig: {
			king: { 
				model: 'models/russian/king_cathedral.glb', 
				scale: 0.85,
				description: 'St. Basil\'s Cathedral with colorful onion domes'
			},
			queen: { 
				model: 'models/russian/queen_tower.glb', 
				scale: 0.8,
				description: 'Spasskaya Tower with golden dome'
			},
			bishop: { 
				model: 'models/russian/bishop_church.glb', 
				scale: 0.7,
				description: 'Orthodox church spire with cross'
			},
			knight: { 
				model: 'models/russian/knight_bear.glb', 
				scale: 0.7,
				description: 'Bear wearing a military cap'
			},
			rook: { 
				model: 'models/russian/rook_monument.glb', 
				scale: 0.7,
				description: 'Brutalist Soviet monument tower'
			},
			pawn: { 
				model: 'models/russian/pawn_ushanka.glb', 
				scale: 0.6,
				description: 'Little figure wearing a ushanka fur hat'
			}
		},
		backgroundTexture: 'textures/russian_pattern.jpg',
		musicTracks: [
			'audio/russian_folk_01.mp3', 
			'audio/tetris_theme_variation.mp3',
			'audio/kalinka_remix.mp3'
		]
	}
};

/**
 * Get configuration for a specific theme
 * @param {string} themeName - Name of the theme to retrieve
 * @returns {Object} Theme configuration
 */
function getTheme(themeName = THEMES.DEFAULT) {
	return themeConfigs[themeName] || themeConfigs[THEMES.DEFAULT];
}

/**
 * Get list of all available themes
 * @returns {Array} Array of theme objects with name and description
 */
function getAllThemes() {
	return Object.keys(themeConfigs).map(key => ({
		id: key,
		name: themeConfigs[key].name,
		description: themeConfigs[key].description
	}));
}

/**
 * Get model path for a specific chess piece type in the selected theme
 * @param {string} pieceType - Type of chess piece (king, queen, etc.)
 * @param {string} themeName - Name of the theme
 * @returns {string} Path to the 3D model file
 */
function getPieceModelPath(pieceType, themeName = THEMES.DEFAULT) {
	const theme = getTheme(themeName);
	return theme.pieceConfig[pieceType]?.model || themeConfigs[THEMES.DEFAULT].pieceConfig[pieceType].model;
}

/**
 * Get scale factor for a specific chess piece type in the selected theme
 * @param {string} pieceType - Type of chess piece (king, queen, etc.)
 * @param {string} themeName - Name of the theme
 * @returns {number} Scale factor for the 3D model
 */
function getPieceScale(pieceType, themeName = THEMES.DEFAULT) {
	const theme = getTheme(themeName);
	return theme.pieceConfig[pieceType]?.scale || themeConfigs[THEMES.DEFAULT].pieceConfig[pieceType].scale;
}

module.exports = {
	THEMES,
	getTheme,
	getAllThemes,
	getPieceModelPath,
	getPieceScale
}; 