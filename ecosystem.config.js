module.exports = {
  apps: [{
    name: 'whatsgpt',
    script: 'index.js',
    watch: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '5s',
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    exp_backoff_restart_delay: 100,
    instances: 1,
    exec_mode: 'fork',
    restart_delay: 4000,
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    merge_logs: true,
    time: true
  }]
} 