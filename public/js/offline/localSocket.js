/**
 * A socket.io-client lookalike that talks to the offline engine (the
 * game's server code in a Web Worker) instead of tetches.com.
 *
 * Supports what the client uses: on / once / off / emit (with ack
 * callbacks) / connected / id / disconnect, plus the 'connect' and
 * 'disconnect' events. One worker serves every socket on the page.
 */

import { offlineEngineUrl } from './offlineMode.js';

let worker = null;
const sockets = new Map();
let socketSeq = 0;

function engine() {
	if (worker) return worker;
	worker = new Worker(offlineEngineUrl());
	worker.onmessage = (e) => {
		const msg = e.data || {};
		const socket = sockets.get(msg.socketId);
		if (socket) socket._deliver(msg);
	};
	worker.onerror = (e) => {
		console.error('[offline] engine error:', e.message || e);
		for (const socket of sockets.values()) socket._fire('connect_error', new Error('offline engine failed'));
	};
	return worker;
}

class LocalSocket {
	constructor({ query = {}, auth } = {}) {
		this.id = `local-${++socketSeq}-${Math.random().toString(36).slice(2, 8)}`;
		this.connected = false;
		this.disconnected = true;
		this._handlers = new Map();
		this._acks = new Map();
		this._ackSeq = 0;
		sockets.set(this.id, this);
		// Connect on the next tick so callers can register 'connect' first.
		setTimeout(() => {
			engine().postMessage({ type: 'connect', socketId: this.id, query, auth: auth || {} });
		}, 0);
	}

	on(event, fn) {
		if (!this._handlers.has(event)) this._handlers.set(event, []);
		this._handlers.get(event).push(fn);
		return this;
	}

	once(event, fn) {
		const wrapped = (...args) => { this.off(event, wrapped); fn(...args); };
		return this.on(event, wrapped);
	}

	off(event, fn) {
		if (event === undefined) this._handlers.clear();
		else if (!fn) this._handlers.delete(event);
		else this._handlers.set(event, (this._handlers.get(event) || []).filter(h => h !== fn));
		return this;
	}

	removeAllListeners(event) { return this.off(event); }

	emit(event, ...args) {
		if (!this.connected) return this;
		let ackId;
		if (args.length && typeof args[args.length - 1] === 'function') {
			ackId = ++this._ackSeq;
			this._acks.set(ackId, args.pop());
		}
		engine().postMessage({ type: 'emit', socketId: this.id, event, args: JSON.parse(JSON.stringify(args)), ackId });
		return this;
	}

	disconnect() {
		if (this.connected) engine().postMessage({ type: 'disconnect', socketId: this.id });
		this._closed('io client disconnect');
		return this;
	}

	close() { return this.disconnect(); }

	_closed(reason) {
		const was = this.connected;
		this.connected = false;
		this.disconnected = true;
		sockets.delete(this.id);
		this._acks.clear();
		if (was) this._fire('disconnect', reason);
	}

	_fire(event, ...args) {
		for (const fn of [...(this._handlers.get(event) || [])]) {
			try {
				fn(...args);
			} catch (e) {
				console.error(`[offline] "${event}" listener threw:`, e);
			}
		}
	}

	_deliver(msg) {
		switch (msg.type) {
			case 'connect':
				this.connected = true;
				this.disconnected = false;
				this._fire('connect');
				break;
			case 'event':
				this._fire(msg.event, ...(msg.args || []));
				break;
			case 'ack': {
				const fn = this._acks.get(msg.ackId);
				this._acks.delete(msg.ackId);
				if (fn) fn(...(msg.args || []));
				break;
			}
			case 'disconnect':
				this._closed(msg.reason || 'io server disconnect');
				break;
			default:
				break;
		}
	}
}

/** Drop-in for socket.io's `io(url, opts)`. */
export function createLocalSocket(_url, opts = {}) {
	return new LocalSocket(opts);
}
