module.exports = {
  apps: [
    {
      name: 'ai-chat-backend',
      script: 'src/index.js',
      cwd: 'C:/Users/Xu/Desktop/chat玩具/backend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      max_restarts: 10,
      restart_delay: 1000,
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'development',
        PORT: 30000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 30000
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      time: true
    },
    {
      name: 'ai-chat-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      cwd: 'C:/Users/Xu/Desktop/chat玩具/frontend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '1G',
      max_restarts: 10,
      restart_delay: 1000,
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      time: true
    }
  ]
};