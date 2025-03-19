// Global variables for game state
let scene, camera, renderer, controls;
let boardGroup, tetrominoGroup, ghostGroup;
let board = [];
let activeTetromino = null;
let tetrominoPhysics = null;

// Import the TetrominoPhysics class
import { TetrominoPhysics } from './physics/tetromino.js';

// Main initialization function
async function initializePhysicsTest() {
	console.log('Initializing physics test environment...');
	
	// Initialize renderer
	const gameContainer = document.getElementById('game-container');
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setClearColor(0x1e293b); // Dark blue background
	gameContainer.appendChild(renderer.domElement);
	
	// Set up scene
	scene = new THREE.Scene();
	
	// Create camera
	camera = new THREE.PerspectiveCamera(
		75,
		window.innerWidth / window.innerHeight,
		0.1,
		1000
	);
	camera.position.set(25, 30, 25);
	camera.lookAt(new THREE.Vector3(15, 0, 15));
	
	// Set up controls - handle different OrbitControls possibilities
	console.log('Setting up camera controls...');
	try {
		if (typeof THREE.OrbitControls === 'function') {
			console.log('Using THREE.OrbitControls');
			controls = new THREE.OrbitControls(camera, renderer.domElement);
		} else if (typeof OrbitControls === 'function') {
			console.log('Using global OrbitControls');
			controls = new OrbitControls(camera, renderer.domElement);
		} else {
			console.warn('OrbitControls not found, camera controls disabled');
			// Create basic controls functionality
			controls = {
				target: new THREE.Vector3(15, 0, 15),
				update: function() { return false; }
			};
		}
		
		controls.target.set(15, 0, 15);
		controls.update();
	} catch (error) {
		console.error('Error setting up camera controls:', error);
		// Create basic controls functionality
		controls = {
			target: new THREE.Vector3(15, 0, 15),
			update: function() { return false; }
		};
	}
	
	// Create groups
	boardGroup = new THREE.Group();
	scene.add(boardGroup);
	
	tetrominoGroup = new THREE.Group();
	scene.add(tetrominoGroup);
	
	ghostGroup = new THREE.Group();
	scene.add(ghostGroup);
	
	// Add lighting
	addLighting();
	
	// Initialize a basic renderer object that our physics class can use
	const basicRenderer = {
		scene: scene,
		updateBoard: updateBoard,
		getTetrominoRenderer: () => null // We'll let the class create its own
	};
	
	// Initialize the physics engine
	console.log('Creating TetrominoPhysics instance...');
	tetrominoPhysics = new TetrominoPhysics(basicRenderer);
	
	try {
		console.log('Initializing physics engine...');
		await tetrominoPhysics.init();
		console.log('Physics engine initialized successfully');
		
		// Set up debug panel
		setupDebugPanel();
		
		// Set up control instructions
		setupControlsHelp();
		
		// Remove loading message
		const loadingMessage = document.getElementById('loading-message');
		if (loadingMessage) {
			loadingMessage.style.display = 'none';
		}
	} catch (error) {
		console.error('Failed to initialize physics engine:', error);
		document.getElementById('loading-message').textContent = 'Error initializing physics engine. Check console for details.';
	}
	
	// Start animation loop
	animate();
	
	// Handle window resize
	window.addEventListener('resize', onWindowResize);
}

// Function to add lighting to the scene
function addLighting() {
	// Add ambient light
	const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
	scene.add(ambientLight);
	
	// Add directional light (simulating sun)
	const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
	dirLight.position.set(20, 30, 20);
	dirLight.castShadow = true;
	
	// Configure shadow properties
	dirLight.shadow.mapSize.width = 2048;
	dirLight.shadow.mapSize.height = 2048;
	dirLight.shadow.camera.near = 0.5;
	dirLight.shadow.camera.far = 100;
	dirLight.shadow.camera.left = -30;
	dirLight.shadow.camera.right = 30;
	dirLight.shadow.camera.top = 30;
	dirLight.shadow.camera.bottom = -30;
	
	scene.add(dirLight);
	
	// Add a point light for extra illumination
	const pointLight = new THREE.PointLight(0x2196F3, 0.5);
	pointLight.position.set(15, 15, 15);
	scene.add(pointLight);
}

// Render loop
function animate() {
	requestAnimationFrame(animate);
	
	// Only update camera controls, physics is handled in the physics class
	if (controls && typeof controls.update === 'function') {
		controls.update();
	}
	
	// Update debug panel
	updateDebugPanel();
	
	// Render scene
	renderer.render(scene, camera);
}

// Set up debug panel controls
function setupDebugPanel() {
	const debugPanel = document.getElementById('debug-panel');
	if (!debugPanel) return;
	
	// Clear existing buttons
	debugPanel.innerHTML = '<h3>Physics Test Controls</h3>';
	
	// Camera controls group
	const cameraGroup = document.createElement('div');
	cameraGroup.className = 'control-group';
	cameraGroup.innerHTML = '<div id="camera-info">Camera: default view</div>';
	
	// Add camera view toggle button
	const viewButton = document.createElement('button');
	viewButton.textContent = 'Toggle View';
	viewButton.onclick = () => tetrominoPhysics.toggleCamera();
	cameraGroup.appendChild(viewButton);
	
	debugPanel.appendChild(cameraGroup);
	
	// Tetromino controls group
	const tetrominoGroup = document.createElement('div');
	tetrominoGroup.className = 'control-group';
	
	// Add button to spawn a tetromino
	const spawnButton = document.createElement('button');
	spawnButton.textContent = 'Spawn Tetromino';
	spawnButton.onclick = () => tetrominoPhysics.spawnTetromino();
	tetrominoGroup.appendChild(spawnButton);
	
	// Add button to throw a tetromino
	const throwButton = document.createElement('button');
	throwButton.textContent = 'Throw Tetromino';
	throwButton.onclick = () => {
		tetrominoPhysics.spawnTetromino();
		tetrominoPhysics.applyRandomForce();
	};
	tetrominoGroup.appendChild(throwButton);
	
	// Add button to spawn multiple tetrominos
	const spawnMultipleButton = document.createElement('button');
	spawnMultipleButton.textContent = 'Spawn 5 Tetrominos';
	spawnMultipleButton.onclick = () => tetrominoPhysics.spawnMultipleTetrominos(5);
	tetrominoGroup.appendChild(spawnMultipleButton);
	
	debugPanel.appendChild(tetrominoGroup);
	
	// Test controls group
	const testGroup = document.createElement('div');
	testGroup.className = 'control-group';
	
	// Add button to test collisions
	const collisionButton = document.createElement('button');
	collisionButton.textContent = 'Test Collisions';
	collisionButton.onclick = () => tetrominoPhysics.testCollision();
	testGroup.appendChild(collisionButton);
	
	// Add button to test sticking behavior
	const stickButton = document.createElement('button');
	stickButton.textContent = 'Test Sticking';
	stickButton.onclick = () => tetrominoPhysics.testSticking();
	testGroup.appendChild(stickButton);
	
	// Add reset button
	const resetButton = document.createElement('button');
	resetButton.textContent = 'Reset Board';
	resetButton.onclick = () => tetrominoPhysics.resetBoard();
	testGroup.appendChild(resetButton);
	
	debugPanel.appendChild(testGroup);
	
	// Add controls info
	const controlsInfo = document.createElement('div');
	controlsInfo.id = 'controls-info';
	controlsInfo.innerHTML = `
		<p>Keyboard Controls:</p>
		<ul>
			<li>Arrow keys to move</li>
			<li>Space to drop faster</li>
			<li>R to rotate tetromino</li>
			<li>V to toggle camera view</li>
		</ul>
		<p class="small-text">Check console (F12) for detailed logs</p>
	`;
	debugPanel.appendChild(controlsInfo);
}

// Helper function to update debug panel with current state
function updateDebugPanel() {
	const physicsDebug = document.querySelector('.physics-debug');
	if (!physicsDebug) return;
	
	// Get current active tetromino from physics engine
	if (!tetrominoPhysics || !tetrominoPhysics.activeTetromino) {
		physicsDebug.innerHTML = 'No active tetromino';
		return;
	}
	
	const activeTetromino = tetrominoPhysics.activeTetromino;
	const velocity = tetrominoPhysics.velocity;
	
	// Update debug info
	physicsDebug.innerHTML = `
		Position: (${activeTetromino.position.x.toFixed(2)}, ${activeTetromino.position.y.toFixed(2)}, ${activeTetromino.position.z.toFixed(2)})<br>
		Velocity: (${velocity.x.toFixed(4)}, ${velocity.y.toFixed(4)}, ${velocity.z.toFixed(4)})
	`;
}

// Update board based on given board configuration
function updateBoard(boardConfig) {
	// Clear existing board
	while (boardGroup.children.length > 0) {
		const child = boardGroup.children[0];
		boardGroup.remove(child);
		if (child.geometry) child.geometry.dispose();
		if (child.material) child.material.dispose();
	}
	
	// Create new board geometry
	const boardSize = boardConfig.length;
	for (let z = 0; z < boardSize; z++) {
		for (let x = 0; x < boardSize; x++) {
			const cell = boardConfig[z][x];
			if (cell && cell.active) {
				// Create cell mesh
				const geometry = new THREE.BoxGeometry(1, 1, 1);
				const material = new THREE.MeshPhongMaterial({
					color: cell.color || 0x42A5F5,
					shininess: 50
				});
				
				// Create block mesh
				const cellMesh = new THREE.Mesh(geometry, material);
				cellMesh.position.set(x, 0, z);
				
				// Add wireframe 
				const wireframe = new THREE.LineSegments(
					new THREE.WireframeGeometry(geometry),
					new THREE.LineBasicMaterial({ 
						color: 0xffffff, 
						transparent: true, 
						opacity: 0.15
					})
				);
				cellMesh.add(wireframe);
				
				boardGroup.add(cellMesh);
			}
		}
	}
}

// Set up control instructions panel
function setupControlsHelp() {
	const controlsHelp = document.getElementById('controls-help');
	if (!controlsHelp) {
		// Create controls help panel if it doesn't exist
		const panel = document.createElement('div');
		panel.id = 'controls-help';
		panel.innerHTML = `
			<h4>Keyboard Controls</h4>
			<div><span class="key">←</span><span class="key">→</span> Move left/right</div>
			<div><span class="key">↑</span><span class="key">↓</span> Move forward/backward</div>
			<div><span class="key">Space</span> Drop faster</div>
			<div><span class="key">R</span> Rotate tetromino</div>
			<div><span class="key">V</span> Toggle camera view</div>
		`;
		document.body.appendChild(panel);
	}
}

// Handle window resize
function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

// Export initialize function for use in the HTML
export function init() {
	console.log('Physics test init called');
	
	// Log environment info for debugging
	console.log('THREE:', typeof THREE);
	console.log('OrbitControls directly:', typeof OrbitControls);
	console.log('THREE.OrbitControls:', typeof THREE.OrbitControls);
	
	// Check THREE.js
	if (typeof THREE === 'undefined') {
		console.error('THREE is not defined');
		document.getElementById('loading-message').textContent = 'Error: THREE.js not loaded';
		return false;
	}
	
	// Start initialization
	initializePhysicsTest().catch(error => {
		console.error('Error during initialization:', error);
	});
	
	return true;
} 