/** @jest-environment node */
/**
 * Socket integration (golden path)
 *
 * Verifies the live socket server can:
 * - accept a connection + join the global game
 * - accept a valid first tetromino placement (adjacent to home zone)
 * - emit a delta `game_update` after subsequent actions
 * - accept a valid chess move (king step onto newly created territory)
 */

const { spawn } = require('child_process');
const path = require('path');

const { io } = require('socket.io-client');

function waitFor(conditionFn, timeoutMs = 8000, intervalMs = 50) {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		
		const tick = () => {
			try {
				const result = conditionFn();
				if (result) {
					resolve(result);
					return;
				}
			} catch (e) {
				// Ignore and keep waiting
			}
			
			if (Date.now() - start > timeoutMs) {
				reject(new Error('Timed out waiting for condition'));
				return;
			}
			
			setTimeout(tick, intervalMs);
		};
		
		tick();
	});
}

function parseServerPortFromOutput(output) {
	const match = output.match(/Tetches server running on port\s+(\d+)/i);
	if (!match) return null;
	return Number(match[1]);
}

describe('socket golden path', () => {
	jest.setTimeout(20000);
	
	let serverProcess = null;
	let serverPort = null;
	
	beforeAll(async () => {
		const projectRoot = path.resolve(__dirname, '..', '..');
		
		serverProcess = spawn('node', ['server.js'], {
			cwd: projectRoot,
			env: {
				...process.env,
				NODE_ENV: 'test',
				PORT: '0'
			},
			stdio: ['ignore', 'pipe', 'pipe']
		});
		
		let stdout = '';
		let stderr = '';
		
		serverProcess.stdout.on('data', (buf) => {
			stdout += buf.toString('utf8');
			const port = parseServerPortFromOutput(stdout);
			if (port && !serverPort) {
				serverPort = port;
			}
		});
		
		serverProcess.stderr.on('data', (buf) => {
			stderr += buf.toString('utf8');
		});
		
		await waitFor(() => serverPort, 10000);
		
		// Basic sanity: server should not have crashed on boot
		expect(serverProcess.exitCode).toBe(null);
		expect(serverPort).toBeGreaterThan(0);
	});
	
	afterAll(async () => {
		if (serverProcess && serverProcess.exitCode === null) {
			serverProcess.kill('SIGTERM');
		}
	});
	
	test('join -> place tetromino -> delta update -> chess move', async () => {
		const socket = io(`http://localhost:${serverPort}`, {
			transports: ['websocket'],
			timeout: 5000
		});
		
		const receivedGameUpdates = [];
		socket.on('game_update', (data) => receivedGameUpdates.push(data));
		
		const playerId = await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Timed out waiting for player_id')), 5000);
			
			socket.on('player_id', (id) => {
				clearTimeout(timeout);
				resolve(id);
			});
		});
		
		const joinResponse = await new Promise((resolve, reject) => {
			socket.emit('join_game', { playerName: 'SocketTest' }, (res) => {
				if (!res) {
					reject(new Error('No join_game response'));
					return;
				}
				resolve(res);
			});
		});
		
		expect(joinResponse.success).toBe(true);
		expect(joinResponse.playerId).toBe(playerId);
		expect(joinResponse.gameId).toBeTruthy();
		expect(joinResponse.gameState).toBeTruthy();
		expect(joinResponse.gameState.board).toBeTruthy();
		expect(joinResponse.gameState.board.cells).toBeTruthy();
		
		// Find local king
		const myPieces = (joinResponse.gameState.chessPieces || []).filter(p =>
			p && String(p.player) === String(playerId)
		);
		const king = myPieces.find(p => String(p.type).toUpperCase() === 'KING');
		expect(king).toBeTruthy();
		expect(king.position).toBeTruthy();
		
		const kingX = king.position.x;
		const kingZ = king.position.z;
		
		// Try placing an O tetromino near the king until the server accepts it
		const O_SHAPE = [[1, 1], [1, 1]];
		
		let placedTopLeft = null;
		let adjacentTarget = null;
		
		for (let dx = -2; dx <= 2 && !placedTopLeft; dx++) {
			for (let dz = -2; dz <= 2 && !placedTopLeft; dz++) {
				const x = kingX + dx;
				const z = kingZ + dz;
				
				// Pick a target square adjacent to the king from this O placement
				const blocks = [
					{ x: x, z: z },
					{ x: x + 1, z: z },
					{ x: x, z: z + 1 },
					{ x: x + 1, z: z + 1 }
				];
				
				const candidateAdjacent = blocks.find(b => (
					Math.abs(b.x - kingX) <= 1 && Math.abs(b.z - kingZ) <= 1 &&
					!(b.x === kingX && b.z === kingZ)
				));
				
				if (!candidateAdjacent) continue;
				
				const tetromino = {
					pieceType: 'O',
					type: 'O',
					rotation: 0,
					shape: O_SHAPE,
					position: { x, z }
				};
				
				// eslint-disable-next-line no-await-in-loop
				const placementResponse = await new Promise((resolve) => {
					socket.emit('tetromino_placed', { tetromino }, resolve);
				});
				
				if (placementResponse && placementResponse.success) {
					placedTopLeft = { x, z };
					adjacentTarget = candidateAdjacent;
					break;
				}
			}
		}
		
		expect(placedTopLeft).toBeTruthy();
		expect(adjacentTarget).toBeTruthy();
		
		// Wait for at least one fullUpdate to seed the delta cache
		await waitFor(() => receivedGameUpdates.find(u => u && u.fullUpdate === true), 8000);
		
		// Move the king onto the newly created square (should be valid: 1-step move)
		const chessMoveResponse = await new Promise((resolve) => {
			socket.emit('chess_move', {
				pieceId: king.id,
				targetPosition: { x: adjacentTarget.x, z: adjacentTarget.z }
			}, resolve);
		});
		
		expect(chessMoveResponse).toBeTruthy();
		expect(chessMoveResponse.success).toBe(true);
		
		// Wait for a delta update (fullUpdate false) after the move
		const deltaUpdate = await waitFor(
			() => receivedGameUpdates.find(u => u && u.fullUpdate === false && Array.isArray(u.boardChanges)),
			8000
		);
		
		expect(deltaUpdate).toBeTruthy();
		expect(deltaUpdate.fullUpdate).toBe(false);
		
		socket.disconnect();
	});
});


