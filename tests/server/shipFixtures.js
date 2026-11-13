/**
 * Shared fixtures for the Viking longship suites: a hand-built Viking
 * battle in the real World singleton, with tiny helpers to lay land,
 * pieces and ships at offsets from the arena centre.
 *
 * Not a test file (no `.test.js`), so jest only loads it on require.
 */

'use strict';

const World = require('../../server/world/World');
const BoardManager = require('../../server/game/BoardManager');
const IslandManager = require('../../server/game/IslandManager');
const ChessManager = require('../../server/game/ChessManager');
const TetrominoManager = require('../../server/game/TetrominoManager');
const { makeShipItem } = require('../../server/battle/shipRules');

const CENTRE = Object.freeze({ x: 2000, z: 2000 });
const BATTLE_ID = 'bviking';

/** Absolute coordinates for an offset from the arena centre. */
function at(dx, dz) {
	return { x: CENTRE.x + dx, z: CENTRE.z + dz };
}

function managers() {
	const boardManager = new BoardManager();
	const islandManager = new IslandManager();
	const chessManager = new ChessManager(boardManager, islandManager);
	const tetrominoManager = new TetrominoManager(boardManager, islandManager);
	return { boardManager, islandManager, chessManager, tetrominoManager };
}

/**
 * Reset the World to an active two-seat battle. Seats s0 / s1 are
 * controlled by humans h0 / h1 unless `bots` says otherwise.
 */
function vikingWorld({ edition = 'viking', mode = 'classic', startedAt = 1_000_000, status = 'active', bots = [] } = {}) {
	World.resetWorld();
	const world = World.getWorld();
	world.battles[BATTLE_ID] = {
		id: BATTLE_ID,
		code: 'VIKING',
		status,
		mode,
		edition,
		slot: 0,
		centre: { ...CENTRE },
		playRadius: 14,
		seatCount: 2,
		startedAt,
		createdAt: startedAt,
		hostId: 'h0',
		seats: [0, 1].map(index => ({
			seatId: `s${index}`,
			index,
			controlledBy: bots.includes(index) ? null : `h${index}`,
			isAi: bots.includes(index),
			name: `Seat ${index}`,
		})),
	};
	for (const index of [0, 1]) {
		world.players[`h${index}`] = { id: `h${index}`, name: `Human ${index}` };
		world.players[`s${index}`] = {
			id: `s${index}`,
			name: `Seat ${index}`,
			battleId: BATTLE_ID,
			color: index === 0 ? '#e6e6e6' : '#454545',
			isComputer: bots.includes(index),
			moveCount: 0,
		};
	}
	return world;
}

function battle() {
	return World.getWorld().battles[BATTLE_ID];
}

/** Plain land owned by `player` at offset (dx, dz). */
function land(dx, dz, player = 's0') {
	const { x, z } = at(dx, dz);
	World.getWorld().board.cells[`${x},${z}`] = [{ type: 'tetromino', player, color: '#123456' }];
	return { x, z };
}

/** A horizontal strip of land from dx0..dx1 at row dz. */
function strip(dx0, dx1, dz, player = 's0') {
	for (let dx = dx0; dx <= dx1; dx++) land(dx, dz, player);
}

/** A longship at offset (dx, dz). */
function ship(dx, dz, { player = 's0', shipId = 'ship-a', readyAt = 0, homeSeatId = player } = {}) {
	const { x, z } = at(dx, dz);
	World.getWorld().board.cells[`${x},${z}`] = [makeShipItem({
		shipId, player, battleId: BATTLE_ID, homeSeatId, readyAt,
	})];
	return { x, z };
}

/**
 * A chess piece at offset (dx, dz). Stands on whatever is there (a ship
 * included); lays the owner's land first if the square is empty.
 */
function piece(id, type, dx, dz, { player = 's0', orientation = 0, hasMoved = true } = {}) {
	const world = World.getWorld();
	const { x, z } = at(dx, dz);
	const key = `${x},${z}`;
	if (!Array.isArray(world.board.cells[key]) || world.board.cells[key].length === 0) {
		world.board.cells[key] = [{ type: 'tetromino', player, color: '#123456' }];
	}
	const record = {
		id, type, player,
		position: { x, z },
		hasMoved, orientation,
		moveCount: 0, forwardDistance: 0,
	};
	world.chessPieces.push(record);
	world.board.cells[key].push({
		type: 'chess', player, pieceId: id, pieceType: String(type).toLowerCase(),
	});
	return record;
}

function cellAt(dx, dz) {
	const { x, z } = at(dx, dz);
	return World.getWorld().board.cells[`${x},${z}`] || null;
}

module.exports = {
	CENTRE,
	BATTLE_ID,
	at,
	managers,
	vikingWorld,
	battle,
	land,
	strip,
	ship,
	piece,
	cellAt,
};
