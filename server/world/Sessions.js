/**
 * Sessions — ephemeral per-socket runtime state.
 *
 * The world (`World.js`) tracks **persistent** player records: id, name,
 * cooldowns, balance, etc.  This module tracks the *sockets* a given player
 * is currently using, plus spectator state.  None of it is persisted —
 * after a server restart all sockets reconnect from scratch.
 *
 * A player may hold SEVERAL live sockets at once (multiple tabs of the
 * same browser share the identity cookie).  `socketsForPlayer` returns
 * all of them — targeted emits (battle lobby updates, baskets, duels)
 * must reach every tab, otherwise whichever tab connected last silently
 * steals the event stream from the tab the player is actually using.
 * `socketForPlayer` returns the most recently bound socket for callers
 * that genuinely want a single "primary" endpoint.
 */

/** @type {Map<string, SocketSession>} */
const bySocket = new Map();
/** @type {Map<string, Set<string>>} playerId -> live socketIds (insertion order = bind order) */
const socketsByPlayer = new Map();
/**
 * @type {Map<string, string>} aliasId -> real playerId
 * Battle seats: gameplay events for the seat id must reach the socket of
 * the human controlling it. Aliases survive reconnects because they map
 * id → id (the live socket is looked up through the real id each time).
 */
const aliasToPlayer = new Map();

/**
 * @typedef {Object} SocketSession
 * @property {string} playerId
 * @property {boolean} isSpectator
 * @property {string|null} spectatingPlayerId
 * @property {Object} socket  Live socket.io reference (do NOT serialise)
 */

/**
 * Bind a fresh socket to a player. Existing sockets for the same player
 * are KEPT — a second tab must not hijack event routing from the first.
 *
 * @param {Object} socket
 * @param {string} playerId
 * @returns {SocketSession}
 */
/** playerId → when their last socket closed (ms). */
const offlineSince = new Map();
/** playerId → how long they had been away when they last came online (ms). */
const lastAway = new Map();

function bind(socket, playerId) {
	if (!socketsByPlayer.has(playerId)) {
		// Coming online: how long were they gone? (Not seen since this
		// server started: a long time.)
		const since = offlineSince.get(playerId);
		lastAway.set(playerId, since == null ? Infinity : Date.now() - since);
		offlineSince.delete(playerId);
	}
	const session = {
		playerId,
		isSpectator: false,
		spectatingPlayerId: null,
		socket,
	};
	bySocket.set(socket.id, session);
	let set = socketsByPlayer.get(playerId);
	if (!set) {
		set = new Set();
		socketsByPlayer.set(playerId, set);
	}
	// Re-insert so iteration order reflects recency (newest last).
	set.delete(socket.id);
	set.add(socket.id);
	return session;
}

/** Remove the binding for a socket. Returns the session that was removed. */
function unbind(socketId) {
	const session = bySocket.get(socketId);
	if (!session) return null;
	bySocket.delete(socketId);
	const set = socketsByPlayer.get(session.playerId);
	if (set) {
		set.delete(socketId);
		if (set.size === 0) {
			socketsByPlayer.delete(session.playerId);
			offlineSince.set(session.playerId, Date.now());
		}
	}
	return session;
}

/**
 * How long this player had been away when they last came online (ms;
 * Infinity when not seen since the server started). captureShield's
 * return shelter reads it, so a reload doesn't buy one.
 */
function lastAwayMs(playerId) {
	const away = lastAway.get(playerId);
	return away == null ? Infinity : away;
}

function bySocketId(socketId) {
	return bySocket.get(socketId) || null;
}

/** Resolve an alias (e.g. battle seat id) to its real player id. */
function resolveAlias(playerId) {
	return aliasToPlayer.get(playerId) || playerId;
}

/** Route events for `aliasId` to the socket(s) of `realPlayerId`. */
function setAlias(aliasId, realPlayerId) {
	if (!aliasId || !realPlayerId || aliasId === realPlayerId) return;
	aliasToPlayer.set(String(aliasId), String(realPlayerId));
}

function clearAlias(aliasId) {
	aliasToPlayer.delete(String(aliasId));
}

/**
 * The player's most recently bound live socket, or null.
 * Prefer `socketsForPlayer` for notifications — a multi-tab player
 * should hear about lobby changes in EVERY tab.
 */
function socketForPlayer(playerId) {
	const set = socketsByPlayer.get(resolveAlias(playerId));
	if (!set || set.size === 0) return null;
	let lastId = null;
	for (const sid of set) lastId = sid;
	const session = bySocket.get(lastId);
	return session ? session.socket : null;
}

/** ALL live sockets bound to this player (any tab), newest last. */
function socketsForPlayer(playerId) {
	const set = socketsByPlayer.get(resolveAlias(playerId));
	if (!set || set.size === 0) return [];
	const sockets = [];
	for (const sid of set) {
		const session = bySocket.get(sid);
		if (session && session.socket) sockets.push(session.socket);
	}
	return sockets;
}

/**
 * Emit an event to every live socket of a player. Returns the number
 * of sockets reached.
 */
function emitToPlayerSockets(playerId, event, payload) {
	let reached = 0;
	for (const socket of socketsForPlayer(playerId)) {
		try {
			socket.emit(event, payload);
			reached++;
		} catch (_e) { /* socket closing */ }
	}
	return reached;
}

function sessionForPlayer(playerId) {
	const socket = socketForPlayer(playerId);
	return socket ? bySocket.get(socket.id) || null : null;
}

function isOnline(playerId) {
	const set = socketsByPlayer.get(resolveAlias(playerId));
	return !!set && set.size > 0;
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
	return [...socketsByPlayer.keys()];
}

function clearAll() {
	bySocket.clear();
	socketsByPlayer.clear();
	aliasToPlayer.clear();
	offlineSince.clear();
	lastAway.clear();
}

module.exports = {
	lastAwayMs,
	bind,
	unbind,
	bySocketId,
	socketForPlayer,
	socketsForPlayer,
	emitToPlayerSockets,
	sessionForPlayer,
	isOnline,
	setAlias,
	clearAlias,
	resolveAlias,
	setSpectator,
	clearSpectator,
	listSessions,
	listOnlinePlayerIds,
	clearAll,
};
