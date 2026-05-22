/**
 * Sessions — ephemeral per-socket runtime state.
 *
 * The world (`World.js`) tracks **persistent** player records: id, name,
 * cooldowns, balance, etc.  This module tracks the *socket* a given player
 * is currently using, plus spectator state.  None of it is persisted —
 * after a server restart all sockets reconnect from scratch.
 *
 * The mapping is `socketId ↔ playerId`.  For now we assume one live socket
 * per player at a time; reconnects from the same player ID overwrite the
 * previous socket binding.  Multiple-tab support can be added later by
 * promoting `byPlayer` to `Map<playerId, Set<socketId>>`.
 */

/** @type {Map<string, SocketSession>} */
const bySocket = new Map();
/** @type {Map<string, string>} playerId -> active socketId */
const activeSocketByPlayer = new Map();

/**
 * @typedef {Object} SocketSession
 * @property {string} playerId
 * @property {boolean} isSpectator
 * @property {string|null} spectatingPlayerId
 * @property {Object} socket  Live socket.io reference (do NOT serialise)
 */

/**
 * Bind a fresh socket to a player.  If the player already had a socket,
 * the old one is dropped (the new one wins).
 *
 * @param {Object} socket
 * @param {string} playerId
 * @returns {SocketSession}
 */
function bind(socket, playerId) {
	const previousSocketId = activeSocketByPlayer.get(playerId);
	if (previousSocketId && previousSocketId !== socket.id) {
		bySocket.delete(previousSocketId);
	}
	const session = {
		playerId,
		isSpectator: false,
		spectatingPlayerId: null,
		socket,
	};
	bySocket.set(socket.id, session);
	activeSocketByPlayer.set(playerId, socket.id);
	return session;
}

/** Remove the binding for a socket. Returns the session that was removed. */
function unbind(socketId) {
	const session = bySocket.get(socketId);
	if (!session) return null;
	bySocket.delete(socketId);
	if (activeSocketByPlayer.get(session.playerId) === socketId) {
		activeSocketByPlayer.delete(session.playerId);
	}
	return session;
}

function bySocketId(socketId) {
	return bySocket.get(socketId) || null;
}

function socketForPlayer(playerId) {
	const sid = activeSocketByPlayer.get(playerId);
	if (!sid) return null;
	const session = bySocket.get(sid);
	return session ? session.socket : null;
}

function sessionForPlayer(playerId) {
	const sid = activeSocketByPlayer.get(playerId);
	if (!sid) return null;
	return bySocket.get(sid) || null;
}

function isOnline(playerId) {
	return activeSocketByPlayer.has(playerId);
}

function setSpectator(socketId, spectatingPlayerId = null) {
	const session = bySocket.get(socketId);
	if (!session) return null;
	session.isSpectator = true;
	session.spectatingPlayerId = spectatingPlayerId;
	return session;
}

function clearSpectator(socketId) {
	const session = bySocket.get(socketId);
	if (!session) return null;
	session.isSpectator = false;
	session.spectatingPlayerId = null;
	return session;
}

function listSessions() {
	return [...bySocket.values()];
}

function listOnlinePlayerIds() {
	return [...activeSocketByPlayer.keys()];
}

function clearAll() {
	bySocket.clear();
	activeSocketByPlayer.clear();
}

module.exports = {
	bind,
	unbind,
	bySocketId,
	socketForPlayer,
	sessionForPlayer,
	isOnline,
	setSpectator,
	clearSpectator,
	listSessions,
	listOnlinePlayerIds,
	clearAll,
};
