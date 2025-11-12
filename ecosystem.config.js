// ecosystem.config.js
// PM2 configuration for Jain SMS API

module.exports = {
  apps: [{
    name: 'jain-sms-api',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3101
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    // Restart on crash
    min_uptime: '10s',
    max_restarts: 10,
    // Cron restart (optional - restart daily at 3 AM)
    // cron_restart: '0 3 * * *',
    // Environment-specific configs
    env_development: {
      NODE_ENV: 'development',
      PORT: 3101
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3101
    }
  }]
};
