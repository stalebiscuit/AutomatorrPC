// PM2 process for the Speccify TEST environment (test.speccify.info).
// NODE_ENV=test makes the server load server/.env.test (PORT=8101, speccify_test DB).
module.exports = {
  apps: [
    {
      name: 'speccify-test-backend',
      cwd: '/var/www/speccify-test/current/server',
      script: 'npm',
      args: 'run start',
      env: { NODE_ENV: 'test' },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      time: true,
    },
  ],
};
