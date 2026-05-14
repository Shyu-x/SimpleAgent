/**
 * Remote 模块 Webpack 配置模板
 *
 * 职责：
 * 1. 定义暴露给 Host 的组件
 * 2. 声明依赖的共享包
 * 3. 生成 remoteEntry.js 供 Host 加载
 *
 * 使用方式：
 * 每个 Remote 模块（如 module-order）复制此文件，
 * 修改 name、exposes、端口等配置
 */

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('webpack').container;

// ================================================================
// 配置区域 - 请根据实际模块修改以下配置
// ================================================================

// 模块名称（必须唯一，用于 Host 识别）
const MODULE_NAME = 'remote_order';

// 开发服务器端口（每个 Remote 使用不同端口）
const DEV_SERVER_PORT = 3001;

// 暴露的组件路径映射
// 格式：'导出名': '相对于 src 的路径'
const EXPOSES = {
  // 订单列表页面
  './OrderList': './src/components/OrderList.tsx',

  // 订单详情页面
  './OrderDetail': './src/components/OrderDetail.tsx',

  // 订单创建弹窗
  './OrderCreateModal': './src/components/OrderCreateModal.tsx',

  // 路由配置（用于 Host 注册路由）
  './routes': './src/routes.ts'
};

// ================================================================
// Webpack 配置
// ================================================================

module.exports = {
  mode: 'development',

  // 入口文件
  entry: './src/index.ts',

  // 开发服务器配置
  devServer: {
    // 独立端口，避免与 Host (3000) 和其他 Remote 冲突
    port: DEV_SERVER_PORT,

    // 开启热更新
    hot: true,

    // 开发环境允许跨域访问
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },

    // 禁用 history fallback，避免与 Module Federation 冲突
    // Module Federation 需要精确的 URL 来加载远程模块
    historyApiFallback: false,

    // 开发环境不要压缩
    compress: false,

    // 静默模式减少日志
    client: {
      logging: 'info',
      overlay: {
        errors: true,
        warnings: false
      }
    }
  },

  // 输出配置
  output: {
    // 必须使用 'auto'，让 Webpack 自动填充完整 URL
    // 包括协议、主机名、端口等
    publicPath: 'auto',

    // 输出目录
    path: path.resolve(__dirname, 'dist'),

    // 文件名使用 contenthash，便于缓存
    filename: '[name].[contenthash].js',
    chunkFilename: '[id].[contenthash].js',

    // 清理旧文件
    clean: true,

    // library 配置（用于 Module Federation）
    library: {
      // 库类型：commonjs2 表示导出为 CommonJS 模块
      type: 'commonjs2',

      // 库名称，需要与 ModuleFederationPlugin 的 name 一致
      name: MODULE_NAME
    }
  },

  // 模块解析配置
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],

    // 路径别名
    alias: {
      // 指向共享代码目录
      '@shared': path.resolve(__dirname, '../../shared'),

      // 指向 src 目录
      '@': path.resolve(__dirname, 'src')
    }
  },

  // 模块规则
  module: {
    rules: [
      // TypeScript / JSX 编译
      {
        test: /\.(ts|tsx|js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-typescript',
              ['@babel/preset-react', {
                runtime: 'automatic',
                development: process.env.NODE_ENV === 'development'
              }],
              ['@babel/preset-env', {
                targets: '> 0.25%, not dead'
              }]
            ]
          }
        }
      },

      // CSS 处理
      {
        test: /\.css$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              modules: {
                localIdentName: '[name]__[local]--[hash:base64:5]'
              }
            }
          }
        ]
      }
    ]
  },

  // 插件配置
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html'
    }),

    // ========== 核心：Module Federation 插件配置 ==========
    new ModuleFederationPlugin({
      // 模块名称（必须唯一）
      name: MODULE_NAME,

      // ========== 暴露组件 ==========
      //
      // 定义哪些组件可以被 Host 应用加载
      // 格式：'导出名称': '相对于项目根目录的路径'
      //
      // 加载方式：
      //   import('remote-order/OrderList')  // 懒加载
      //   const { OrderList } = await import('remote-order')  // 解构导入
      //
      exposes: EXPOSES,

      // ========== 共享依赖 ==========
      //
      // 与 Host 保持版本一致，确保共享
      // 注意：Remote 端的 shared 配置会与 Host 协商版本
      //
      shared: {
        // React 必须单例，否则 Hooks 会出问题
        react: {
          singleton: true,
          requiredVersion: '^18.0.0',
          strictVersion: true,
          // Remote 优先使用 Host 的版本（false = Remote 优先用自己的）
          preferPriority: false
        },

        'react-dom': {
          singleton: true,
          requiredVersion: '^18.0.0',
          strictVersion: true,
          preferPriority: false
        },

        // React Router 也建议单例，保证路由状态同步
        'react-router': {
          singleton: true,
          requiredVersion: '^6.0.0'
        },
        'react-router-dom': {
          singleton: true,
          requiredVersion: '^6.0.0'
        },

        // 状态管理
        'zustand': {
          singleton: true,
          requiredVersion: '^4.0.0'
        },

        // 非关键库可以非单例
        'lodash': {
          singleton: false,
          requiredVersion: '^4.17.21'
        },

        'dayjs': {
          singleton: false,
          requiredVersion: '^1.11.0'
        },

        'axios': {
          singleton: true,
          requiredVersion: '^1.0.0'
        }
      },

      // ========== 热更新支持 ==========
      hot: true
    })
  ],

  // 优化配置
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: 10
        }
      }
    },

    // 确保 chunk id 稳定
    moduleIds: 'deterministic'
  },

  // 开发工具
  devtool: 'eval-source-map',

  // 性能提示
  performance: {
    hints: false
  }
};


/**
 * ================================================================
 * 模块-specific 配置示例
 * ================================================================
 *
 * 以下是不同模块的配置示例，复制修改即可：
 */

// ---------- 用户模块 (module-user) ----------
/*
const MODULE_NAME = 'remote_user';
const DEV_SERVER_PORT = 3002;
const EXPOSES = {
  './Profile': './src/components/UserProfile.tsx',
  './Settings': './src/components/UserSettings.tsx',
  './Avatar': './src/components/UserAvatar.tsx'
};
*/

// ---------- 支付模块 (module-payment) ----------
/*
const MODULE_NAME = 'remote_payment';
const DEV_SERVER_PORT = 3003;
const EXPOSES = {
  './PaymentForm': './src/components/PaymentForm.tsx',
  './PaymentResult': './src/components/PaymentResult.tsx',
  './PaymentHistory': './src/components/PaymentHistory.tsx'
};
*/

// ---------- 订单模块 (module-order) ----------
// 当前配置（见上方）


/**
 * ================================================================
 * 生产环境配置
 * ================================================================
 *
 * 生产环境需要切换远程地址到 CDN，并优化构建：
 *
 * const productionConfig = {
 *   ...baseConfig,
 *   mode: 'production',
 *
 *   devServer: {
 *     // 生产环境不需要 devServer
 *   },
 *
 *   output: {
 *     ...baseConfig.output,
 *     // 生产环境使用 CDN 地址
 *     publicPath: 'https://cdn.example.com/module-order/'
 *   },
 *
 *   plugins: [
 *     new HtmlWebpackPlugin({
 *       template: './public/index.html',
 *       minify: true
 *     }),
 *     new ModuleFederationPlugin({
 *       name: MODULE_NAME,
 *       exposes: EXPOSES,
 *       shared: {
 *         react: { singleton: true, requiredVersion: '^18.0.0' },
 *         'react-dom': { singleton: true, requiredVersion: '^18.0.0' }
 *       }
 *     })
 *   ]
 * };
 */