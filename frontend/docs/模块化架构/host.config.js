/**
 * Host 应用 Webpack 配置
 *
 * 职责：
 * 1. 声明要从哪些 Remote 模块加载组件
 * 2. 管理共享依赖（react, react-dom 等）
 * 3. 配置模块联邦插件
 *
 * 使用方式：
 * $ npx webpack serve --config webpack.config.js
 */

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// Webpack 5 Module Federation 插件
const { ModuleFederationPlugin } = require('webpack').container;

module.exports = {
  mode: 'development',

  // 入口文件
  entry: './src/index.ts',

  // 开发服务器配置
  devServer: {
    port: 3000,                    // Host 应用端口
    hot: true,                     // 开启热更新
    historyApiFallback: true,      // 支持 SPA 路由

    // 开发环境允许跨域加载 Remote 模块
    headers: {
      'Access-Control-Allow-Origin': '*'
    },

    // 监视文件变化
    watchFiles: ['src/**/*']
  },

  // 输出配置
  output: {
    // 必须使用 'auto'，让 Webpack 自动填充完整 URL（协议+主机+端口+路径）
    // 这样 Remote 模块可以根据当前页面 URL 自动确定资源路径
    publicPath: 'auto',

    // 输出目录
    path: path.resolve(__dirname, 'dist'),

    // 使用 contenthash 确保浏览器缓存正确失效
    filename: '[name].[contenthash].js',
    chunkFilename: '[id].[contenthash].js',

    // 清理旧的输出文件
    clean: true,

    // 非同步加载的资源使用此路径
    publicPath: 'auto'
  },

  // 模块解析配置
  resolve: {
    // 支持的文件扩展名
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],

    // 路径别名
    alias: {
      // 指向共享代码目录
      '@shared': path.resolve(__dirname, '../shared'),

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
        exclude: /node_modules/,   // 不处理 node_modules
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              // TypeScript 支持
              '@babel/preset-typescript',

              // React 支持（自动运行时，无需手动引入 React）
              ['@babel/preset-react', {
                runtime: 'automatic',
                // 开发环境开启 React Fast Refresh
                development: process.env.NODE_ENV === 'development'
              }],

              // 现代 JS 特性
              ['@babel/preset-env', {
                targets: '> 0.25%, not dead'
              }]
            ],

            // 插件配置
            plugins: [
              // 支持装饰器（用于 zustand 等库）
              ['@babel/plugin-proposal-decorators', { legacy: true }]
            ]
          }
        }
      },

      // CSS 处理
      {
        test: /\.css$/,
        use: [
          // 开发环境使用 style-loader（注入到 <style> 标签）
          'style-loader',

          // 处理 CSS Modules
          {
            loader: 'css-loader',
            options: {
              modules: {
                // 生成的类名格式：[文件名]__[局部名]--[hash:base64:5]
                // 示例：OrderList__title--a1b2c
                localIdentName: '[name]__[local]--[hash:base64:5]',

                // 是否导出类名到全局（不建议开启）
                exportLocalsConvention: 'camelCase'
              },

              // 启用 source map 便于调试
              sourceMap: true
            }
          }
        ]
      },

      // 图片资源
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/,
        type: 'asset',
        parser: {
          dataUrlCondition: {
            maxSize: 8 * 1024  // 小于 8KB 的图片转为 base64
          }
        }
      },

      // 字体资源
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        type: 'asset/resource'
      }
    ]
  },

  // 插件配置
  plugins: [
    // 生成 HTML 入口文件
    new HtmlWebpackPlugin({
      template: './public/index.html',
      // 注入 bundle 脚本
      inject: true,
      // HTML 压缩（生产环境）
      minify: process.env.NODE_ENV === 'production' ? {
        removeComments: true,
        collapseWhitespace: true,
        removeRedundantAttributes: true
      } : false
    }),

    // ========== 核心：Module Federation 插件配置 ==========
    new ModuleFederationPlugin({
      // ========== 1. 远程模块（Remotes）============
      //
      // 格式：'模块别名': '模块名@远程URL/remoteEntry.js'
      //
      // - 模块别名：用于在代码中引用，如 import('remote-order/OrderList')
      // - 模块名：必须与 Remote 配置中的 name 一致
      // - 远程URL：Remote 模块构建后的访问地址（开发环境用 localhost）
      //
      remotes: {
        // 订单模块 - 开发环境地址
        'remote-order': 'remote_order@http://localhost:3001/remoteEntry.js',

        // 用户模块 - 开发环境地址
        'remote-user': 'remote_user@http://localhost:3002/remoteEntry.js',

        // 支付模块 - 开发环境地址
        'remote-payment': 'remote_payment@http://localhost:3003/remoteEntry.js',

        // 生产环境可以切换到 CDN 地址
        // 'remote-order': 'remote_order@https://cdn.example.com/remote-order/remoteEntry.js',
      },

      // ========== 2. 共享依赖（Shared）============
      //
      // 声明哪些 npm 包需要在 Host 和 Remote 之间共享
      //
      // 关键概念：
      // - singleton: true  => 整个应用只允许一个实例
      //              false => 允许多个版本共存
      // - strictVersion: true => 版本必须完全匹配，否则警告
      // - preferPriority: true => 优先使用 Host 的版本（Remote 使用 Host 的）
      //
      shared: {
        // React 核心库 - 几乎所有模块都需要，必须是单例
        react: {
          // 单例模式：确保整个页面只有一个 React 实例
          // 避免多个 React 版本导致的 Hooks 错误等问题
          singleton: true,

          // 要求的版本范围（语义化版本）
          // Remote 模块也必须使用兼容范围[18.0.0, 19.0.0)内的 react
          requiredVersion: '^18.0.0',

          // 严格版本检查
          // true: 版本不匹配时警告（推荐开启）
          // false: 宽松匹配
          strictVersion: true,

          // 优先使用 Host 的版本
          // true: Remote 模块会使用 Host 已加载的 react
          // false: Remote 模块优先使用自己的版本
          preferPriority: true
        },

        // React DOM - 必须与 React 版本严格对应
        'react-dom': {
          singleton: true,
          requiredVersion: '^18.0.0',
          strictVersion: true,
          preferPriority: true
        },

        // React Router - 路由状态需要全局同步，必须是单例
        'react-router': {
          singleton: true,
          requiredVersion: '^6.0.0',
          strictVersion: true
        },

        // React Router DOM - SPA 路由必备
        'react-router-dom': {
          singleton: true,
          requiredVersion: '^6.0.0',
          strictVersion: true
        },

        // 状态管理库 - 也建议单例，避免状态不同步
        'zustand': {
          singleton: true,
          requiredVersion: '^4.0.0'
        },

        // lodash - 非关键库，可以允许多版本共存
        'lodash': {
          singleton: false,
          requiredVersion: '^4.17.21'
        },

        // 日期处理库
        'dayjs': {
          singleton: false,
          requiredVersion: '^1.11.0'
        },

        // axios HTTP 客户端
        'axios': {
          singleton: true,
          requiredVersion: '^1.0.0'
        }
      },

      // ========== 3. 开发模式优化 ==========
      //
      hot: true,  // 启用热模块替换

      // ========== 4. 预加载策略（生产环境）==========
      //
      // 可选：预加载某些 Remote 模块
      // prefetch: ['remote-order']  // 用户可能访问时预先加载
      // prefetch: 'lazy'           // 所有模块懒加载
      // prefetch: 'all'            // 预加载所有模块
      prefetch: false
    })
  ],

  // 代码分割优化
  optimization: {
    // 分割 chunks
    splitChunks: {
      // 对所有 chunk 进行分割
      chunks: 'all',

      // 缓存组配置
      cacheGroups: {
        // React 生态圈单独打包
        reactVendor: {
          test: /[\\/]node_modules[\\/](react|react-dom|react-router|zustand)[\\/]/,
          name: 'vendor-react',
          chunks: 'all',
          priority: 30  // 优先级高，优先打包
        },

        // 其他 vendor 库
        otherVendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor-common',
          chunks: 'all',
          priority: 10
        },

        // 共享代码单独打包
        shared: {
          test: /[\\/]shared[\\/]/,
          name: 'shared',
          chunks: 'all',
          priority: 20
        }
      }
    },

    // 确保模块 ID 稳定（contenthash 计算）
    moduleIds: 'deterministic',

    // 运行时 chunk
    runtimeChunk: 'single'
  },

  // 开发工具
  devtool: process.env.NODE_ENV === 'production'
    ? 'source-map'  // 生产环境用完整 source map
    : 'eval-source-map',  // 开发环境用快速 source map

  // 性能提示
  performance: {
    // 超过 500KB 提示警告
    maxAssetSize: 500000,
    maxEntrypointSize: 500000,

    // 提示回调
    hints: process.env.NODE_ENV === 'production' ? 'warning' : false
  },

  // 统计信息输出
  stats: {
    // 精简输出
    colors: true,
    modules: false,
    children: false
  }
};