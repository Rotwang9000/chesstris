// main.js - Client-side game logic and rendering

// Import theme utilities
import { THEMES, getTheme, getAllThemes, getPieceModelPath, getPieceScale } from './utils/themes.js';
import { displaySponsorInfo, handleSponsorClick } from './utils/sponsors.js';

// ----- Theme Configuration -----
const THEMES = {
	DEFAULT: 'default',
	RUSSIAN: 'russian'
};

// Russian theme configuration
const russianTheme = {
	name: 'Russian Tetris',
	description: 'Soviet-era themed chess pieces inspired by Russian architecture and culture',
	boardBaseColor: 0x2a3d45,
	cellColors: {
		light: 0xdbd3c9,
		dark: 0x9c8c84
	},
	pieceModels: {
		king: { 
			description: 'St. Basil\'s Cathedral with colorful onion domes',
			height: 0.9
		},
		queen: { 
			description: 'Spasskaya Tower with golden dome',
			height: 0.85
		},
		bishop: { 
			description: 'Orthodox church spire with cross',
			height: 0.7
		},
		knight: { 
			description: 'Bear wearing a military ushanka hat',
			height: 0.7
		},
		rook: { 
			description: 'Brutalist Soviet monument tower',
			height: 0.75
		},
		pawn: { 
			description: 'Little figure wearing a ushanka fur hat',
			height: 0.6
		}
	},
	// Tetris piece colors with Soviet flair
	tetrisColors: [
		0xcc0000, // Soviet red
		0xe0c35c, // Gold
		0x5b92e5, // Blue
		0x217e21, // Green
		0x9c5a3c  // Brown
	]
};

// Use the Russian theme as the active theme
let currentTheme = russianTheme;

// ----- Constants -----
const CELL_SIZE = 1;
const CELL_HEIGHT = 0.2;
const FALLING_PIECE_STEP = 0.05;
const FALLING_PIECE_START_HEIGHT = 10;
const PIECE_HOVER_HEIGHT = 0.2;

// ----- Game State -----
let playerId = null;
let playerColor = null;
let playerPieces = [];
let homeZone = null;
let selectedPiece = null;
let validMoves = [];
let board = {};
let boardWidth = 0;
let boardHeight = 0;
let homeZones = {};
let players = {};
let fallingPiece = null;
let modelCache = {}; // Cache for loaded 3D models
let defaultFont = null;
let isDraggingPiece = false;
let draggingPieceStartPos = { x: 0, y: 0 };

// ----- Three.js Setup -----
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, -10, 15);
camera.lookAt(8, 8, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = true;

// Groups for organizing objects
const boardGroup = new THREE.Group();
const piecesGroup = new THREE.Group();
const fallingGroup = new THREE.Group();
const highlightGroup = new THREE.Group();
scene.add(boardGroup);
scene.add(piecesGroup);
scene.add(fallingGroup);
scene.add(highlightGroup);

// ----- Materials -----
const boardMaterial = new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 100 });
const gameTheme = getTheme(currentTheme);
const cellMaterials = {
	light: new THREE.MeshPhongMaterial({ color: gameTheme.cellColors.light, shininess: 50 }),
	dark: new THREE.MeshPhongMaterial({ color: gameTheme.cellColors.dark, shininess: 50 })
};

const highlightMaterial = new THREE.MeshPhongMaterial({
	color: 0x00ff00,
	transparent: true,
	opacity: 0.3
});

const attackHighlightMaterial = new THREE.MeshPhongMaterial({
	color: 0xff0000,
	transparent: true,
	opacity: 0.3
});

// Glowing material for own pieces
const glowShader = {
	vertexShader: `
		varying vec3 vNormal;
		varying vec3 vPosition;
		void main() {
			vNormal = normalize(normalMatrix * normal);
			vPosition = position;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,
	fragmentShader: `
		uniform vec3 color;
		uniform float time;
		varying vec3 vNormal;
		varying vec3 vPosition;
		void main() {
			float intensity = 0.5 + 0.3 * sin(time * 2.0);
			float glow = pow(0.4 - dot(vNormal, vec3(0, 0, 1.0)), 3.0) * intensity;
			gl_FragColor = vec4(color, glow);
		}
	`
};

// Chess piece geometries (simplified shapes for now)
const pieceGeometries = {
	pawn: new THREE.CylinderGeometry(0.2, 0.3, 0.8, 8),
	rook: new THREE.BoxGeometry(0.4, 0.4, 1),
	knight: new THREE.ConeGeometry(0.3, 1, 8),
	bishop: new THREE.CylinderGeometry(0.2, 0.4, 1, 8),
	queen: new THREE.CylinderGeometry(0.2, 0.5, 1.2, 8),
	king: new THREE.CylinderGeometry(0.2, 0.6, 1.4, 8)
};

// ----- Helper Functions -----
function createCell(x, y, color) {
	const material = ((x + y) % 2 === 0) ? cellMaterials.light : cellMaterials.dark;
	const mesh = new THREE.Mesh(cellGeometry, material);
	mesh.position.set(x + CELL_SIZE/2, y + CELL_SIZE/2, CELL_HEIGHT/2);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.userData = { type: 'cell', x, y };
	return mesh;
}

function createChessPiece(type, x, y, color, piece) {
	// Create a group for the piece and its label
	const group = new THREE.Group();
	group.position.set(x + CELL_SIZE/2, y + CELL_SIZE/2, CELL_HEIGHT);
	
	// Get piece details from theme
	const pieceDetails = currentTheme.pieceModels[type] || { height: 0.5 };
	
	// Create the appropriate geometry based on piece type and Russian theme
	let geometry;
	
	switch(type) {
		case 'king':
			// St. Basil's Cathedral with onion domes
			geometry = createCathedralGeometry(pieceDetails.height);
			break;
		case 'queen':
			// Spasskaya Tower with golden dome
			geometry = createTowerGeometry(pieceDetails.height);
			break;
		case 'bishop':
			// Orthodox church spire
			geometry = createChurchSpireGeometry(pieceDetails.height);
			break;
		case 'knight':
			// Bear with ushanka
			geometry = createBearGeometry(pieceDetails.height);
			break;
		case 'rook':
			// Soviet brutalist tower
			geometry = createBrutalistTowerGeometry(pieceDetails.height);
			break;
		case 'pawn':
			// Figure with ushanka hat
			geometry = createUshankaFigureGeometry(pieceDetails.height);
			break;
		default:
			geometry = new THREE.CylinderGeometry(0.2, 0.4, pieceDetails.height, 16);
	}
	
	// Create material with player color
	const pieceMaterial = new THREE.MeshPhongMaterial({ 
		color: parseInt(color, 16),
		shininess: 30
	});
	
	// Create the mesh
	const mesh = new THREE.Mesh(geometry, pieceMaterial);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.userData = { type: 'piece', pieceId: piece.id, pieceType: type, x, y, playerId: piece.playerId };
	
	// Add glow effect for own pieces
	if (piece.playerId === playerId) {
		const glowMaterial = new THREE.MeshBasicMaterial({
			color: parseInt(color, 16),
			transparent: true,
			opacity: 0.3
		});
		
		// Create a slightly larger copy of the geometry for the glow effect
		const glowGeometry = geometry.clone();
		const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
		glowMesh.scale.multiplyScalar(1.2);
		group.add(glowMesh);
		
		// Store reference to animate glow
		mesh.userData.glowMesh = glowMesh;
	}
	
	// Add the main mesh to the group
	group.add(mesh);
	
	// Add username label if font is loaded
	if (defaultFont && piece) {
		const username = piece.playerId === playerId ? 'You' : players[piece.playerId]?.username || `Player ${piece.playerId.slice(0, 4)}`;
		const textGeometry = new THREE.TextGeometry(username, {
			font: defaultFont,
			size: 0.2,
			height: 0.02
		});
		const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
		const textMesh = new THREE.Mesh(textGeometry, textMaterial);
		
		// Center the text above the piece
		textGeometry.computeBoundingBox();
		const textWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
		textMesh.position.set(-textWidth/2, 0, pieceDetails.height + 0.2);
		textMesh.rotation.x = -Math.PI / 2; // Face the camera
		group.add(textMesh);
	}
	
	return group;
}

function createHighlight(x, y, isAttack = false) {
	const material = isAttack ? attackHighlightMaterial : highlightMaterial;
	const mesh = new THREE.Mesh(highlightGeometry, material);
	mesh.position.set(x + CELL_SIZE/2, y + CELL_SIZE/2, 0);
	return mesh;
}

function showNotification(message, duration = 3000) {
	const notification = document.getElementById('notification');
	notification.textContent = message;
	notification.classList.add('show');
	setTimeout(() => {
		notification.classList.remove('show');
	}, duration);
}

function showSponsorAd(sponsor) {
	displaySponsorInfo(sponsor);
}

function updatePlayerList() {
	const container = document.getElementById('player-list');
	container.innerHTML = '';
	
	Object.values(players).forEach(player => {
		const div = document.createElement('div');
		div.className = 'player';
		
		const colorDiv = document.createElement('div');
		colorDiv.className = 'player-color';
		colorDiv.style.backgroundColor = `#${player.color.toString(16).padStart(6, '0')}`;
		
		const nameSpan = document.createElement('span');
		nameSpan.className = 'player-name';
		nameSpan.textContent = player.id === playerId ? `You (${player.username})` : player.username;
		
		const countSpan = document.createElement('span');
		countSpan.className = 'piece-count';
		countSpan.textContent = `${player.pieces.length} pieces`;
		
		div.appendChild(colorDiv);
		div.appendChild(nameSpan);
		div.appendChild(countSpan);
		container.appendChild(div);
	});
}

function updateHomeZoneInfo() {
	const info = document.getElementById('home-zone-info');
	if (!homeZone) {
		info.textContent = 'No home zone assigned';
		return;
	}
	
	const pieces = playerPieces.length;
	info.textContent = `Size: ${homeZone.width}×${homeZone.height}, Pieces: ${pieces}`;
}

function updatePotionInfo() {
	const container = document.getElementById('potions-container');
	container.innerHTML = '';
	
	if (!players[playerId]?.specialAbilities) return;
	
	const abilities = players[playerId].specialAbilities;
	
	if (abilities.jumpUntil) {
		const timeLeft = Math.ceil((abilities.jumpUntil - Date.now()) / 1000);
		if (timeLeft > 0) {
			const div = document.createElement('div');
			div.className = 'potion-info';
			
			const icon = document.createElement('div');
			icon.className = 'potion-icon';
			icon.textContent = '↑';
			
			const text = document.createElement('div');
			text.className = 'potion-text';
			text.textContent = `Jump ability: ${timeLeft}s remaining`;
			
			div.appendChild(icon);
			div.appendChild(text);
			container.appendChild(div);
		}
	}
}

// ----- Board Management -----
function clearBoard() {
	while (boardGroup.children.length > 0) {
		boardGroup.remove(boardGroup.children[0]);
	}
	while (piecesGroup.children.length > 0) {
		piecesGroup.remove(piecesGroup.children[0]);
	}
}

function updateBoard() {
	clearBoard();
	
	// Set board base color from theme
	const baseColor = currentTheme.boardBaseColor || 0x333333;
	boardMaterial.color.set(baseColor);
	
	// Create cells for each occupied position on the board
	for (const key in board) {
		const [x, y] = key.split(',').map(Number);
		const cell = board[key];
		
		// Create the cell mesh
		const cellMesh = createCell(x, y, cell.color);
		boardGroup.add(cellMesh);
		
		// If cell has a piece, create it
		if (cell.piece) {
			const pieceColor = players[cell.piece.playerId]?.color || 0x808080;
			const pieceMesh = createChessPiece(cell.piece.type, x, y, pieceColor, cell.piece);
			boardGroup.add(pieceMesh);
		}
	}
	
	// Update falling piece if there is one
	if (fallingPiece) {
		updateFallingPiece();
	}
	
	// Add home zone markers
	for (const playerId in homeZones) {
		const zone = homeZones[playerId];
		const zoneColor = players[playerId]?.color || 0x808080;
		
		// Create a wireframe box to mark the home zone
		const zoneGeometry = new THREE.BoxGeometry(
			zone.width * CELL_SIZE,
			zone.height * CELL_SIZE,
			CELL_HEIGHT * 0.5
		);
		const zoneMaterial = new THREE.MeshBasicMaterial({
			color: zoneColor,
			wireframe: true,
			transparent: true,
			opacity: 0.3
		});
		const zoneMesh = new THREE.Mesh(zoneGeometry, zoneMaterial);
		
		// Position at center of zone
		zoneMesh.position.set(
			zone.x + zone.width * CELL_SIZE / 2,
			zone.y + zone.height * CELL_SIZE / 2,
			CELL_HEIGHT * 0.25
		);
		
		boardGroup.add(zoneMesh);
		
		// Add zone label with player's username
		if (defaultFont) {
			const username = playerId === playerId ? 'Your Zone' : 
				`${players[playerId]?.username || 'Player'}'s Zone`;
			
			const textGeometry = new THREE.TextGeometry(username, {
				font: defaultFont,
				size: 0.4,
				height: 0.05
			});
			
			const textMaterial = new THREE.MeshBasicMaterial({ color: zoneColor });
			const textMesh = new THREE.Mesh(textGeometry, textMaterial);
			
			// Center the text above the zone
			textGeometry.computeBoundingBox();
			const textWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
			
			textMesh.position.set(
				zone.x + zone.width * CELL_SIZE / 2 - textWidth / 2,
				zone.y + zone.height * CELL_SIZE + 0.2,
				CELL_HEIGHT * 0.5
			);
			textMesh.rotation.x = -Math.PI / 2; // Face the camera
			
			boardGroup.add(textMesh);
		}
	}
	
	// Update UI elements
	updatePlayerList();
	updateHomeZoneInfo();
	updatePotionInfo();
}

function updateFallingPiece() {
	// Remove old piece if exists
	boardGroup.children = boardGroup.children.filter(child => 
		!child.userData || child.userData.type !== 'fallingPiece'
	);
	
	if (!fallingPiece) return;
	
	// Create new tetromino mesh
	const tetrominoMesh = createTetromino(fallingPiece);
	tetrominoMesh.userData = { type: 'fallingPiece' };
	boardGroup.add(tetrominoMesh);
}

function showValidMoves(moves) {
	while (highlightGroup.children.length > 0) {
		highlightGroup.remove(highlightGroup.children[0]);
	}
	
	for (const move of moves) {
		const highlight = createHighlight(move.x, move.y, move.type === 'attack');
		highlight.userData.move = move;
		highlightGroup.add(highlight);
	}
}

// ----- Input Handling -----
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onMouseMove(event) {
	mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
	mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onMouseClick(event) {
	raycaster.setFromCamera(mouse, camera);
	
	// If we have a selected piece, check for valid move targets
	if (selectedPiece) {
		const intersects = raycaster.intersectObjects(highlightGroup.children);
		if (intersects.length > 0) {
			const move = intersects[0].object.userData.move;
			socket.emit('movePiece', {
				pieceId: selectedPiece.id,
				targetX: move.x,
				targetY: move.y
			});
		}
		
		// Clear selection
		selectedPiece = null;
		showValidMoves([]);
		document.getElementById('movement-controls').classList.add('hidden');
		document.getElementById('piece-selection').classList.remove('hidden');
		return;
	}
	
	// Check for piece selection
	const intersects = raycaster.intersectObjects(piecesGroup.children);
	if (intersects.length > 0) {
		const pieceId = intersects[0].object.userData.pieceId;
		const piece = playerPieces.find(p => p.id === pieceId);
		
		if (piece) {
			selectedPiece = piece;
			socket.emit('getValidMoves', { pieceId });
			document.getElementById('movement-controls').classList.remove('hidden');
			document.getElementById('piece-selection').classList.add('hidden');
		}
	}
	
	// Check for sponsor clicks
	const sponsorIntersects = raycaster.intersectObjects(
		boardGroup.children.filter(obj => obj.userData.sponsor)
	);
	if (sponsorIntersects.length > 0) {
		const sponsor = sponsorIntersects[0].object.userData.sponsor;
		showSponsorAd(sponsor);
		socket.emit('sponsorClick', { sponsorId: sponsor.id });
		handleSponsorClick(sponsor.id);
	}
}

// ----- Socket.IO Event Handlers -----
const socket = io();

socket.on('playerData', (data) => {
	playerId = data.id;
	playerColor = data.color;
	playerPieces = data.pieces;
	homeZone = data.homeZone;
	
	// Show username form on first connection
	document.getElementById('username-form').style.display = 'block';
	
	updateHomeZoneInfo();
});

socket.on('gameStateUpdate', (data) => {
	board = data.board;
	fallingPiece = data.fallingPiece;
	boardWidth = data.boardWidth;
	boardHeight = data.boardHeight;
	homeZones = data.homeZones;
	players = data.players;
	
	if (players[playerId]) {
		playerPieces = players[playerId].pieces;
	}
	
	updateBoard();
	updateFallingPiece();
	updatePlayerList();
	updateHomeZoneInfo();
	updatePotionInfo();
	
	// Update camera position if this is the first update
	if (!camera.userData.initialized) {
		camera.position.set(boardWidth/2, -boardHeight/2, 30);
		controls.target.set(boardWidth/2, boardHeight/2, 0);
		controls.update();
		camera.userData.initialized = true;
	}
});

socket.on('moveResult', (result) => {
	if (!result.success) {
		showNotification(result.message);
	}
});

socket.on('validMoves', (moves) => {
	validMoves = moves;
	showValidMoves(moves);
});

socket.on('usernameUpdate', (data) => {
	if (data.success) {
		document.getElementById('username-form').style.display = 'none';
		showNotification(`Username set to: ${data.username}`);
	} else {
		document.getElementById('username-error').textContent = data.error;
	}
});

// ----- Event Listeners -----
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('click', onMouseClick);

window.addEventListener('resize', () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('cancel-move').addEventListener('click', () => {
	selectedPiece = null;
	showValidMoves([]);
	document.getElementById('movement-controls').classList.add('hidden');
	document.getElementById('piece-selection').classList.remove('hidden');
});

document.querySelector('.sponsor-ad .close-btn').addEventListener('click', () => {
	document.getElementById('sponsor-ad').style.display = 'none';
});

// ----- Animation Loop -----
function animate() {
	requestAnimationFrame(animate);
	controls.update();
	
	// Update time for animation effects
	const time = Date.now() * 0.001;
	
	// Update glow effect for player's pieces
	boardGroup.traverse((child) => {
		if (child.userData && child.userData.glowMesh) {
			const glow = child.userData.glowMesh;
			// Make glow pulsate
			glow.material.opacity = 0.2 + 0.2 * Math.sin(time * 2.0);
		}
	});
	
	// Update snowfall particles if present
	if (scene.userData.particleSystem) {
		scene.userData.particleSystem.userData.update();
	}
	
	renderer.render(scene, camera);
}

animate();

// Add tetris piece dragging functionality
let isDraggingTetris = false;
let dragStartPosition = new THREE.Vector2();
let dragStartPiecePosition = new THREE.Vector2();

function onMouseDown(event) {
	if (!fallingPiece) return;
	
	mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
	mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
	
	raycaster.setFromCamera(mouse, camera);
	const intersects = raycaster.intersectObjects(fallingGroup.children);
	
	if (intersects.length > 0) {
		isDraggingTetris = true;
		dragStartPosition.set(event.clientX, event.clientY);
		dragStartPiecePosition.set(fallingPiece.x, fallingPiece.y);
	}
}

function onMouseDrag(event) {
	if (!isDraggingTetris) return;
	
	const deltaX = (event.clientX - dragStartPosition.x) / 50; // Adjust sensitivity
	const deltaY = (event.clientY - dragStartPosition.y) / 50;
	
	// Update piece position
	const newX = Math.round(dragStartPiecePosition.x + deltaX);
	const newY = Math.round(dragStartPiecePosition.y - deltaY); // Invert Y for screen coordinates
	
	// Check bounds
	const maxX = boardWidth - Math.max(...fallingPiece.blocks.map(b => b.x));
	const maxY = boardHeight - Math.max(...fallingPiece.blocks.map(b => b.y));
	
	fallingPiece.x = Math.max(0, Math.min(newX, maxX));
	fallingPiece.y = Math.max(0, Math.min(newY, maxY));
	
	// Update visuals
	updateFallingPiece();
	
	// Emit position update to server
	socket.emit('updateFallingPiecePosition', {
		x: fallingPiece.x,
		y: fallingPiece.y
	});
}

function onMouseUp() {
	isDraggingTetris = false;
}

// Add to event listeners:
window.addEventListener('mousedown', onMouseDown);
window.addEventListener('mousemove', (event) => {
	onMouseMove(event);
	onMouseDrag(event);
});
window.addEventListener('mouseup', onMouseUp);

// Add keyboard controls for tetris piece
function onKeyDown(event) {
	if (!fallingPiece) return;
	
	let moved = false;
	
	switch (event.key) {
		case 'ArrowLeft':
			if (fallingPiece.x > 0) {
				fallingPiece.x--;
				moved = true;
			}
			break;
		case 'ArrowRight':
			const maxX = boardWidth - Math.max(...fallingPiece.blocks.map(b => b.x));
			if (fallingPiece.x < maxX) {
				fallingPiece.x++;
				moved = true;
			}
			break;
		case 'ArrowUp':
			if (fallingPiece.y < boardHeight - Math.max(...fallingPiece.blocks.map(b => b.y))) {
				fallingPiece.y++;
				moved = true;
			}
			break;
		case 'ArrowDown':
			if (fallingPiece.y > 0) {
				fallingPiece.y--;
				moved = true;
			}
			break;
		case ' ': // Spacebar to rotate
			rotateFallingPiece();
			moved = true;
			break;
	}
	
	if (moved) {
		updateFallingPiece();
		socket.emit('updateFallingPiecePosition', {
			x: fallingPiece.x,
			y: fallingPiece.y
		});
	}
}

function rotateFallingPiece() {
	// Rotate blocks 90 degrees clockwise
	fallingPiece.blocks = fallingPiece.blocks.map(block => ({
		x: -block.y,
		y: block.x
	}));
	
	// Ensure piece stays within bounds after rotation
	const maxX = Math.max(...fallingPiece.blocks.map(b => b.x));
	const maxY = Math.max(...fallingPiece.blocks.map(b => b.y));
	
	if (fallingPiece.x + maxX >= boardWidth) {
		fallingPiece.x = boardWidth - maxX - 1;
	}
	if (fallingPiece.y + maxY >= boardHeight) {
		fallingPiece.y = boardHeight - maxY - 1;
	}
}

// Add to event listeners:
window.addEventListener('keydown', onKeyDown);

// ----- Text Rendering -----
const fontLoader = new THREE.FontLoader();

// Load the font for usernames
fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function(font) {
	defaultFont = font;
	updateBoard(); // Refresh board to add usernames
});

// ----- Username Handling -----
document.getElementById('set-username-form').addEventListener('submit', (event) => {
	event.preventDefault();
	const input = document.getElementById('username-input');
	const username = input.value;
	socket.emit('setUsername', username);
});

// Load required libraries
function loadRequiredLibraries() {
	// Load GLTFLoader for 3D models
	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = 'https://cdn.jsdelivr.net/npm/three@0.132.2/examples/js/loaders/GLTFLoader.js';
		script.onload = resolve;
		script.onerror = reject;
		document.head.appendChild(script);
	});
}

// Initialize the game after all resources are loaded
async function init() {
	try {
		await loadRequiredLibraries();
		
		// Initialize theme system
		initTheme();
		
		// Set up marketplace UI - now handled in public/js/main.js
		// setupMarketplaceUI();
		
		// Set up payment system - now handled in public/js/main.js
		// setupPaymentUI();
		
		// Set up event listeners
		renderer.domElement.addEventListener('mousemove', onMouseMove);
		renderer.domElement.addEventListener('click', onMouseClick);
		renderer.domElement.addEventListener('mousedown', onMouseDown);
		renderer.domElement.addEventListener('mouseup', onMouseUp);
		document.addEventListener('keydown', onKeyDown);
		window.addEventListener('resize', onWindowResize);
		
		// Start animation loop
		animate();
		
		console.log('Game initialized with theme:', currentTheme);
	} catch (error) {
		console.error('Error initializing game:', error);
		showNotification('Error loading game resources. Please refresh and try again.');
	}
}

// Handle window resize
function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

// Initialize theme when game starts
function initTheme() {
	// Set up theme selector UI
	setupThemeSelector();
	
	// Load theme-specific resources
	loadThemeAudio();
	loadBackgroundTexture();
	
	// Add theme info to the UI
	document.querySelector('#info-panel p').textContent = gameTheme.description;
}

// Create a theme selector UI
function setupThemeSelector() {
	const themes = getAllThemes();
	
	// Create the theme selector container
	const selectorContainer = document.createElement('div');
	selectorContainer.className = 'panel';
	selectorContainer.style.position = 'absolute';
	selectorContainer.style.top = '70px';
	selectorContainer.style.right = '15px';
	selectorContainer.style.maxWidth = '250px';
	
	const heading = document.createElement('h2');
	heading.textContent = 'Theme';
	selectorContainer.appendChild(heading);
	
	// Create buttons for each theme
	themes.forEach(theme => {
		const btn = document.createElement('button');
		btn.textContent = theme.name;
		btn.className = 'btn';
		if (theme.id === currentTheme) {
			btn.classList.add('selected');
		}
		
		btn.addEventListener('click', () => {
			// Update current theme
			currentTheme = theme.id;
			
			// Update UI
			document.querySelectorAll('.btn.selected').forEach(el => el.classList.remove('selected'));
			btn.classList.add('selected');
			
			// Update game elements with new theme
			applyTheme();
			
			// Show notification
			showNotification(`Theme changed to ${theme.name}`);
		});
		
		selectorContainer.appendChild(btn);
	});
	
	document.querySelector('#ui-container').appendChild(selectorContainer);
}

// Apply the current theme to all game elements
function applyTheme() {
	const newTheme = getTheme(currentTheme);
	
	// Update materials
	cellMaterials.light.color.set(newTheme.cellColors.light);
	cellMaterials.dark.color.set(newTheme.cellColors.dark);
	
	// Update board base color
	boardMaterial.color.set(newTheme.boardBaseColor);
	
	// Clear model cache to force reload with new theme
	modelCache = {};
	
	// Reload the board with new theme
	clearBoard();
	updateBoard();
	
	// Update theme info in UI
	document.querySelector('#info-panel p').textContent = newTheme.description;
}

// Load themed audio if available
function loadThemeAudio() {
	// Create audio context
	const audioContext = new (window.AudioContext || window.webkitAudioContext)();
	
	// Russian music tracks
	const russianTracks = [
		{ url: 'https://upload.wikimedia.org/wikipedia/commons/7/77/Korobeiniki.ogg', name: 'Korobeiniki (Tetris Theme)' },
		{ url: 'https://upload.wikimedia.org/wikipedia/commons/a/a4/Kalinka.ogg', name: 'Kalinka' },
		{ url: 'https://upload.wikimedia.org/wikipedia/commons/1/1f/Katyusha_%28song%29.ogg', name: 'Katyusha' }
	];
	
	// Select a random track
	const track = russianTracks[Math.floor(Math.random() * russianTracks.length)];
	
	// Create audio element
	const audioElement = document.createElement('audio');
	audioElement.src = track.url;
	audioElement.loop = true;
	audioElement.volume = 0.4;
	audioElement.crossOrigin = 'anonymous';
	document.body.appendChild(audioElement);
	
	// Create audio controls
	const audioControls = document.createElement('div');
	audioControls.className = 'audio-controls panel';
	audioControls.style.position = 'absolute';
	audioControls.style.bottom = '15px';
	audioControls.style.left = '50%';
	audioControls.style.transform = 'translateX(-50%)';
	audioControls.style.display = 'flex';
	audioControls.style.alignItems = 'center';
	audioControls.style.padding = '8px 15px';
	
	// Create track info
	const trackInfo = document.createElement('div');
	trackInfo.textContent = `♫ ${track.name}`;
	trackInfo.style.marginRight = '15px';
	
	// Create play button
	const playButton = document.createElement('button');
	playButton.className = 'btn';
	playButton.innerHTML = '<i class="fas fa-play"></i> Play Music';
	playButton.addEventListener('click', () => {
		if (audioElement.paused) {
			audioElement.play();
			playButton.innerHTML = '<i class="fas fa-pause"></i> Pause';
		} else {
			audioElement.pause();
			playButton.innerHTML = '<i class="fas fa-play"></i> Play';
		}
	});
	
	// Volume control
	const volumeControl = document.createElement('input');
	volumeControl.type = 'range';
	volumeControl.min = '0';
	volumeControl.max = '1';
	volumeControl.step = '0.1';
	volumeControl.value = '0.4';
	volumeControl.style.marginLeft = '10px';
	volumeControl.addEventListener('input', () => {
		audioElement.volume = volumeControl.value;
	});
	
	// Add FontAwesome for icons
	const fontAwesome = document.createElement('link');
	fontAwesome.rel = 'stylesheet';
	fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
	document.head.appendChild(fontAwesome);
	
	// Add controls to the page
	audioControls.appendChild(trackInfo);
	audioControls.appendChild(playButton);
	audioControls.appendChild(volumeControl);
	document.body.appendChild(audioControls);
	
	// Create visualization if possible
	try {
		const audioSource = audioContext.createMediaElementSource(audioElement);
		const analyser = audioContext.createAnalyser();
		analyser.fftSize = 256;
		
		audioSource.connect(analyser);
		analyser.connect(audioContext.destination);
		
		const dataArray = new Uint8Array(analyser.frequencyBinCount);
		
		// Create visualization element
		const visualization = document.createElement('canvas');
		visualization.width = 200;
		visualization.height = 30;
		visualization.style.marginLeft = '10px';
		audioControls.appendChild(visualization);
		
		const canvasContext = visualization.getContext('2d');
		
		// Function to draw visualization
		function drawVisualization() {
			if (audioElement.paused) return;
			
			requestAnimationFrame(drawVisualization);
			analyser.getByteFrequencyData(dataArray);
			
			canvasContext.clearRect(0, 0, visualization.width, visualization.height);
			canvasContext.fillStyle = '#222';
			canvasContext.fillRect(0, 0, visualization.width, visualization.height);
			
			const barWidth = (visualization.width / analyser.frequencyBinCount) * 2.5;
			let barHeight;
			let x = 0;
			
			for (let i = 0; i < analyser.frequencyBinCount; i++) {
				barHeight = dataArray[i] / 4;
				
				// Use Russian flag colors for visualization
				const colorIndex = i % 3;
				if (colorIndex === 0) canvasContext.fillStyle = '#fff'; // White
				else if (colorIndex === 1) canvasContext.fillStyle = '#0039A6'; // Blue
				else canvasContext.fillStyle = '#D52B1E'; // Red
				
				canvasContext.fillRect(x, visualization.height - barHeight, barWidth, barHeight);
				x += barWidth + 1;
			}
		}
		
		// Start visualization when playing
		audioElement.addEventListener('play', () => {
			drawVisualization();
		});
	} catch (e) {
		console.warn('Audio visualization not supported:', e);
	}
}

// Load background texture if available
function loadBackgroundTexture() {
	// Create a skybox with Russian-themed background
	const skyboxGeometry = new THREE.BoxGeometry(100, 100, 100);
	
	// Use theme texture if available, otherwise create a procedural Russian-themed backdrop
	if (currentTheme.backgroundTexture) {
		const textureLoader = new THREE.TextureLoader();
		textureLoader.load(currentTheme.backgroundTexture, (texture) => {
			const materials = Array(6).fill().map(() => {
				return new THREE.MeshBasicMaterial({
					map: texture,
					side: THREE.BackSide
				});
			});
			const skybox = new THREE.Mesh(skyboxGeometry, materials);
			scene.add(skybox);
		});
	} else {
		// Create a procedural Russian-themed backdrop
		// Red gradient background with subtle pattern
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 512;
		const context = canvas.getContext('2d');
		
		// Create red gradient background
		const gradient = context.createLinearGradient(0, 0, 0, 512);
		gradient.addColorStop(0, '#3b0000');
		gradient.addColorStop(1, '#8b0000');
		context.fillStyle = gradient;
		context.fillRect(0, 0, 512, 512);
		
		// Draw decorative pattern inspired by Russian folk art
		context.strokeStyle = 'rgba(255, 215, 0, 0.2)'; // Gold with transparency
		context.lineWidth = 2;
		
		// Draw pattern of interconnected diamonds
		for (let y = 0; y < 512; y += 64) {
			for (let x = 0; x < 512; x += 64) {
				// Draw diamond pattern
				context.beginPath();
				context.moveTo(x + 32, y);
				context.lineTo(x + 64, y + 32);
				context.lineTo(x + 32, y + 64);
				context.lineTo(x, y + 32);
				context.closePath();
				context.stroke();
				
				// Draw small star in center
				if ((x + y) % 128 === 0) {
					drawStar(context, x + 32, y + 32, 5, 10, 5);
				}
			}
		}
		
		// Create texture from canvas
		const texture = new THREE.CanvasTexture(canvas);
		const materials = Array(6).fill().map(() => {
			return new THREE.MeshBasicMaterial({
				map: texture,
				side: THREE.BackSide
			});
		});
		
		const skybox = new THREE.Mesh(skyboxGeometry, materials);
		scene.add(skybox);
	}
	
	// Add snowy particle effect
	addSnowEffect();
}

// Helper function to draw a star
function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
	let rot = Math.PI / 2 * 3;
	let x = cx;
	let y = cy;
	let step = Math.PI / spikes;

	ctx.beginPath();
	ctx.moveTo(cx, cy - outerRadius);
	
	for (let i = 0; i < spikes; i++) {
		x = cx + Math.cos(rot) * outerRadius;
		y = cy + Math.sin(rot) * outerRadius;
		ctx.lineTo(x, y);
		rot += step;

		x = cx + Math.cos(rot) * innerRadius;
		y = cy + Math.sin(rot) * innerRadius;
		ctx.lineTo(x, y);
		rot += step;
	}
	
	ctx.lineTo(cx, cy - outerRadius);
	ctx.closePath();
	ctx.stroke();
}

// Add snow particle effect to create a winter atmosphere
function addSnowEffect() {
	const particleCount = 1000;
	const particles = new THREE.BufferGeometry();
	const positions = new Float32Array(particleCount * 3);
	const velocities = [];
	
	for (let i = 0; i < particleCount; i++) {
		// Random positions in a volume around the game board
		positions[i * 3] = (Math.random() - 0.5) * 60;
		positions[i * 3 + 1] = (Math.random() - 0.5) * 60;
		positions[i * 3 + 2] = Math.random() * 30 + 5;
		
		// Random falling velocity
		velocities.push({
			x: (Math.random() - 0.5) * 0.05,
			y: (Math.random() - 0.5) * 0.05,
			z: -Math.random() * 0.05 - 0.02
		});
	}
	
	particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	
	// Create particle material
	const particleMaterial = new THREE.PointsMaterial({
		color: 0xFFFFFF,
		size: 0.15,
		transparent: true,
		opacity: 0.6,
		map: createSnowflakeTexture(),
		blending: THREE.AdditiveBlending,
		depthWrite: false
	});
	
	// Create particle system
	const particleSystem = new THREE.Points(particles, particleMaterial);
	particleSystem.userData.velocities = velocities;
	particleSystem.userData.positions = positions;
	scene.add(particleSystem);
	
	// Add to animation loop
	particleSystem.userData.update = function() {
		const positions = this.userData.positions;
		const velocities = this.userData.velocities;
		
		for (let i = 0; i < particleCount; i++) {
			// Update position based on velocity
			positions[i * 3] += velocities[i].x;
			positions[i * 3 + 1] += velocities[i].y;
			positions[i * 3 + 2] += velocities[i].z;
			
			// If snowflake goes below the board, reset it to the top
			if (positions[i * 3 + 2] < -5) {
				positions[i * 3] = (Math.random() - 0.5) * 60;
				positions[i * 3 + 1] = (Math.random() - 0.5) * 60;
				positions[i * 3 + 2] = 30;
			}
		}
		
		this.geometry.attributes.position.needsUpdate = true;
	};
	
	// Store particle system for animation updates
	scene.userData.particleSystem = particleSystem;
}

// Create a snowflake texture
function createSnowflakeTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 32;
	canvas.height = 32;
	const context = canvas.getContext('2d');
	
	// Draw a simple snowflake
	context.fillStyle = '#FFFFFF';
	context.beginPath();
	context.arc(16, 16, 8, 0, Math.PI * 2, false);
	context.fill();
	
	// Add some internal structure with lines
	context.strokeStyle = '#DDDDDD';
	context.lineWidth = 1;
	
	// Draw three lines through the center at different angles
	for (let i = 0; i < 3; i++) {
		context.save();
		context.translate(16, 16);
		context.rotate(i * Math.PI / 3);
		context.beginPath();
		context.moveTo(-12, 0);
		context.lineTo(12, 0);
		context.stroke();
		context.restore();
	}
	
	const texture = new THREE.CanvasTexture(canvas);
	return texture;
}

// Load 3D model for a chess piece
function loadChessPieceModel(pieceType, callback) {
	const modelPath = getPieceModelPath(pieceType, currentTheme);
	
	// Check if model is already in cache
	if (modelCache[modelPath]) {
		callback(modelCache[modelPath].clone());
		return;
	}
	
	// Load the model
	const loader = new THREE.GLTFLoader();
	loader.load(modelPath, (gltf) => {
		const model = gltf.scene;
		
		// Scale the model appropriately
		const scale = getPieceScale(pieceType, currentTheme);
		model.scale.set(scale, scale, scale);
		
		// Cache the model for future use
		modelCache[modelPath] = model;
		
		// Return a clone for this specific instance
		callback(model.clone());
	}, undefined, (error) => {
		console.error('Error loading model:', error);
		// Fallback to simple geometry if model fails to load
		createFallbackPiece(pieceType, callback);
	});
}

// Create a simple geometry as fallback if model fails to load
function createFallbackPiece(pieceType, callback) {
	let geometry;
	
	switch(pieceType) {
		case 'pawn':
			geometry = new THREE.CylinderGeometry(0.2, 0.2, 0.6, 12);
			break;
		case 'rook':
			geometry = new THREE.BoxGeometry(0.4, 0.4, 0.8);
			break;
		case 'knight':
			geometry = new THREE.TetrahedronGeometry(0.4);
			break;
		case 'bishop':
			geometry = new THREE.ConeGeometry(0.3, 0.8, 16);
			break;
		case 'queen':
			geometry = new THREE.DodecahedronGeometry(0.4);
			break;
		case 'king':
			geometry = new THREE.CylinderGeometry(0.2, 0.3, 0.9, 16);
			break;
		default:
			geometry = new THREE.SphereGeometry(0.3);
	}
	
	const material = new THREE.MeshPhongMaterial({ color: 0xCCCCCC });
	const mesh = new THREE.Mesh(geometry, material);
	callback(mesh);
}

// Helper functions to create Russian-themed chess piece geometries
function createCathedralGeometry(height) {
	// St. Basil's Cathedral with onion domes
	const group = new THREE.Group();
	
	// Base
	const baseGeometry = new THREE.CylinderGeometry(0.35, 0.4, height * 0.3, 16);
	const baseMesh = new THREE.Mesh(baseGeometry, new THREE.MeshPhongMaterial({ color: 0xcccccc }));
	baseMesh.position.y = 0;
	group.add(baseMesh);
	
	// Main tower
	const towerGeometry = new THREE.CylinderGeometry(0.25, 0.35, height * 0.4, 16);
	const towerMesh = new THREE.Mesh(towerGeometry, new THREE.MeshPhongMaterial({ color: 0xffffff }));
	towerMesh.position.y = height * 0.35;
	group.add(towerMesh);
	
	// Create multiple onion domes
	const colors = [0xcc0000, 0x4a7fb5, 0xf0c04a, 0x42a042, 0x8e4a95];
	for (let i = 0; i < 5; i++) {
		const angle = (i / 5) * Math.PI * 2;
		const domeGeometry = createOnionDomeGeometry(height * 0.3);
		const domeMesh = new THREE.Mesh(domeGeometry, new THREE.MeshPhongMaterial({ color: colors[i % colors.length] }));
		domeMesh.position.set(
			Math.cos(angle) * 0.2,
			height * 0.6,
			Math.sin(angle) * 0.2
		);
		group.add(domeMesh);
	}
	
	// Central onion dome
	const centralDomeGeometry = createOnionDomeGeometry(height * 0.4);
	const centralDomeMesh = new THREE.Mesh(centralDomeGeometry, new THREE.MeshPhongMaterial({ color: 0xe0c35c }));
	centralDomeMesh.position.y = height * 0.6;
	group.add(centralDomeMesh);
	
	return mergeGeometriesFromGroup(group);
}

function createOnionDomeGeometry(height) {
	// Create onion dome shape
	const points = [];
	const segments = 10;
	
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		const x = 0.15 * Math.sin(t * Math.PI); // Bulge in the middle
		const y = t * height;
		points.push(new THREE.Vector2(x, y));
	}
	
	const geometry = new THREE.LatheGeometry(points, 16);
	return geometry;
}

function createTowerGeometry(height) {
	// Spasskaya Tower with golden dome
	const group = new THREE.Group();
	
	// Base
	const baseGeometry = new THREE.BoxGeometry(0.4, height * 0.5, 0.4);
	const baseMesh = new THREE.Mesh(baseGeometry, new THREE.MeshPhongMaterial({ color: 0xa52a2a }));
	baseMesh.position.y = height * 0.25;
	group.add(baseMesh);
	
	// Clock face
	const clockGeometry = new THREE.CircleGeometry(0.12, 16);
	const clockMesh = new THREE.Mesh(clockGeometry, new THREE.MeshPhongMaterial({ color: 0xffffff }));
	clockMesh.position.set(0, height * 0.35, 0.21);
	group.add(clockMesh);
	
	// Top section
	const topGeometry = new THREE.CylinderGeometry(0.2, 0.2, height * 0.2, 16);
	const topMesh = new THREE.Mesh(topGeometry, new THREE.MeshPhongMaterial({ color: 0xa52a2a }));
	topMesh.position.y = height * 0.6;
	group.add(topMesh);
	
	// Dome
	const domeGeometry = new THREE.SphereGeometry(0.2, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
	const domeMesh = new THREE.Mesh(domeGeometry, new THREE.MeshPhongMaterial({ color: 0xe0c35c }));
	domeMesh.position.y = height * 0.7;
	group.add(domeMesh);
	
	// Spire
	const spireGeometry = new THREE.ConeGeometry(0.05, height * 0.3, 8);
	const spireMesh = new THREE.Mesh(spireGeometry, new THREE.MeshPhongMaterial({ color: 0xe0c35c }));
	spireMesh.position.y = height * 0.85;
	group.add(spireMesh);
	
	return mergeGeometriesFromGroup(group);
}

function createChurchSpireGeometry(height) {
	// Orthodox church spire
	const group = new THREE.Group();
	
	// Base
	const baseGeometry = new THREE.CylinderGeometry(0.2, 0.3, height * 0.4, 16);
	const baseMesh = new THREE.Mesh(baseGeometry, new THREE.MeshPhongMaterial({ color: 0xffffff }));
	baseMesh.position.y = height * 0.2;
	group.add(baseMesh);
	
	// Mid section
	const midGeometry = new THREE.CylinderGeometry(0.15, 0.2, height * 0.3, 16);
	const midMesh = new THREE.Mesh(midGeometry, new THREE.MeshPhongMaterial({ color: 0xffffff }));
	midMesh.position.y = height * 0.55;
	group.add(midMesh);
	
	// Spire
	const spireGeometry = new THREE.ConeGeometry(0.15, height * 0.3, 16);
	const spireMesh = new THREE.Mesh(spireGeometry, new THREE.MeshPhongMaterial({ color: 0xffffff }));
	spireMesh.position.y = height * 0.85;
	group.add(spireMesh);
	
	// Cross
	const crossGroup = createOrthodoxCross(height * 0.2);
	crossGroup.position.y = height;
	group.add(crossGroup);
	
	return mergeGeometriesFromGroup(group);
}

function createOrthodoxCross(size) {
	const group = new THREE.Group();
	
	// Vertical bar
	const verticalGeometry = new THREE.BoxGeometry(0.03, size, 0.03);
	const verticalMesh = new THREE.Mesh(verticalGeometry, new THREE.MeshPhongMaterial({ color: 0xe0c35c }));
	group.add(verticalMesh);
	
	// Horizontal bar
	const horizontalGeometry = new THREE.BoxGeometry(size * 0.7, 0.03, 0.03);
	const horizontalMesh = new THREE.Mesh(horizontalGeometry, new THREE.MeshPhongMaterial({ color: 0xe0c35c }));
	horizontalMesh.position.y = size * 0.2;
	group.add(horizontalMesh);
	
	// Lower diagonal bar
	const lowerBarGeometry = new THREE.BoxGeometry(size * 0.5, 0.03, 0.03);
	const lowerBarMesh = new THREE.Mesh(lowerBarGeometry, new THREE.MeshPhongMaterial({ color: 0xe0c35c }));
	lowerBarMesh.position.y = size * -0.1;
	lowerBarMesh.rotation.z = Math.PI * 0.1;
	group.add(lowerBarMesh);
	
	return group;
}

function createBearGeometry(height) {
	// Bear with ushanka
	const group = new THREE.Group();
	
	// Body
	const bodyGeometry = new THREE.SphereGeometry(0.25, 16, 16);
	bodyGeometry.scale(1, 0.8, 0.7);
	const bodyMesh = new THREE.Mesh(bodyGeometry, new THREE.MeshPhongMaterial({ color: 0x8b4513 }));
	bodyMesh.position.y = height * 0.25;
	group.add(bodyMesh);
	
	// Head
	const headGeometry = new THREE.SphereGeometry(0.18, 16, 16);
	const headMesh = new THREE.Mesh(headGeometry, new THREE.MeshPhongMaterial({ color: 0x8b4513 }));
	headMesh.position.y = height * 0.6;
	group.add(headMesh);
	
	// Ushanka (fur hat)
	const hatGeometry = new THREE.CylinderGeometry(0.2, 0.22, 0.1, 16);
	const hatMesh = new THREE.Mesh(hatGeometry, new THREE.MeshPhongMaterial({ color: 0x444444 }));
	hatMesh.position.y = height * 0.7;
	group.add(hatMesh);
	
	// Ear flaps
	const earFlapGeometry = new THREE.BoxGeometry(0.1, 0.15, 0.05);
	
	const leftEarMesh = new THREE.Mesh(earFlapGeometry, new THREE.MeshPhongMaterial({ color: 0x444444 }));
	leftEarMesh.position.set(-0.18, height * 0.65, 0);
	group.add(leftEarMesh);
	
	const rightEarMesh = new THREE.Mesh(earFlapGeometry, new THREE.MeshPhongMaterial({ color: 0x444444 }));
	rightEarMesh.position.set(0.18, height * 0.65, 0);
	group.add(rightEarMesh);
	
	// Eyes
	const eyeGeometry = new THREE.SphereGeometry(0.03, 8, 8);
	const eyeMaterial = new THREE.MeshPhongMaterial({ color: 0x000000 });
	
	const leftEyeMesh = new THREE.Mesh(eyeGeometry, eyeMaterial);
	leftEyeMesh.position.set(-0.08, height * 0.63, 0.15);
	group.add(leftEyeMesh);
	
	const rightEyeMesh = new THREE.Mesh(eyeGeometry, eyeMaterial);
	rightEyeMesh.position.set(0.08, height * 0.63, 0.15);
	group.add(rightEyeMesh);
	
	// Snout
	const snoutGeometry = new THREE.SphereGeometry(0.08, 16, 16);
	snoutGeometry.scale(1, 0.7, 1.2);
	const snoutMesh = new THREE.Mesh(snoutGeometry, new THREE.MeshPhongMaterial({ color: 0x8b4513 }));
	snoutMesh.position.set(0, height * 0.57, 0.15);
	group.add(snoutMesh);
	
	return mergeGeometriesFromGroup(group);
}

function createBrutalistTowerGeometry(height) {
	// Soviet brutalist tower/monument
	const group = new THREE.Group();
	
	// Base
	const baseGeometry = new THREE.BoxGeometry(0.5, height * 0.2, 0.5);
	const baseMesh = new THREE.Mesh(baseGeometry, new THREE.MeshPhongMaterial({ color: 0x777777 }));
	baseMesh.position.y = height * 0.1;
	group.add(baseMesh);
	
	// Middle section
	const midGeometry = new THREE.BoxGeometry(0.4, height * 0.6, 0.4);
	const midMesh = new THREE.Mesh(midGeometry, new THREE.MeshPhongMaterial({ color: 0x999999 }));
	midMesh.position.y = height * 0.5;
	group.add(midMesh);
	
	// Top section
	const topGeometry = new THREE.BoxGeometry(0.5, height * 0.2, 0.3);
	const topMesh = new THREE.Mesh(topGeometry, new THREE.MeshPhongMaterial({ color: 0x777777 }));
	topMesh.position.y = height * 0.9;
	group.add(topMesh);
	
	// Soviet star
	const starGeometry = createSovietStarGeometry(height * 0.15);
	const starMesh = new THREE.Mesh(starGeometry, new THREE.MeshPhongMaterial({ color: 0xe0c35c }));
	starMesh.position.y = height;
	group.add(starMesh);
	
	return mergeGeometriesFromGroup(group);
}

function createSovietStarGeometry(size) {
	const shape = new THREE.Shape();
	const points = 5;
	const outerRadius = size;
	const innerRadius = size * 0.4;
	
	for (let i = 0; i < points * 2; i++) {
		const radius = i % 2 === 0 ? outerRadius : innerRadius;
		const angle = (i / points) * Math.PI;
		const x = Math.sin(angle) * radius;
		const y = Math.cos(angle) * radius;
		
		if (i === 0) {
			shape.moveTo(x, y);
		} else {
			shape.lineTo(x, y);
		}
	}
	
	shape.closePath();
	
	const extrudeSettings = {
		depth: size * 0.1,
		bevelEnabled: false
	};
	
	const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
	return geometry;
}

function createUshankaFigureGeometry(height) {
	// Figure with ushanka hat (Russian fur hat)
	const group = new THREE.Group();
	
	// Body
	const bodyGeometry = new THREE.CylinderGeometry(0.15, 0.2, height * 0.6, 16);
	const bodyMesh = new THREE.Mesh(bodyGeometry, new THREE.MeshPhongMaterial({ color: 0x444444 }));
	bodyMesh.position.y = height * 0.3;
	group.add(bodyMesh);
	
	// Head
	const headGeometry = new THREE.SphereGeometry(0.15, 16, 16);
	const headMesh = new THREE.Mesh(headGeometry, new THREE.MeshPhongMaterial({ color: 0xd2b48c }));
	headMesh.position.y = height * 0.7;
	group.add(headMesh);
	
	// Ushanka (fur hat)
	const hatGeometry = new THREE.CylinderGeometry(0.18, 0.2, 0.1, 16);
	const hatMesh = new THREE.Mesh(hatGeometry, new THREE.MeshPhongMaterial({ color: 0x444444 }));
	hatMesh.position.y = height * 0.8;
	group.add(hatMesh);
	
	// Ear flaps
	const earFlapGeometry = new THREE.BoxGeometry(0.1, 0.12, 0.05);
	
	const leftEarMesh = new THREE.Mesh(earFlapGeometry, new THREE.MeshPhongMaterial({ color: 0x444444 }));
	leftEarMesh.position.set(-0.15, height * 0.75, 0);
	group.add(leftEarMesh);
	
	const rightEarMesh = new THREE.Mesh(earFlapGeometry, new THREE.MeshPhongMaterial({ color: 0x444444 }));
	rightEarMesh.position.set(0.15, height * 0.75, 0);
	group.add(rightEarMesh);
	
	return mergeGeometriesFromGroup(group);
}

// Helper function to merge geometries from a group
function mergeGeometriesFromGroup(group) {
	const geometries = [];
	const matrices = [];
	
	group.updateMatrixWorld(true);
	
	group.traverse((child) => {
		if (child.geometry) {
			geometries.push(child.geometry);
			
			const matrix = new THREE.Matrix4();
			matrix.copy(child.matrixWorld);
			matrices.push(matrix);
		}
	});
	
	if (geometries.length === 0) {
		return new THREE.BufferGeometry();
	}
	
	// If only one geometry, return it directly
	if (geometries.length === 1) {
		const clonedGeometry = geometries[0].clone();
		clonedGeometry.applyMatrix4(matrices[0]);
		return clonedGeometry;
	}
	
	// Create a dummy buffer geometry as this is just a placeholder
	// In a real implementation, you would merge the geometries properly
	const mergedGeometry = new THREE.BufferGeometry();
	const positions = [];
	const normals = [];
	
	geometries.forEach((geometry, index) => {
		const matrix = matrices[index];
		const positionAttribute = geometry.attributes.position;
		const normalAttribute = geometry.attributes.normal;
		
		for (let i = 0; i < positionAttribute.count; i++) {
			const vertex = new THREE.Vector3();
			vertex.fromBufferAttribute(positionAttribute, i);
			vertex.applyMatrix4(matrix);
			positions.push(vertex.x, vertex.y, vertex.z);
			
			if (normalAttribute) {
				const normal = new THREE.Vector3();
				normal.fromBufferAttribute(normalAttribute, i);
				normal.transformDirection(matrix);
				normals.push(normal.x, normal.y, normal.z);
			}
		}
	});
	
	mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	if (normals.length > 0) {
		mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
	}
	
	return mergedGeometry;
}

// Create a tetromino mesh
function createTetromino(piece) {
	const group = new THREE.Group();
	
	// Get Russian-themed colors for Tetris pieces
	const tetrominoColors = currentTheme.tetrisColors || [
		0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff
	];
	
	// Use theme color or provided color
	const color = piece.color || tetrominoColors[piece.type.charCodeAt(0) % tetrominoColors.length];
	
	// Create a mesh for each block of the tetromino
	piece.blocks.forEach(block => {
		const mesh = new THREE.Mesh(
			cellGeometry,
			new THREE.MeshPhongMaterial({
				color: color,
				shininess: 30,
				transparent: true,
				opacity: 0.9 // Slightly transparent
			})
		);
		
		mesh.position.set(
			piece.x + block.x + CELL_SIZE/2,
			piece.y + block.y + CELL_SIZE/2,
			piece.z + CELL_HEIGHT/2
		);
		
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		
		// Add Soviet style detail on top of block
		if (Math.random() > 0.7) {
			const starSize = 0.2;
			const starGeometry = createSovietStarGeometry(starSize);
			const starMaterial = new THREE.MeshPhongMaterial({ color: 0xe0c35c }); // Gold color
			const starMesh = new THREE.Mesh(starGeometry, starMaterial);
			starMesh.rotation.x = -Math.PI / 2; // Face upward
			starMesh.position.set(0, 0, CELL_HEIGHT/2 + 0.01); // Just above the block
			mesh.add(starMesh);
		}
		
		// If the piece has a sponsor, add an indicator
		if (piece.sponsor && block === piece.blocks[0]) {
			const sponsorIndicator = new THREE.Mesh(
				new THREE.PlaneGeometry(CELL_SIZE * 0.8, CELL_SIZE * 0.8),
				new THREE.MeshBasicMaterial({
					color: 0xffffff,
					transparent: true,
					opacity: 0.8
				})
			);
			sponsorIndicator.position.z = CELL_HEIGHT/2 + 0.01;
			sponsorIndicator.rotation.x = -Math.PI / 2;
			mesh.add(sponsorIndicator);
		}
		
		// If the piece has a potion, add an indicator
		if (piece.potion && piece.potion.blockIndex === piece.blocks.indexOf(block)) {
			const potionIndicator = new THREE.Mesh(
				new THREE.SphereGeometry(CELL_SIZE * 0.3, 16, 16),
				new THREE.MeshPhongMaterial({
					color: 0x9932cc,
					transparent: true,
					opacity: 0.8,
					emissive: 0x9932cc,
					emissiveIntensity: 0.5
				})
			);
			potionIndicator.position.z = CELL_HEIGHT/2 + 0.1;
			mesh.add(potionIndicator);
		}
		
		group.add(mesh);
	});
	
	return group;
}

// ----- Marketplace Placeholder -----
// This function has been refactored to public/js/ui/marketplaceUI.js
// setupMarketplaceUI() function removed

// ----- Payment UI -----
// This function has been refactored to public/js/ui/marketplaceUI.js
// setupPaymentUI() function removed

// This function has been refactored to public/js/ui/marketplaceUI.js
// enhanceSolanaPaymentUI() function removed

// This function has been refactored to public/js/ui/marketplaceUI.js
// async function updateTokenBalance() removed
