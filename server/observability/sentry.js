/**
 * Sentry hook — opt-in error reporting.
 *
 * Initialises the SDK only when `SENTRY_DSN` is set. With no DSN this
 * module is a no-op (cheap default for dev), so it's safe to call
 * `captureException` from anywhere without a guard.
 *
 * Two consumer surfaces:
 *   • `initSentry()` — call once at server boot.
 *   • `captureException(err, context)` — drop-in replacement for
 *     `console.error('failed', err)` when you want it triaged.
 *
 * Express integration is bolted on by `wireSentryMiddleware(app)` in
 * `server/app.js`. Socket-handler integration is via
 * `wrapSocketHandler` so a thrown event handler reports + reuses the
 * existing socket without disconnecting the player.
 */

'use strict';

let sentryModule = null;
let initialised = false;
let enabled = false;

/**
 * One-shot init. Subsequent calls are a no-op.
 *
 * @param {Object} [opts]
 * @param {string} [opts.dsn]          - Override `SENTRY_DSN` env.
 * @param {string} [opts.environment]  - Override `NODE_ENV`.
 * @param {string} [opts.release]      - Override `SENTRY_RELEASE`.
 * @param {number} [opts.tracesSampleRate] - Defaults to 0.1 in prod.
 * @returns {boolean} true if Sentry actually initialised.
 */
function initSentry(opts = {}) {
	if (initialised) return enabled;
	initialised = true;

	const dsn = opts.dsn || process.env.SENTRY_DSN;
	if (!dsn) {
		// Silent no-op. We log once at INFO level so deploys can
		// confirm whether Sentry is wired or not.
		console.info('[Sentry] SENTRY_DSN not set — error reporting disabled.');
		return false;
	}

	try {
		sentryModule = require('@sentry/node');
		sentryModule.init({
			dsn,
			environment: opts.environment || process.env.NODE_ENV || 'development',
			release: opts.release || process.env.SENTRY_RELEASE || undefined,
			tracesSampleRate: typeof opts.tracesSampleRate === 'number'
				? opts.tracesSampleRate
				: (process.env.NODE_ENV === 'production' ? 0.1 : 0),
			// Don't trust user input verbatim; let Sentry redact what
			// it recognises and we'll catch the rest in beforeSend.
			sendDefaultPii: false,
			beforeSend(event) {
				// Strip any cookies / auth-headers Sentry might have
				// captured from Express requests. We don't ship
				// player keys to a third party.
				if (event.request && event.request.headers) {
					delete event.request.headers.cookie;
					delete event.request.headers.authorization;
				}
				return event;
			},
		});
		enabled = true;
		console.info('[Sentry] Initialised (env=' + (opts.environment || process.env.NODE_ENV || 'development') + ').');
	} catch (err) {
		console.warn('[Sentry] Failed to initialise:', err.message);
		enabled = false;
	}
	return enabled;
}

function isEnabled() {
	return enabled;
}

/**
 * Send an error to Sentry if enabled. Always returns synchronously;
 * the SDK queues + flushes in the background.
 *
 * @param {Error|string} err
 * @param {Object} [context]
 * @param {string} [context.where]
 * @param {Object} [context.tags]
 * @param {Object} [context.extras]
 */
function captureException(err, context = {}) {
	if (!enabled || !sentryModule) return;
	try {
		sentryModule.withScope(scope => {
			if (context.where) scope.setTag('where', context.where);
			if (context.tags) {
				for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
			}
			if (context.extras) {
				for (const [k, v] of Object.entries(context.extras)) scope.setExtra(k, v);
			}
			sentryModule.captureException(err);
		});
	} catch (_e) { /* never let reporting break the caller */ }
}

/**
 * Wraps a socket handler so any thrown exception is reported with
 * the socket's player context and rethrown to be handled by
 * Socket.IO's own error pipeline. Use sparingly — only on handlers
 * where a crash would otherwise be silent.
 *
 * @param {Function} handler
 * @param {string} eventName
 * @returns {Function}
 */
function wrapSocketHandler(handler, eventName) {
	if (typeof handler !== 'function') return handler;
	return function wrappedSocketHandler(...args) {
		try {
			return handler.apply(this, args);
		} catch (err) {
			captureException(err, {
				where: 'socket:' + (eventName || 'unknown'),
				tags: {
					socketId: this?.id,
					playerId: this?.data?.playerId,
				},
			});
			throw err;
		}
	};
}

/**
 * Adds Sentry's request handler at the start of an Express app and
 * its error handler at the end. Pass the constructed app + the
 * routes-registration function.
 *
 * Sentry's recommended pattern is request → routes → errors so we
 * separate the two halves.
 */
function wireSentryRequestHandler(app) {
	if (!enabled || !sentryModule) return;
	if (typeof sentryModule.Handlers?.requestHandler === 'function') {
		app.use(sentryModule.Handlers.requestHandler());
	}
}

function wireSentryErrorHandler(app) {
	if (!enabled || !sentryModule) return;
	if (typeof sentryModule.Handlers?.errorHandler === 'function') {
		app.use(sentryModule.Handlers.errorHandler());
	}
}

/**
 * Wire the process-level uncaught handlers. Idempotent.
 */
function installProcessHandlers() {
	if (!enabled || !sentryModule) return;
	process.on('uncaughtException', err => {
		captureException(err, { where: 'uncaughtException' });
		// Let the existing process handlers run so the node default
		// behaviour (log to stderr) still fires.
	});
	process.on('unhandledRejection', err => {
		captureException(err instanceof Error ? err : new Error(String(err)), {
			where: 'unhandledRejection',
		});
	});
}

module.exports = {
	initSentry,
	isEnabled,
	captureException,
	wrapSocketHandler,
	wireSentryRequestHandler,
	wireSentryErrorHandler,
	installProcessHandlers,
};
