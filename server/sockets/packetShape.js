/**
 * Normalise every incoming socket packet to `[event, data?, ack?]`.
 *
 * Handlers are written as `(data, callback)` and guard with
 * `if (callback) callback(...)`. When a client sends no acknowledgement,
 * socket.io passes any extra argument straight through, so
 * `emit('exit_game', {}, 'x')` made `callback` the string 'x' and threw
 * "callback is not a function" inside a nextTick — an uncaught
 * exception that killed the process. Dropping everything but the first
 * data argument and a real ack function makes `callback` either a
 * function or undefined.
 */

function attachPacketShape(socket) {
	if (!socket || typeof socket.use !== 'function') return;
	socket.use((packet, next) => {
		const last = packet[packet.length - 1];
		const ack = packet.length > 1 && typeof last === 'function' ? last : null;
		const args = packet.slice(1, ack ? -1 : undefined);
		packet.length = 1;
		if (args.length) packet.push(args[0]);
		if (ack) packet.push(ack);
		next();
	});
}

module.exports = { attachPacketShape };
