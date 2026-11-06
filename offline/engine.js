/**
 * The offline engine: the game's own server code, running in a Web
 * Worker in the player's browser (or phone app) with no network.
 *
 * The page's client talks to it exactly as it talks to tetches.com —
 * socket.io events — through `public/js/offline/localSocket.js`, which
 * forwards them here with postMessage. The world starts empty each time
 * (no persistence, no roaming world bots): offline play is battles
 * against computer opponents.
 *
 * Messages in:  {type:'connect', socketId, query, auth}
 *               {type:'emit', socketId, event, args, ackId?}
 *               {type:'disconnect', socketId}
 * Messages out: {type:'connect'|'event'|'ack'|'disconnect', socketId, ...}
 *
 * Built by scripts/build-offline.js into public/dist/offline-engine.js.
 */

'use strict';

const { FakeIoServer } = require('./fakeIo');
const persistence = require('../server/persistence');
const { protoRoomFor } = require('../server/net/broadcasts');
const { createServices, startServiceTimers } = require('../server/services');

const io = new FakeIoServer();
const services = createServices({ io, persistence });

services.lifecycleService.applyWorldSettings({});
services.battleManager.init();

io.on('connection', (socket) => {
	socket.join(protoRoomFor(socket));
	services.handleConnection(socket);
});

startServiceTimers(services);

const sockets = new Map();

function post(message) {
	self.postMessage(message);
}

self.onmessage = (e) => {
	const msg = e.data || {};
	const { socketId } = msg;
	switch (msg.type) {
		case 'connect': {
			// JSON round-trip, as socket.io serialises: a snapshot that
			// later server-side mutation can't reach, and nothing
			// postMessage can't clone.
			const send = (m) => post(m.args ? { ...m, args: JSON.parse(JSON.stringify(m.args)), socketId } : { ...m, socketId });
			// The client hears "connect" before any event the
			// connection handler emits, as with real socket.io.
			send({ type: 'connect' });
			sockets.set(socketId, io.connect({ id: socketId, send, query: msg.query || {}, auth: msg.auth || {} }));
			break;
		}
		case 'emit': {
			const socket = sockets.get(socketId);
			if (!socket) return;
			const ack = msg.ackId != null
				? (...args) => post({ type: 'ack', socketId, ackId: msg.ackId, args: JSON.parse(JSON.stringify(args)) })
				: undefined;
			socket._receive(msg.event, msg.args || [], ack);
			break;
		}
		case 'disconnect': {
			const socket = sockets.get(socketId);
			sockets.delete(socketId);
			if (socket) socket.disconnect();
			break;
		}
		default:
			break;
	}
};

post({ type: 'ready' });
