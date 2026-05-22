/**
 * Centralised structured logger for the server.
 *
 * In production this is a single Pino instance writing JSON to
 * stdout — easy for the host's log shipper (journald, Loki, etc.) to
 * pick up. In development we route through `pino-pretty` so the dev
 * console stays readable.
 *
 * The module also exports a `child(bindings)` helper so subsystems
 * can tag every line with their own context (e.g. `child({ module:
 * 'persistence' })`) without rewriting every callsite.
 *
 * Migration policy: existing `console.log/warn/error` calls keep
 * working for now. New code should reach for this logger; legacy
 * call-sites are migrated opportunistically.
 */

'use strict';

const pino = require('pino');

const isDevelopment = process.env.NODE_ENV !== 'production';
const level = process.env.LOG_LEVEL
	|| (isDevelopment ? 'debug' : 'info');

const transport = isDevelopment
	? {
		target: 'pino-pretty',
		options: {
			colorize: true,
			translateTime: 'HH:MM:ss',
			ignore: 'pid,hostname',
		},
	}
	: undefined;

const logger = pino({
	level,
	base: {
		service: 'tetches',
		env: process.env.NODE_ENV || 'development',
	},
	timestamp: pino.stdTimeFunctions.isoTime,
	...(transport ? { transport } : {}),
});

function child(bindings) {
	return logger.child(bindings || {});
}

module.exports = logger;
module.exports.child = child;
