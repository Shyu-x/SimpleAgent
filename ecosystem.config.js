module.exports = {
  apps: [
    // ==========================================
    // 后端服务 (Node.js Express API)
    // ==========================================
    {
      name: 'ai-chat-backend',
      script: 'src/index.js',
      cwd: '/home/xu/Develop/longTermProject/SimpleAgent/backend',

      // ===== 实例配置 =====
      instances: 1,              // API 服务单实例
      exec_mode: 'fork',         // 保持单进程

      // ===== 进程管理 =====
      watch: false,
      autorestart: true,
      max_memory_restart: '2G',  // 内存超过 2GB 时重启
      max_restarts: 10,
      max_retries: 3,
      restart_delay: 1000,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 30000,

      // ===== 环境配置 =====
      env: {
        NODE_ENV: 'development',
        PORT: 30000,
        LOG_LEVEL: 'debug',
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 30000,
        LOG_LEVEL: 'debug',
        NODE_OPTIONS: '--max-old-space-size=1800',
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 30000,
        LOG_LEVEL: 'info',
        NODE_OPTIONS: '--max-old-space-size=1800',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 30000,
        LOG_LEVEL: 'warn',
        NODE_OPTIONS: '--max-old-space-size=1800',
      },

      // ===== 日志配置 (日志轮转由 pm2-logrotate 管理) =====
      log_file: 'logs/backend.log',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      merge_logs: true,

      // ===== 其他配置 =====
      instance_var: 'INSTANCE_ID',
      source_map_support: true,
    },

    // ==========================================
    // 前端服务 (Next.js)
    // ==========================================
    {
      name: 'ai-chat-frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3001',
      cwd: '/home/xu/Develop/longTermProject/SimpleAgent/frontend',

      // ===== 实例配置 =====
      instances: 1,              // Next.js 单进程
      exec_mode: 'fork',

      // ===== 进程管理 =====
      watch: false,
      autorestart: true,
      max_memory_restart: '1G', // 前端 1GB 内存限制
      max_restarts: 10,
      max_retries: 3,
      restart_delay: 1000,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 30000,

      // ===== 环境配置 =====
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },

      // ===== 日志配置 =====
      log_file: 'logs/frontend.log',
      error_file: 'logs/frontend-error.log',
      out_file: 'logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      merge_logs: true,
    },
  ],
};
