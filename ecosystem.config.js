module.exports = {
  apps: [
    {
      name: 'ai-chat-backend',
      script: 'src/index.js',
      cwd: '/home/xu/Develop/longTermProject/SimpleAgent/backend',
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
        PORT: 30000,
        LOG_LEVEL: 'debug'
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 30000,
        LOG_LEVEL: 'debug'
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 30000,
        LOG_LEVEL: 'info'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 30000,
        LOG_LEVEL: 'warn'
      }
    },
    {
      name: 'ai-chat-frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3001',
      cwd: '/home/xu/Develop/longTermProject/SimpleAgent/frontend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '300M',
      max_restarts: 5,
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    }
  ]
};