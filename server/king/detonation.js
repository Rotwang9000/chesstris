/**
 * King detonation — both the automatic "lone-king" suicide (when a player
 * is reduced to a solo king and chooses or is forced to self-destruct) and
 * the player-initiated voluntary king detonation share this flow.
 *
 * Visual contract with clients (Lemmings-style):
 *
 *   1. Server emits `king_detonation` with the full `explosionSequence`
 *      (layered by BFS distance from the king through owned cells, sorted
 *      furthest-first) and `layerIntervalMs`.
 *   2. Server then removes one layer per `layerIntervalMs` tick, broadcasting
 *      a game-state update and an incremental `king_detonation_layer` event
 *      after each layer. The king's own cell is the *last* to go.
 *   3. After the final layer the king is spliced from `chessPieces` and the
 *      player is marked eliminated; the caller's `onComplete` callback fires.
 *
 * This module deliberately does not own respawn or capture-aftermath logic —
 * the AI runner schedules the bot's respawn, and the chess-move flow handles
 * what happens after a regular capture. Detonation only cares about the
 * visible "boom" and the resulting board state.
 */

const World = require('../world/World');
const pieces = require('../game/pieces');

const DEFAULT_LAYER_INTERVAL_MS = 500;

/**
 * BFS from `(kx, kz)` outwards through `playerId`'s owned cells, recording
 * the orthogonal step count for each cell. Cells with no recorded distance
 * (e.g. stale orphans on the wrong island) are assigned a fallback so they
 * still explode — they sort last, after the connected portion.
 *
 * @param {Object} game
 * @param {string} playerId
 * @param {number} kx
 * @param {number} kz
 * @returns {Array<{x:number,z:number,distance:number}>}
 */
function computeExplosionSequence(game, playerId, kx, kz) {
	const ownedCells = [];
	const ownedSet = new Set();
	for (const [key, contents] of Object.entries(game.board.cells)) {
		if (!Array.isArray(contents) || contents.length === 0) continue;
		const ownsHere = contents.some(item => item && String(item.player) === String(playerId));
		if (!ownsHere) continue;
		const [xStr, zStr] = key.split(',');
		const x = Number(xStr);
		const z = Number(zStr);
		if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
		ownedCells.push({ x, z });
		ownedSet.add(`${x},${z}`);
	}

	const distance = new Map();
	if (ownedSet.has(`${kx},${kz}`)) {
		distance.set(`${kx},${kz}`, 0);
		const queue = [{ x: kx, z: kz, d: 0 }];
		while (queue.length > 0) {
			const cur = queue.shift();
			for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				const nx = cur.x + dx;
				const nz = cur.z + dz;
				const k = `${nx},${nz}`;
				if (!ownedSet.has(k) || distance.has(k)) continue;
				distance.set(k, cur.d + 1);
				queue.push({ x: nx, z: nz, d: cur.d + 1 });
			}
		}
	}

	let maxConnected = 0;
	for (const d of distance.values()) if (d > maxConnected) maxConnected = d;

	const sequence = ownedCells.map(cell => {
		const key = `${cell.x},${cell.z}`;
		if (distance.has(key)) {
			return { x: cell.x, z: cell.z, distance: distance.get(key) };
		}
		// Disconnected remnants explode after the connected ring, in
		// Manhattan order so the visual cascade still feels coherent.
		const manhattan = Math.abs(cell.x - kx) + Math.abs(cell.z - kz);
		return { x: cell.x, z: cell.z, distance: maxConnected + 1 + manhattan };
	}).sort((a, b) => {
		if (a.distance !== b.distance) return b.distance - a.distance;
		if (a.x !== b.x) return a.x - b.x;
		return a.z - b.z;
	});

	return sequence;
}

/**
 * Group an explosion sequence into ordered layers. Returns `[ [cells…], … ]`
 * where layer 0 is the *first* batch to explode (the furthest ring).
 */
function groupSequenceIntoLayers(sequence) {
	const layerMap = new Map();
	for (const cell of sequence) {
		if (!layerMap.has(cell.distance)) layerMap.set(cell.distance, []);
		layerMap.get(cell.distance).push(cell);
	}
	const distancesDesc = [...layerMap.keys()].sort((a, b) => b - a);
	return distancesDesc.map(d => layerMap.get(d));
}

function createKingDetonationService({ io, gameManager, broadcaster, integrityService, persistence, activityLog = null }) {
	if (!io) throw new Error('createKingDetonationService: io required');
	if (!gameManager) throw new Error('createKingDetonationService: gameManager required');
	if (!broadcaster) throw new Error('createKingDetonationService: broadcaster required');
	if (!integrityService) throw new Error('createKingDetonationService: integrityService required');
	if (!persistence) throw new Error('createKingDetonationService: persistence required');

	function recordCollateralPieceLosses(world, playerId, exceptKingId) {
		if (!activityLog) return;
		if (!world || !Array.isArray(world.chessPieces)) return;
		const others = world.chessPieces.filter(
			p => p && String(p.player) === String(playerId) && String(p.id) !== String(exceptKingId)
		);
		for (const piece of others) {
			try {
				pieces.removePiece(world, piece, {
					reason: pieces.REMOVAL_REASONS.KING_DETONATION_COLLATERAL,
					activityLog,
				});
			} catch (err) {
				console.warn('[KingDetonation] collateral cleanup failed:', err.message);
			}
		}
	}

	function recordDetonationStart(world, playerId, reason, pos) {
		if (!activityLog) return;
		try {
			const player = world && world.players ? world.players[playerId] : null;
			activityLog.recordKingDetonation({
				playerId,
				playerName: (player && (player.username || player.name)) || playerId,
				reason: reason || 'self_destruct',
				x: pos && Number.isFinite(pos.x) ? pos.x : null,
				z: pos && Number.isFinite(pos.z) ? pos.z : null,
			});
		} catch (err) {
			console.warn('[KingDetonation] activity log failed:', err.message);
		}
	}

	/**
	 * Schedule a lemming-style king detonation. Returns metadata
	 * (`explosionSequence`, `layerIntervalMs`) synchronously so the caller
	 * can also include it in its own callback / response.
	 *
	 * @param {Object} opts
	 * @param {string} opts.playerId           Owner of the king being detonated.
	 * @param {string} opts.kingPieceId        Chess piece ID for the king.
	 * @param {string} [opts.reason]           For logging ("lone_king" / "self_destruct" / etc.)
	 * @param {number} [opts.layerIntervalMs]
	 * @param {Function} [opts.onComplete]     Called once the final layer
	 *                                         finishes. Receives `{ playerId }`.
	 */
	function detonateKing({
		playerId,
		kingPieceId,
		reason = 'self_destruct',
		layerIntervalMs = DEFAULT_LAYER_INTERVAL_MS,
		onComplete,
	}) {
		const world = World.getWorld();
		if (!world || !world.board || !Array.isArray(world.chessPieces)) {
			return { success: false, error: 'invalid_world' };
		}

		const king = world.chessPieces.find(p =>
			p && String(p.id) === String(kingPieceId)
			&& String(p.player) === String(playerId)
			&& String(p.type || '').toUpperCase() === 'KING'
		);
		if (!king) return { success: false, error: 'king_not_found' };

		const kx = king.position?.x;
		const kz = king.position?.z;
		if (!Number.isFinite(kx) || !Number.isFinite(kz)) {
			return { success: false, error: 'invalid_king_position' };
		}

		recordDetonationStart(world, playerId, reason, { x: kx, z: kz });

		const explosionSequence = computeExplosionSequence(world, playerId, kx, kz);
		if (explosionSequence.length === 0) {
			// Nothing to explode (the king has been stripped of supporting
			// terrain entirely). Just remove the piece and tell the world.
			// The `king_detonation` event already carries the meaning;
			// suppress the per-piece event for the king itself.
			recordCollateralPieceLosses(world, playerId, king.id);
			pieces.removePiece(world, king, {
				reason: pieces.REMOVAL_REASONS.DETONATED,
				silent: true,
			});
			delete world.board.cells[`${kx},${kz}`];
			gameManager.boardManager.recalculateBoardBoundaries(world.board);
			integrityService.runIslandIntegrityPass({ emitAnimation: false });
			World.markDirty();
			persistence.markDirty();
			broadcaster.broadcastGameUpdate({ forceFullUpdate: true });
			io.to(world.id).emit('king_detonation', {
				playerId,
				pieceId: kingPieceId,
				reason,
				detonatedAt: { x: kx, z: kz },
				explosionSequence: [],
				layerIntervalMs,
			});
			if (typeof onComplete === 'function') onComplete({ playerId });
			return { success: true, explosionSequence: [], layerIntervalMs, endedGame: true };
		}

		const layers = groupSequenceIntoLayers(explosionSequence);

		console.log(
			`[KingDetonation] ${playerId}'s king (${kingPieceId}) detonating ` +
			`(${reason}); ${explosionSequence.length} cells across ${layers.length} layers.`
		);

		// Announce the full sequence up-front so the client can pre-stage
		// animations even if a `game_update` arrives before its layer event.
		io.to(world.id).emit('king_detonation', {
			playerId,
			pieceId: kingPieceId,
			reason,
			detonatedAt: { x: kx, z: kz },
			explosionSequence,
			layerIntervalMs,
		});

		let layerIdx = 0;
		const processNextLayer = () => {
			const liveWorld = World.getWorld();
			if (!liveWorld) return;

			if (layerIdx >= layers.length) {
				recordCollateralPieceLosses(liveWorld, playerId, king.id);
				pieces.removePiece(liveWorld, king, {
					reason: pieces.REMOVAL_REASONS.DETONATED,
					silent: true,
				});

				gameManager.boardManager.recalculateBoardBoundaries(liveWorld.board);
				integrityService.runIslandIntegrityPass({ emitAnimation: false });
				World.markDirty();
				persistence.markDirty();
				broadcaster.broadcastGameUpdate({ forceFullUpdate: true });
				console.log(`[KingDetonation] ${playerId}'s king detonation complete.`);
				if (typeof onComplete === 'function') onComplete({ playerId });
				return;
			}

			const layer = layers[layerIdx];
			const layerCells = [];
			for (const cell of layer) {
				const key = `${cell.x},${cell.z}`;
				const contents = liveWorld.board.cells[key];
				if (!Array.isArray(contents) || contents.length === 0) continue;
				const remaining = contents.filter(
					item => !(item && String(item.player) === String(playerId))
				);
				if (remaining.length > 0) liveWorld.board.cells[key] = remaining;
				else delete liveWorld.board.cells[key];
				layerCells.push({ x: cell.x, z: cell.z });
			}

			io.to(liveWorld.id).emit('king_detonation_layer', {
				playerId,
				pieceId: kingPieceId,
				layerIndex: layerIdx,
				totalLayers: layers.length,
				cells: layerCells,
			});

			World.markDirty();
			broadcaster.broadcastGameUpdate();

			layerIdx += 1;
			setTimeout(processNextLayer, layerIntervalMs);
		};

		setTimeout(processNextLayer, layerIntervalMs);

		return { success: true, explosionSequence, layerIntervalMs, endedGame: true };
	}

	return { detonateKing };
}

module.exports = {
	createKingDetonationService,
	computeExplosionSequence,
	groupSequenceIntoLayers,
	DEFAULT_LAYER_INTERVAL_MS,
};
