module.exports = {
  apps: [
    {
      name: 'ai-chat-backend',
      script: 'src/index.js',
      cwd: '/home/xu/Develop/longTermProject/SimpleAgent/backend',

      // ===== 实例配置 =====
      instances: 'max',           // 尽可能多实例 (基于 CPU 核心数)
      exec_mode: 'cluster',       // 集群模式 (负载均衡)

      // ===== 进程管理 =====
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',  // 内存超过 500MB 时重启

      // ===== 重启配置 =====
      max_restarts: 10,
      restart_delay: 1000,
      kill_timeout: 5000,

      // ===== 环境配置 =====
      env: {
        NODE_ENV: 'development',
        PORT: 30000,
        LOG_LEVEL: 'debug',
        // 启用集群模式
        NODE_OPTIONS: '--max-old-space-size=450',
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 30000,
        LOG_LEVEL: 'debug',
        NODE_OPTIONS: '--max-old-space-size=450',
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 30000,
        LOG_LEVEL: 'info',
        NODE_OPTIONS: '--max-old-space-size=450',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 30000,
        LOG_LEVEL: 'warn',
        // 生产环境增加内存限制
        NODE_OPTIONS: '--max-old-space-size=450',
      },

      // ===== 日志配置 =====
      log_file: 'logs/backend.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      combine_logs: true,

      // ===== 其他配置 =====
      instance_var: 'INSTANCE_ID',  // 每个实例的环境变量
    },
    {
      name: 'ai-chat-frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3001',
      cwd: '/home/xu/Develop/longTermProject/SimpleAgent/frontend',

      // ===== 实例配置 =====
      instances: 1,              // 前端单实例 (Next.js 单进程)
      exec_mode: 'fork',         // 保持单进程

      // ===== 进程管理 =====
      watch: false,
      autorestart: true,
      max_memory_restart: '300M',

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

      // ===== 日志 =====
      log_file: 'logs/frontend.log',
      error_file: 'logs/frontend-error.log',
      out_file: 'logs/frontend-out.log',
    },
  ],
};