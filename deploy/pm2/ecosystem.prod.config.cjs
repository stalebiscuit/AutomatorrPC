// PM2 process for the Speccify PROD environment (speccify.info).
// NODE_ENV=production makes the server load server/.env.production (PORT=8102, speccify_prod DB).
module.exports = {
  apps: [
    {
      name: 'speccify-prod-backend',
      cwd: '/var/www/speccify-prod/current/server',
      script: 'npm',
      args: 'run start',
      env: { NODE_ENV: 'production' },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      time: true,
    },
  ],
};
