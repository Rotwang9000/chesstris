/**
 * Throwaway dev stress driver: connects a socket.io client to the local
 * server and fires the dev-only `dev_add_ai` event.
 *
 *   node scripts/_stress-add-ai.js 12        # add 12 AI bots
 *   node scripts/_stress-add-ai.js cleanup   # re-enable trim, collapse roster
 *
 * Safe to delete — only used for the manual graphics stress test.
 */
const { io } = require('socket.io-client');

const url = process.env.URL || 'http://localhost:3022';
const arg = process.argv[2] || '10';
const isCleanup = arg === 'cleanup';
const payload = isCleanup ? { cleanup: true } : { count: Number(arg) || 10 };

const socket = io(url, { transports: ['websocket'], reconnection: false });

const bail = (code, msg) => { if (msg) console.error(msg); try { socket.close(); } catch (_) {} process.exit(code); };

socket.on('connect', () => {
	socket.emit('dev_add_ai', payload, (res) => {
		console.log('dev_add_ai →', JSON.stringify(res));
		bail(res && res.success ? 0 : 3);
	});
});
socket.on('connect_error', (e) => bail(1, `connect_error: ${e.message}`));
setTimeout(() => bail(2, 'timeout waiting for ack'), 8000);
