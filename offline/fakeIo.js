/**
 * An in-memory stand-in for the socket.io SERVER, for the offline
 * engine. It implements the part of the API the game's server code uses:
 *
 *   io.to(room)[.to(room)][.except(room)].emit(event, ...args)
 *   io.emit, io.on('connection'), io.engine.clientsCount
 *   socket.on/off/once/use/emit/join/leave/to/disconnect, socket.data,
 *   socket.handshake, socket.rooms, socket.connected
 *
 * Each socket talks to its client through a `send(message)` function;
 * the client's events come in through `socket._receive(event, args, ack)`.
 * Payloads cross a postMessage boundary, so functions are never sent.
 */

'use strict';

class BroadcastOperator {
	constructor(server, rooms = new Set(), except = new Set(), exceptSocketId = null) {
		this.server = server;
		this.rooms = rooms;
		this.exceptRooms = except;
		this.exceptSocketId = exceptSocketId;
	}

	to(room) {
		const rooms = new Set(this.rooms);
		for (const r of [].concat(room)) rooms.add(String(r));
		return new BroadcastOperator(this.server, rooms, this.exceptRooms, this.exceptSocketId);
	}

	in(room) { return this.to(room); }

	except(room) {
		const except = new Set(this.exceptRooms);
		for (const r of [].concat(room)) except.add(String(r));
		return new BroadcastOperator(this.server, this.rooms, except, this.exceptSocketId);
	}

	emit(event, ...args) {
		for (const socket of this.server.sockets.values()) {
			if (!socket.connected || socket.id === this.exceptSocketId) continue;
			if (this.rooms.size > 0 && ![...this.rooms].some(r => socket.rooms.has(r))) continue;
			if ([...this.exceptRooms].some(r => socket.rooms.has(r))) continue;
			socket.emit(event, ...args);
		}
		return true;
	}
}

class FakeServerSocket {
	constructor(server, { id, send, query = {}, auth = {} }) {
		this.server = server;
		this.id = id;
		this.send = send;
		this.connected = true;
		this.data = {};
		this.rooms = new Set([id]);
		this.handshake = { query, auth, headers: { cookie: '', 'user-agent': 'tetches-offline' }, address: '127.0.0.1' };
		this.handlers = new Map();
		this.middleware = [];
	}

	on(event, fn) {
		if (!this.handlers.has(event)) this.handlers.set(event, []);
		this.handlers.get(event).push(fn);
		return this;
	}

	once(event, fn) {
		const wrapped = (...args) => { this.off(event, wrapped); fn(...args); };
		return this.on(event, wrapped);
	}

	off(event, fn) {
		if (event === undefined) { this.handlers.clear(); return this; }
		if (!fn) { this.handlers.delete(event); return this; }
		const list = this.handlers.get(event) || [];
		this.handlers.set(event, list.filter(h => h !== fn));
		return this;
	}

	removeAllListeners(event) { return this.off(event); }

	use(fn) {
		this.middleware.push(fn);
		return this;
	}

	join(room) {
		for (const r of [].concat(room)) this.rooms.add(String(r));
	}

	leave(room) {
		this.rooms.delete(String(room));
	}

	to(room) {
		return new BroadcastOperator(this.server, new Set([String(room)]), new Set(), this.id);
	}

	in(room) { return this.to(room); }

	get broadcast() {
		return new BroadcastOperator(this.server, new Set(), new Set(), this.id);
	}

	/** Server → client. */
	emit(event, ...args) {
		if (!this.connected) return false;
		const data = args.filter(a => typeof a !== 'function');
		this.send({ type: 'event', event, args: data });
		return true;
	}

	/** Client → server: run the middleware chain, then the handlers. */
	_receive(event, args, ack) {
		if (!this.connected) return;
		const packet = [event, ...args];
		if (typeof ack === 'function') packet.push(ack);
		let i = 0;
		const next = (err) => {
			if (err) return;
			if (i < this.middleware.length) {
				const mw = this.middleware[i++];
				mw(packet, next);
				return;
			}
			const [name, ...rest] = packet;
			for (const fn of [...(this.handlers.get(name) || [])]) {
				try {
					fn(...rest);
				} catch (e) {
					console.error(`[offline] handler for "${name}" threw:`, e);
				}
			}
		};
		next();
	}

	disconnect() {
		if (!this.connected) return this;
		this.connected = false;
		this.server.sockets.delete(this.id);
		this.send({ type: 'disconnect', reason: 'server namespace disconnect' });
		for (const fn of [...(this.handlers.get('disconnect') || [])]) {
			try { fn('server namespace disconnect'); } catch (e) { console.error(e); }
		}
		return this;
	}
}

class FakeIoServer {
	constructor() {
		this.sockets = new Map();
		this.connectionHandlers = [];
		const server = this;
		this.engine = { get clientsCount() { return server.sockets.size; } };
	}

	on(event, fn) {
		if (event === 'connection' || event === 'connect') this.connectionHandlers.push(fn);
		return this;
	}

	to(room) { return new BroadcastOperator(this).to(room); }
	in(room) { return this.to(room); }
	except(room) { return new BroadcastOperator(this).except(room); }

	emit(event, ...args) {
		return new BroadcastOperator(this).emit(event, ...args);
	}

	/** Open a socket for a client and run the connection handlers. */
	connect({ id, send, query, auth }) {
		const socket = new FakeServerSocket(this, { id, send, query, auth });
		this.sockets.set(id, socket);
		for (const fn of this.connectionHandlers) fn(socket);
		return socket;
	}
}

module.exports = { FakeIoServer, FakeServerSocket, BroadcastOperator };
