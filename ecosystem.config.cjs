module.exports = {
  apps: [{
    name: 'macro_crew',
    script: 'npx',
    args: 'vite --host 0.0.0.0 --port 8173',
    cwd: '/home/finstats/public_html/macro-crew',
    env: {
      NODE_ENV: 'development'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G'
  }]
};

