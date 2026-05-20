/**
 * Express app builder.  Pure routing/middleware setup — no game-state
 * dependencies live in here.  See `server/bootstrap.js` for how the
 * world and socket layer are wired up.
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');

const apiRoutes = require('../routes/api');
const advertiserRoutes = require('../routes/advertisers');
const { mountAuthRoutes } = require('./auth/routes');

function createApp({ projectRoot = process.cwd() } = {}) {
	const app = express();
	const isDevelopment = process.env.NODE_ENV !== 'production';

	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({ extended: true }));

	app.use('/node_modules', express.static(path.join(projectRoot, 'node_modules')));
	app.use(express.static(path.join(projectRoot, 'public')));

	if (!isDevelopment) {
		app.use(express.static(path.join(projectRoot, 'client/build')));
	}

	app.get('/js/*', (req, res, next) => {
		const file = path.join(projectRoot, 'public', req.url);
		if (!fs.existsSync(file) && fs.existsSync(`${file}.js`)) {
			res.redirect(`${req.url}.js`);
			return;
		}
		next();
	});

	app.use('/api', apiRoutes);
	app.use('/api/advertisers', advertiserRoutes);
	mountAuthRoutes(app);

	app.get('/2d', (_req, res) => {
		res.sendFile(path.join(projectRoot, 'public', 'index.html'));
	});
	app.get('/advertise', (_req, res) => {
		res.sendFile(path.join(projectRoot, 'public', 'advertise.html'));
	});
	app.get('/admin/advertisers', (_req, res) => {
		res.sendFile(path.join(projectRoot, 'public', 'admin', 'advertisers.html'));
	});

	app.get('*', (_req, res) => {
		if (isDevelopment) {
			res.sendFile(path.join(projectRoot, 'public', 'index.html'));
		} else {
			res.sendFile(path.join(projectRoot, 'client/build', 'index.html'));
		}
	});

	return app;
}

module.exports = { createApp };
