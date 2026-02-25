/**
 * PM2 Ecosystem Configuration
 *
 * Manages Shaktris processes for staging and production.
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs --only shaktris-staging
 *   pm2 start ecosystem.config.cjs --only shaktris-production
 *   pm2 restart shaktris-staging
 *   pm2 logs shaktris-staging
 */

module.exports = {
	apps: [
		{
			name: 'shaktris-staging',
			script: 'server.js',
			cwd: '/var/www/shaktris.staging',
			env: {
				NODE_ENV: 'staging',
				PORT: 3661,
			},
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: '512M',
			error_file: '/var/www/shaktris.staging/logs/err.log',
			out_file: '/var/www/shaktris.staging/logs/out.log',
			merge_logs: true,
			log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
		},
		{
			name: 'shaktris-production',
			script: 'server.js',
			cwd: '/var/www/shaktris.live',
			env: {
				NODE_ENV: 'production',
				PORT: 3666,
			},
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: '1G',
			error_file: '/var/www/shaktris.live/logs/err.log',
			out_file: '/var/www/shaktris.live/logs/out.log',
			merge_logs: true,
			log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
		},
	],
};
