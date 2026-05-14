# Module Federation 架构设计方案

## 一、技术选型说明

### 1.1 为什么选 Module Federation 而不是 qiankun/iframe

| 特性 | Module Federation | qiankun | iframe |
|------|------------------|---------|--------|
| **首屏性能** | ✅ 共享依赖，按需加载 | ⚠️ 需要预加载子应用 | ❌ 加载慢 |
| **样式隔离** | ⚠️ 需要手动处理（如CSS Modules） | ✅ 自动处理 | ✅ 完全隔离 |
| **状态共享** | ✅ 原生共享，无需桥接 | ⚠️ 需要全局状态 | ❌ 无法共享 |
| **通信机制** | ✅ 直接函数调用 | ⚠️ 基于 props | ❌ postMessage |
| **构建复杂度** | ⚠️ 需要统一 webpack 版本 | ✅ 独立构建 | ✅ 无需构建 |
| **调试体验** | ✅ source map 正常工作 | ⚠️ 需要额外配置 | ❌ 无法调试 |
| **热更新** | ✅ 支持 HMR | ✅ 支持 HMR | ❌ 不支持 |

### 1.2 Module Federation 的核心优势

```javascript
// 1. 运行时联邦 - 不需要统一构建
const RemoteButton = React.lazy(() => import('remote/Button'));

// 2. 依赖共享 - 多个微前端共享同一份 React
// Host 和 Remote 都用 react@18，只加载一次
new ModuleFederationPlugin({
  shared: ['react', 'react-dom']
});

// 3. 直接调用 - 无需消息通信
import type { RemoteModule } from 'remote/Module'; // 类型安全
```

### 1.3 适用场景

- **大型前端应用**：团队多、业务复杂、需独立部署
- **渐进式迁移**：从单体应用逐步拆分为微前端
- **共享 UI 组件库**：多个应用共用组件
- **技术栈统一**：所有团队使用相同 React 版本

### 1.4 为什么不用 qiankun

1. **协议限制**：qiankun 需要子应用暴露特定生命周期钩子
2. **通信复杂**：依赖 props 传递和自定义事件
3. **样式隔离不完美**：CSS Modules 需要额外配置
4. **维护活跃度**：相比 Module Federation 社区较小

### 1.5 为什么不用 iframe

1. **用户体验差**：页面切换闪烁，无法保持 session
2. **无法共享状态**：完全独立的应用
3. **性能问题**：每个 iframe 都是完整浏览器实例
4. **SEO 不友好**：搜索引擎无法抓取 iframe 内容

---

## 二、架构概览

```
frontend/
├── apps/                    # 微前端应用（Remote）
│   ├── module-order/       # 订单模块
│   ├── module-user/        # 用户模块
│   └── module-payment/     # 支付模块
├── shell/                  # Host 应用（主容器）
│   ├── src/
│   │   ├── bootstrap.tsx  # 入口文件
│   │   ├── App.tsx         # 主应用组件
│   │   └── index.ts        # 启动文件
│   └── webpack.config.js   # Host Webpack 配置
├── shared/                  # 共享代码库
│   ├── ui/                 # 共享 UI 组件
│   ├── utils/              # 共享工具函数
│   └── types/              # 共享类型定义
└── docs/                    # 文档
    └── 模块化架构/
        ├── README.md       # 本文档
        ├── host.config.js  # Host 配置
        ├── remote.config.js # Remote 配置模板
        └── featureFlags.ts # 特性开关
```

---

## 三、Webpack 配置详解

### 3.1 Host 应用配置（shell）

Host 应用负责：
1. 加载所有 Remote 模块
2. 管理共享依赖
3. 路由分发
4. 全局状态管理

```javascript
// shell/webpack.config.js
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('webpack').container;
const path = require('path');
const deps = require('./package.json').dependencies;

module.exports = {
  mode: 'development',
  entry: './src/index.ts',
  // 开发环境避免 devServer 重启
  devServer: {
    port: 3000,
    hot: true,
    // 确保文件变化时重新打包
    watchFiles: ['src/**/*', '../shared/**/*']
  },
  output: {
    // 必须使用空 publicPath，让子应用自行决定资源路径
    publicPath: 'auto',
    path: path.resolve(__dirname, 'dist'),
    // 确保 chunk id 稳定，避免缓存失效
    chunkFilename: '[id].[contenthash].js'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    // 支持从 shared 目录导入
    alias: {
      '@shared': path.resolve(__dirname, '../shared')
    }
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx|js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-typescript',
              ['@babel/preset-react', { runtime: 'automatic' }]
            ]
          }
        }
      },
      // CSS Modules 支持
      {
        test: /\.css$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              modules: {
                // 使用文件名前缀实现样式隔离
                localIdentName: '[name]__[local]--[hash:base64:5]'
              }
            }
          }
        ]
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html'
    }),
    // ============ 核心：Module Federation Plugin ============
    new ModuleFederationPlugin({
      // ============ 1. 远程模块配置 ============
      // 声明要从哪些远程模块加载组件
      remotes: {
        // 格式：'remote名称': 'remoteName@远程URL/文件名'
        // 订单模块
        'remote-order': 'remote_order@http://localhost:3001/remoteEntry.js',
        // 用户模块
        'remote-user': 'remote_user@http://localhost:3002/remoteEntry.js',
        // 支付模块
        'remote-payment': 'remote_payment@http://localhost:3003/remoteEntry.js'
      },

      // ============ 2. 共享依赖配置 ============
      // 告诉 webpack，哪些包需要在 Host 和 Remote 之间共享
      // 如果 Remote 也有相同版本，就复用；否则每个都加载自己的
      shared: {
        // React 核心库 - 最常用的共享包
        react: {
          // 指定版本范围，避免版本冲突
          // Remote 必须使用兼容范围[18.0.0, 19.0.0)内的版本
          singleton: true,        // 整个应用只允许一个实例
          requiredVersion: '^18.0.0',
          // 版本不匹配时是否警告
          strictVersion: true,
          // 优先使用 Host 的版本
          preferPriority: true
        },
        // React DOM - 与 React 版本严格对应
        'react-dom': {
          singleton: true,
          requiredVersion: '^18.0.0',
          strictVersion: true,
          preferPriority: true
        },
        // React Router - 需要版本一致，否则路由状态可能混乱
        'react-router': {
          singleton: true,
          requiredVersion: '^6.0.0'
        },
        'react-router-dom': {
          singleton: true,
          requiredVersion: '^6.0.0'
        },
        // 状态管理 - 建议也作为单例
        'zustand': {
          singleton: true,
          requiredVersion: '^4.0.0'
        },
        // 工具库 - 可以有多个版本
        'lodash': {
          // 非单例允许多版本共存
          singleton: false,
          requiredVersion: '^4.17.21'
        },
        // ============ 3. 异步共享（可选）===========
        // 可以按需加载的共享模块
        // 如果 Remote 需要但 Host 没有，不会报错，只是没有共享
      },

      // ============ 3. 运行时配置 ============
      // 控制在什么时机加载远程模块
      runtime: undefined,  // 使用默认 runtime

      // ============ 4. 库文件配置 ============
      // 额外暴露的库文件
      runtimeVersion: undefined,

      // ============ 5. 开发模式优化 ============
      // 开发环境下自动添加热更新支持
      hot: true,

      // ============ 6. 预加载配置（生产环境）===========
      // 生产环境建议预加载关键模块
      // prefetch: ['remote-order']  // 预取订单模块
    })
  ],
  optimization: {
    // 确保 chunk 分割合理
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        // vendor 库单独打包
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: 10
        },
        // 共享模块单独打包
        shared: {
          test: /[\\/]shared[\\/]/,
          name: 'shared',
          chunks: 'all',
          priority: 20
        }
      }
    }
  }
};
```

### 3.2 Remote 模块配置模板

每个 Remote 模块需要：
1. 暴露自己提供的组件
2. 声明自己需要的共享依赖
3. 配置独立的开发服务器

```javascript
// apps/module-order/webpack.config.js
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('webpack').container;
const path = require('path');
const deps = require('./package.json').dependencies;

module.exports = {
  mode: 'development',
  // 每个 Remote 模块有独立端口，方便同时开发
  devServer: {
    port: 3001,           // 订单模块专用端口
    hot: true,
    // CORS 配置，允许 Host 应用加载
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
    // 开发环境关闭 history fallback，避免与 Module Federation 冲突
    historyApiFallback: false
  },
  output: {
    // 必须使用 'auto'，让 Webpack 自动填充完整 URL
    publicPath: 'auto',
    // 独立文件名，避免与 Host 冲突
    filename: '[name].[contenthash].js',
    // 异步 chunk 也使用 contenthash
    chunkFilename: '[id].[contenthash].js',
    // 确保清理旧文件
    clean: true
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@shared': path.resolve(__dirname, '../../shared')
    }
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx|js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-typescript',
              ['@babel/preset-react', { runtime: 'automatic' }]
            ]
          }
        }
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html'
    }),
    new ModuleFederationPlugin({
      // ============ 1. 模块名称 ============
      // 必须唯一，用于 Host 识别
      name: 'remote_order',

      // ============ 2. 暴露组件 ============
      // 定义哪些组件可以被 Host 加载
      // 格式：'导出名称': '相对路径'
      exposes: {
        // 订单列表页面
        './OrderList': './src/components/OrderList',
        // 订单详情页面
        './OrderDetail': './src/components/OrderDetail',
        // 订单创建弹窗
        './OrderCreateModal': './src/components/OrderCreateModal',
        // 导出整个订单模块的路由配置
        './routes': './src/routes.ts'
      },

      // ============ 3. 共享依赖 ============
      // 与 Host 配置保持一致，确保版本兼容
      shared: {
        react: {
          singleton: true,
          requiredVersion: '^18.0.0',
          strictVersion: true,
          // Remote 优先使用 Host 的版本
          preferPriority: false
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^18.0.0',
          strictVersion: true,
          preferPriority: false
        },
        'react-router': {
          singleton: true,
          requiredVersion: '^6.0.0'
        },
        'zustand': {
          singleton: true,
          requiredVersion: '^4.0.0'
        }
      },

      // ============ 4. 开发模式 ============
      hot: true
    })
  ]
};
```

### 3.3 用户模块配置

```javascript
// apps/module-user/webpack.config.js
const { ModuleFederationPlugin } = require('webpack').container;
const path = require('path');

module.exports = {
  mode: 'development',
  devServer: {
    port: 3002,
    hot: true,
    headers: { 'Access-Control-Allow-Origin': '*' }
  },
  output: {
    publicPath: 'auto',
    filename: '[name].[contenthash].js',
    chunkFilename: '[id].[contenthash].js',
    clean: true
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'remote_user',
      exposes: {
        // 用户个人中心页面
        './Profile': './src/components/UserProfile',
        // 用户设置页面
        './Settings': './src/components/UserSettings',
        // 用户头像组件（可复用）
        './Avatar': './src/components/UserAvatar'
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0', strictVersion: true },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0', strictVersion: true },
        'zustand': { singleton: true, requiredVersion: '^4.0.0' }
      },
      hot: true
    })
  ]
};
```

### 3.4 支付模块配置

```javascript
// apps/module-payment/webpack.config.js
const { ModuleFederationPlugin } = require('webpack').container;
const path = require('path');

module.exports = {
  mode: 'development',
  devServer: {
    port: 3003,
    hot: true,
    headers: { 'Access-Control-Allow-Origin': '*' }
  },
  output: {
    publicPath: 'auto',
    filename: '[name].[contenthash].js',
    chunkFilename: '[id].[contenthash].js',
    clean: true
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'remote_payment',
      exposes: {
        // 支付页面
        './PaymentForm': './src/components/PaymentForm',
        // 支付结果
        './PaymentResult': './src/components/PaymentResult',
        // 支付历史
        './PaymentHistory': './src/components/PaymentHistory'
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0', strictVersion: true },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0', strictVersion: true },
        // 支付模块可能需要 lodash 进行金额计算
        'lodash': { singleton: false, requiredVersion: '^4.17.21' }
      },
      hot: true
    })
  ]
};
```

---

## 四、类型声明文件

### 4.1 远程模块类型声明

为了在 TypeScript 中安全使用远程模块，需要声明类型：

```typescript
// types/remote-entry.d.ts

/**
 * Module Federation 类型声明
 *
 * 为什么要这个文件？
 * 1. TypeScript 无法直接从远程模块读取类型
 * 2. 远程加载的模块在编译时不存在
 * 3. 我们需要手动声明远程模块的接口
 *
 * 使用方式：
 * ```typescript
 * const RemoteOrder = React.lazy(() => import('remote-order/OrderList'));
 * ```
 */

// ============ 订单模块类型 ============
declare module 'remote_order/OrderList' {
  import { ComponentType } from 'react';

  /**
   * 订单列表组件属性
   */
  export interface OrderListProps {
    /** 订单状态筛选 */
    status?: 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled';
    /** 每页显示数量 */
    pageSize?: number;
    /** 页码变化回调 */
    onPageChange?: (page: number) => void;
    /** 点击订单回调 */
    onOrderClick?: (orderId: string) => void;
  }

  /**
   * 订单列表组件
   * - 用于展示用户订单列表
   * - 支持筛选、排序、分页
   */
  const OrderList: ComponentType<OrderListProps>;
  export default OrderList;
}

declare module 'remote_order/OrderDetail' {
  import { ComponentType } from 'react';

  /**
   * 订单详情组件属性
   */
  export interface OrderDetailProps {
    /** 订单ID（必填） */
    orderId: string;
    /** 是否可编辑 */
    editable?: boolean;
    /** 返回按钮回调 */
    onBack?: () => void;
  }

  const OrderDetail: ComponentType<OrderDetailProps>;
  export default OrderDetail;
}

declare module 'remote_order/OrderCreateModal' {
  import { ComponentType } from 'react';

  export interface OrderCreateModalProps {
    /** 是否显示弹窗 */
    visible: boolean;
    /** 关闭弹窗回调 */
    onClose: () => void;
    /** 创建成功回调 */
    onSuccess: (orderId: string) => void;
  }

  const OrderCreateModal: ComponentType<OrderCreateModalProps>;
  export default OrderCreateModal;
}

declare module 'remote_order/routes' {
  /**
   * 订单模块路由配置
   * 用于 Host 应用注册路由
   */
  export const orderRoutes: Array<{
    path: string;
    component: any;
    exact?: boolean;
  }>;
}

// ============ 用户模块类型 ============
declare module 'remote_user/Profile' {
  import { ComponentType } from 'react';

  export interface UserProfileProps {
    /** 用户ID（可选，默认显示当前用户） */
    userId?: string;
    /** 是否显示编辑按钮 */
    editable?: boolean;
  }

  const UserProfile: ComponentType<UserProfileProps>;
  export default UserProfile;
}

declare module 'remote_user/Settings' {
  import { ComponentType } from 'react';

  export interface UserSettingsProps {
    /** 设置分类 */
    category?: 'account' | 'privacy' | 'notifications' | 'appearance';
  }

  const UserSettings: ComponentType<UserSettingsProps>;
  export default UserSettings;
}

declare module 'remote_user/Avatar' {
  import { ComponentType } from 'react';

  export interface UserAvatarProps {
    /** 用户ID或头像URL */
    src?: string;
    /** 头像尺寸 */
    size?: 'small' | 'medium' | 'large';
    /** 点击事件 */
    onClick?: () => void;
  }

  const UserAvatar: ComponentType<UserAvatarProps>;
  export default UserAvatar;
}

// ============ 支付模块类型 ============
declare module 'remote_payment/PaymentForm' {
  import { ComponentType } from 'react';

  export interface PaymentFormProps {
    /** 订单ID */
    orderId: string;
    /** 支付金额 */
    amount: number;
    /** 支付方式 */
    method?: 'alipay' | 'wechat' | 'card';
    /** 支付成功回调 */
    onSuccess: (transactionId: string) => void;
    /** 支付失败回调 */
    onFail: (error: Error) => void;
  }

  const PaymentForm: ComponentType<PaymentFormProps>;
  export default PaymentForm;
}

declare module 'remote_payment/PaymentResult' {
  import { ComponentType } from 'react';

  export interface PaymentResultProps {
    /** 交易ID */
    transactionId: string;
    /** 是否成功 */
    success: boolean;
    /** 订单ID */
    orderId: string;
  }

  const PaymentResult: ComponentType<PaymentResultProps>;
  export default PaymentResult;
}

declare module 'remote_payment/PaymentHistory' {
  import { ComponentType } from 'react';

  export interface PaymentHistoryProps {
    /** 用户ID（可选） */
    userId?: string;
    /** 时间范围筛选 */
    dateRange?: { start: Date; end: Date };
  }

  const PaymentHistory: ComponentType<PaymentHistoryProps>;
  export default PaymentHistory;
}

// ============ 全局声明 ============
/**
 * 告诉 TypeScript webpack container 模块的处理方式
 */
declare module 'webpack/container/reference/*' {
  import { ModuleFederationPlugin } from 'webpack';

  const RemoteModule: any;
  export default RemoteModule;
}
```

### 4.2 共享类型声明

```typescript
// types/shared.d.ts

/**
 * 共享类型定义
 * 所有模块共用的类型，避免重复定义
 */

// ============ 通用类型 ============

/**
 * 加载状态
 */
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

/**
 * API 响应结构
 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/**
 * 分页参数
 */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/**
 * 分页结果
 */
export interface PaginationResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 用户信息（共享）
 */
export interface SharedUser {
  id: string;
  name: string;
  avatar?: string;
  email: string;
}

/**
 * 订单基础信息（共享）
 */
export interface SharedOrder {
  id: string;
  orderNo: string;
  status: 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled';
  totalAmount: number;
  createdAt: string;
}

// ============ 事件总线类型 ============
/**
 * 全局事件类型
 * 用于模块间通信
 */
export type GlobalEventType =
  | 'user:login'
  | 'user:logout'
  | 'order:created'
  | 'order:paid'
  | 'payment:completed'
  | 'app:theme-changed';

export interface GlobalEvent<T = any> {
  type: GlobalEventType;
  payload: T;
  timestamp: number;
}

/**
 * 事件总线接口
 */
export interface EventBus {
  emit<T>(type: GlobalEventType, payload: T): void;
  on<T>(type: GlobalEventType, handler: (event: GlobalEvent<T>) => void): () => void;
  off(type: GlobalEventType, handler: Function): void;
}
```

---

## 五、特性开关设计

### 5.1 Feature Flags 核心实现

```typescript
// shared/utils/featureFlags.ts

/**
 * 特性开关系统
 *
 * 为什么需要特性开关？
 * 1. 灰度发布 - 可以逐步开放新功能给用户
 * 2. A/B 测试 - 同一功能不同实现对比效果
 * 3. 快速回滚 - 出问题时可以立即关闭功能
 * 4. 环境区分 - 开发/测试/生产不同配置
 *
 * 使用方式：
 * ```typescript
 * // 组件内
 * const { isEnabled } = useFeatureFlags();
 * if (isEnabled('new-checkout')) {
 *   return <NewCheckout />;
 * }
 *
 * // Hook
 * const enabled = useFeatureFlag('dark-mode');
 * ```
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// ============ 类型定义 ============

/**
 * 特性开关配置
 */
export interface FeatureFlag {
  /** 特性标识 */
  key: string;
  /** 是否启用 */
  enabled: boolean;
  /** 变体值（A/B测试用） */
  variant?: string;
  /** 覆盖的用户ID列表（白名单） */
  userIds?: string[];
  /** 覆盖的百分比（0-100） */
  percentage?: number;
  /** 特性说明 */
  description?: string;
  /** 过期时间（可选） */
  expiresAt?: string;
}

/**
 * 特性开关配置源
 */
export interface FeatureFlagsConfig {
  /** 特性开关列表 */
  flags: FeatureFlag[];
  /** 最后更新时间 */
  updatedAt: string;
  /** 数据源 */
  source: 'static' | 'remote' | 'override';
}

/**
 * 特性开关上下文值
 */
interface FeatureFlagsContextValue {
  /** 所有特性开关 */
  flags: FeatureFlagsConfig;
  /** 是否正在加载 */
  loading: boolean;
  /** 检查某个特性是否启用 */
  isEnabled: (key: string) => boolean;
  /** 获取特性变体 */
  getVariant: (key: string) => string | undefined;
  /** 更新特性开关（仅开发环境） */
  setOverride: (key: string, enabled: boolean) => void;
  /** 刷新配置（从远程） */
  refresh: () => Promise<void>;
}

// ============ 默认配置 ============

/**
 * 默认特性开关配置
 * 可以根据环境变量覆盖
 */
const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    key: 'new-checkout',
    enabled: process.env.NEXT_PUBLIC_FF_NEW_CHECKOUT === 'true',
    description: '新版结账流程',
    variant: process.env.NEXT_PUBLIC_FF_NEW_CHECKOUT_VARIANT
  },
  {
    key: 'dark-mode',
    enabled: true,
    description: '深色模式支持'
  },
  {
    key: 'ai-assistant',
    enabled: process.env.NEXT_PUBLIC_FF_AI_ASSISTANT === 'true',
    description: 'AI 助手功能',
    percentage: 20  // 只对 20% 用户开放
  },
  {
    key: 'realtime-collaboration',
    enabled: false,
    description: '实时协作功能（开发中）'
  },
  {
    key: 'advanced-analytics',
    enabled: process.env.NEXT_PUBLIC_FF_ANALYTICS === 'true',
    description: '高级分析功能',
    userIds: ['user-123', 'user-456']  // 白名单用户
  }
];

// ============ Context 创建 ============

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);

// ============ Provider 组件 ============

interface FeatureFlagsProviderProps {
  children: ReactNode;
  /** 初始配置（可选） */
  initialFlags?: FeatureFlag[];
  /** 远程配置URL（可选） */
  remoteConfigUrl?: string;
  /** 刷新间隔（毫秒，默认不刷新） */
  refreshInterval?: number;
}

export function FeatureFlagsProvider({
  children,
  initialFlags,
  remoteConfigUrl,
  refreshInterval = 0  // 默认不自动刷新
}: FeatureFlagsProviderProps) {
  // 特性开关状态
  const [config, setConfig] = useState<FeatureFlagsConfig>({
    flags: initialFlags || DEFAULT_FLAGS,
    updatedAt: new Date().toISOString(),
    source: 'static'
  });

  // 加载状态
  const [loading, setLoading] = useState(false);

  // 本地覆盖（开发环境用）
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  /**
   * 检查特性是否启用
   * 优先级：本地覆盖 > 远程配置 > 默认配置
   */
  const isEnabled = useCallback((key: string): boolean => {
    // 1. 检查本地覆盖
    if (key in overrides) {
      return overrides[key];
    }

    // 2. 查找特性配置
    const flag = config.flags.find(f => f.key === key);
    if (!flag) {
      return false;
    }

    // 3. 检查过期时间
    if (flag.expiresAt && new Date(flag.expiresAt) < new Date()) {
      return false;
    }

    // 4. 检查白名单
    if (flag.userIds && flag.userIds.length > 0) {
      // TODO: 从 auth context 获取当前用户ID
      const currentUserId = getCurrentUserId();
      if (currentUserId && flag.userIds.includes(currentUserId)) {
        return true;
      }
    }

    // 5. 检查百分比
    if (flag.percentage !== undefined) {
      const hash = hashString(key + getCurrentUserId());
      const bucket = hash % 100;
      return bucket < flag.percentage;
    }

    // 6. 返回启用状态
    return flag.enabled;
  }, [config.flags, overrides]);

  /**
   * 获取特性变体（A/B测试）
   */
  const getVariant = useCallback((key: string): string | undefined => {
    const flag = config.flags.find(f => f.key === key);
    return flag?.variant;
  }, [config.flags]);

  /**
   * 设置本地覆盖（仅开发环境）
   */
  const setOverride = useCallback((key: string, enabled: boolean) => {
    if (process.env.NODE_ENV !== 'production') {
      setOverrides(prev => ({
        ...prev,
        [key]: enabled
      }));
      console.log(`[FeatureFlags] Override: ${key} = ${enabled}`);
    }
  }, []);

  /**
   * 从远程刷新配置
   */
  const refresh = useCallback(async () => {
    if (!remoteConfigUrl) return;

    setLoading(true);
    try {
      const response = await fetch(remoteConfigUrl);
      const data = await response.json();
      setConfig({
        flags: data.flags || DEFAULT_FLAGS,
        updatedAt: new Date().toISOString(),
        source: 'remote'
      });
    } catch (error) {
      console.error('[FeatureFlags] Failed to fetch remote config:', error);
    } finally {
      setLoading(false);
    }
  }, [remoteConfigUrl]);

  /**
   * 定时刷新
   */
  useEffect(() => {
    if (refreshInterval > 0 && remoteConfigUrl) {
      const interval = setInterval(refresh, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, remoteConfigUrl, refresh]);

  const value: FeatureFlagsContextValue = {
    flags: config,
    loading,
    isEnabled,
    getVariant,
    setOverride,
    refresh
  };

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

// ============ Hooks ============

/**
 * 使用特性开关
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isEnabled, getVariant } = useFeatureFlags();
 *
 *   if (isEnabled('new-checkout')) {
 *     const variant = getVariant('new-checkout');
 *     return variant === 'A' ? <CheckoutA /> : <CheckoutB />;
 *   }
 *
 *   return <LegacyCheckout />;
 * }
 * ```
 */
export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within FeatureFlagsProvider');
  }
  return context;
}

/**
 * 使用单个特性开关
 * @example
 * ```tsx
 * const enabled = useFeatureFlag('dark-mode');
 * ```
 */
export function useFeatureFlag(key: string): boolean {
  const { isEnabled } = useFeatureFlags();
  return isEnabled(key);
}

// ============ 辅助函数 ============

/**
 * 获取当前用户ID
 * 实际应从 auth context 获取
 */
function getCurrentUserId(): string {
  // TODO: 从 React Context 或zustand store 获取
  return typeof window !== 'undefined'
    ? (window as any).__USER_ID__ || ''
    : '';
}

/**
 * 计算字符串哈希（用于百分比分配）
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ============ 开发工具 ============

/**
 * 开发环境特性开关调试面板
 * 可以通过键盘快捷键打开
 */
export function FeatureFlagsDevtools() {
  const { flags, isEnabled, setOverride, refresh } = useFeatureFlags();

  useEffect(() => {
    // 按 Ctrl+Shift+F 打开调试面板
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        toggleDevtools();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // TODO: 实现实际的调试面板 UI
  // 可以用 Modal + 表格展示所有特性开关

  return null;
}

// ============ 导出 ============
export default {
  FeatureFlagsProvider,
  useFeatureFlags,
  useFeatureFlag,
  FeatureFlagsDevtools
};
```

### 5.2 与 Module Federation 集成

```typescript
// shared/utils/mfFeatureFlags.ts

/**
 * Module Federation 与特性开关集成
 *
 * 场景：
 * - Remote 模块可能依赖某些特性开关
 * - 但 Remote 模块在编译时不知道这些开关的状态
 * - 需要在运行时从 Host 获取
 */

import { FeatureFlagsConfig, isEnabled } from './featureFlags';

/**
 * Remote 模块初始化参数
 * 在加载 Remote 模块时传入
 */
export interface RemoteInitParams {
  /** 特性开关配置 */
  featureFlags: FeatureFlagsConfig;
  /** 当前用户信息 */
  user?: {
    id: string;
    name: string;
    roles: string[];
  };
  /** 宿主环境信息 */
  host: {
    version: string;
    env: 'development' | 'production' | 'staging';
  };
}

/**
 * 动态加载 Remote 模块（带特性开关）
 *
 * @example
 * ```typescript
 * const RemoteOrder = await loadRemoteWithFeatureFlags(
 *   () => import('remote_order/OrderList'),
 *   { key: 'order-module', enabled: true }
 * );
 * ```
 */
export async function loadRemoteWithFeatureFlags<T>(
  // 动态导入函数
  loader: () => Promise<any>,
  // 特性开关条件
  flag: { key: string; enabled: boolean }
): Promise<T | null> {
  // 检查特性开关
  if (!isEnabled(flag.key)) {
    console.log(`[MF] Feature flag "${flag.key}" is disabled, skipping module load`);
    return null;
  }

  if (!flag.enabled) {
    return null;
  }

  // 加载 Remote 模块
  try {
    const module = await loader();
    return module.default || module;
  } catch (error) {
    console.error(`[MF] Failed to load remote module:`, error);
    return null;
  }
}

/**
 * Remote 模块包装器
 * 用于自动处理特性开关和懒加载
 */
export function createRemoteWrapper(remoteName: string, flagKey: string) {
  return function RemoteComponent(props: any) {
    const { isEnabled } = useFeatureFlags();
    const enabled = isEnabled(flagKey);

    // 特性未启用时显示占位
    if (!enabled) {
      return (
        <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
          该功能正在升级中，请稍后再试...
        </div>
      );
    }

    // 懒加载 Remote 组件
    const RemoteComponent = React.lazy(() =>
      import(/* webpackIgnore: true */ `${remoteName}`)
    );

    return (
      <React.Suspense fallback={<div>加载中...</div>}>
        <RemoteComponent {...props} />
      </React.Suspense>
    );
  };
}

// ============ Host 端集成 ============

/**
 * 获取 Remote 模块的初始化参数
 * 在 Host 应用中调用，传递给 Remote 模块
 */
export function getRemoteInitParams(): RemoteInitParams {
  return {
    featureFlags: window.__FEATURE_FLAGS__,
    user: window.__USER__,
    host: {
      version: process.env.APP_VERSION || '1.0.0',
      env: process.env.NODE_ENV as any
    }
  };
}

/**
 * 在 HTML 中注入初始化参数
 * 在 index.html 中添加：
 * ```html
 * <script>
 *   window.__FEATURE_FLAGS__ = /* 从后端获取的配置 */;
 *   window.__USER__ = /* 从后端获取的用户信息 */;
 * </script>
 * ```
 */

// ============ Remote 端使用 ============

/**
 * Remote 模块获取初始化参数
 * 在 Remote 模块的 bootstrap.ts 中调用
 */
export function getInitParams(): RemoteInitParams | null {
  return (window as any).__MF_INIT_PARAMS__ || null;
}

/**
 * Remote 模块根据特性开关决定加载哪些子模块
 */
export function useRemoteFeatureFlag(key: string): boolean {
  const params = getInitParams();
  if (!params) return false;

  const flag = params.featureFlags.flags.find(f => f.key === key);
  return flag?.enabled ?? false;
}
```

---

## 六、模块间通信

### 6.1 事件总线

```typescript
// shared/utils/eventBus.ts

/**
 * 事件总线
 * 用于 Module Federation 中不同模块间的通信
 *
 * 为什么需要事件总线？
 * 1. Remote 模块之间不能直接调用（解耦）
 * 2. 需要一个中介来传递消息
 * 3. 支持发布-订阅模式
 */

type EventHandler = (data: any) => void;

class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  /**
   * 订阅事件
   * @param event 事件名称
   * @param handler 事件处理函数
   * @returns 取消订阅函数
   */
  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // 返回取消订阅函数
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  /**
   * 发布事件
   * @param event 事件名称
   * @param data 事件数据
   */
  emit(event: string, data: any): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[EventBus] Error in handler for "${event}":`, error);
        }
      });
    }
  }

  /**
   * 取消订阅
   * @param event 事件名称
   * @param handler 要移除的处理函数
   */
  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  /**
   * 清空所有事件订阅
   */
  clear(): void {
    this.handlers.clear();
  }
}

// 单例
export const globalEventBus = new EventBus();

// 预定义事件类型
export const Events = {
  // 用户相关
  USER_LOGIN: 'user:login',
  USER_LOGOUT: 'user:logout',
  USER_PROFILE_UPDATED: 'user:profile-updated',

  // 订单相关
  ORDER_CREATED: 'order:created',
  ORDER_PAID: 'order:paid',
  ORDER_SHIPPED: 'order:shipped',

  // 购物车相关
  CART_UPDATED: 'cart:updated',
  CART_CLEARED: 'cart:cleared',

  // 应用相关
  THEME_CHANGED: 'app:theme-changed',
  LANGUAGE_CHANGED: 'app:language-changed'
} as const;

// ============ 在 React 中使用 ============

/**
 * 事件订阅 Hook
 *
 * @example
 * ```tsx
 * function CartBadge() {
 *   const [count, setCount] = useState(0);
 *
 *   useEventSubscription(Events.CART_UPDATED, (data) => {
 *     setCount(data.itemCount);
 *   });
 *
 *   return <span>{count}</span>;
 * }
 * ```
 */
export function useEventSubscription(event: string, handler: EventHandler) {
  useEffect(() => {
    const unsubscribe = globalEventBus.on(event, handler);
    return unsubscribe;
  }, [event, handler]);
}
```

---

## 七、开发与部署

### 7.1 开发环境启动

```bash
#!/bin/bash
# scripts/dev-mf.sh

# 启动 Host 应用
echo "Starting Host (shell) on port 3000..."
cd shell && npm start &

# 启动 Remote 模块（并行）
echo "Starting Remote modules..."
cd apps/module-order && npm start &
cd apps/module-user && npm start &
cd apps/module-payment && npm start &

# 等待所有服务启动
wait
```

### 7.2 共享依赖版本对齐

```javascript
// package.json (Root level)
{
  "name": "mf-root",
  "private": true,
  "workspaces": [
    "apps/*",
    "shell",
    "shared"
  ],
  "devDependencies": {
    "react": "^18.2.0",      // 统一版本
    "react-dom": "^18.2.0",
    "typescript": "^5.0.0"
  },
  "scripts": {
    "dev": "concurrently \"npm run dev:shell\" \"npm run dev:order\" \"npm run dev:user\" \"npm run dev:payment\"",
    "dev:shell": "cd shell && npm start",
    "dev:order": "cd apps/module-order && npm start",
    "dev:user": "cd apps/module-user && npm start",
    "dev:payment": "cd apps/module-payment && npm start"
  }
}
```

### 7.3 生产环境构建

```javascript
// webpack.config.prod.js

// 生产环境需要：
// 1. 代码分割优化
// 2. 远程模块预加载
// 3. 共享依赖 vendor bundle
// 4. Contenthash 缓存

module.exports = {
  // ... 基础配置
  output: {
    // 使用 contenthash 确保缓存失效
    filename: '[name].[contenthash].js',
    chunkFilename: '[id].[contenthash].js'
  },
  optimization: {
    splitChunks: {
      cacheGroups: {
        // 共享依赖 vendor
        vendor: {
          test: /[\\/]node_modules[\\/](react|react-dom|react-router)[\\/]/,
          name: 'vendor-react',
          chunks: 'all',
          priority: 20
        },
        // 其他 vendor
        otherVendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor-common',
          chunks: 'all',
          priority: 10
        }
      }
    },
    // 确保模块 ID 稳定
    moduleIds: 'deterministic'
  },
  plugins: [
    new ModuleFederationPlugin({
      // 生产环境远程地址
      remotes: {
        'remote-order': 'remote_order@https://cdn.example.com/remote-order/remoteEntry.js',
        'remote-user': 'remote_user@https://cdn.example.com/remote-user/remoteEntry.js',
        'remote-payment': 'remote_payment@https://cdn.example.com/remote-payment/remoteEntry.js'
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' }
      }
    })
  ]
};
```

---

## 八、故障隔离与降级

### 8.1 Remote 模块加载失败处理

```typescript
// shared/components/RemoteErrorBoundary.tsx

import React, { Component, ReactNode } from 'react';

interface Props {
  /** 模块名称（用于显示） */
  moduleName: string;
  /** 降级内容 */
  fallback?: ReactNode;
  /** 错误回调 */
  onError?: (error: Error, info: any) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Remote 模块错误边界
 *
 * 作用：
 * 1. 捕获 Remote 模块加载错误
 * 2. 显示降级 UI 而不是整页崩溃
 * 3. 记录错误日志便于排查
 *
 * @example
 * ```tsx
 * <RemoteErrorBoundary moduleName="订单模块">
 *   <Suspense fallback={<Loading />}>
 *     <OrderList />
 *   </Suspense>
 * </RemoteErrorBoundary>
 * ```
 */
export class RemoteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[RemoteErrorBoundary] ${this.props.moduleName} crashed:`, error, info);
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.hasError) {
      // 显示降级内容或默认提示
      return this.props.fallback || (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          background: '#f5f5f5',
          borderRadius: '8px',
          margin: '20px'
        }}>
          <h3 style={{ color: '#666' }}>{this.props.moduleName} 加载失败</h3>
          <p style={{ color: '#999' }}>请刷新页面重试，或稍后再试</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              background: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '20px'
            }}
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * 带错误边界的 Remote 组件
 */
export function withRemoteErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  moduleName: string
) {
  return function WrappedComponent(props: P) {
    return (
      <RemoteErrorBoundary moduleName={moduleName}>
        <Component {...props} />
      </RemoteErrorBoundary>
    );
  };
}
```

### 8.2 远程模块超时处理

```typescript
// shared/utils/remoteLoader.ts

/**
 * 带超时控制的 Remote 模块加载器
 */

import React from 'react';

interface RemoteModuleState {
  loading: boolean;
  error: Error | null;
  Component: React.ComponentType | null;
}

const TIMEOUT_MS = 10000; // 10秒超时

/**
 * 加载 Remote 模块（带超时）
 */
export async function loadRemoteWithTimeout(
  loader: () => Promise<any>,
  timeoutMs: number = TIMEOUT_MS
): Promise<any> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Remote module load timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const module = await Promise.race([
      loader(),
      timeoutPromise
    ]);
    clearTimeout(timeoutId!);
    return module;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * 远程模块加载器 Hook
 */
export function useRemoteLoader(remoteKey: string) {
  const [state, setState] = useState<RemoteModuleState>({
    loading: true,
    error: null,
    Component: null
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // 动态导入 Remote 模块
        const module = await loadRemoteWithTimeout(
          () => import(/* webpackIgnore: true */ remoteKey),
          TIMEOUT_MS
        );

        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            Component: module.default || module
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: error as Error,
            Component: null
          });
          console.error(`[RemoteLoader] Failed to load ${remoteKey}:`, error);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [remoteKey]);

  return state;
}
```

---

## 九、总结

### 9.1 架构优势

| 特性 | 描述 |
|------|------|
| **独立部署** | 每个模块可以独立部署，不影响其他模块 |
| **故障隔离** | 一个模块崩溃不会导致整个应用崩溃 |
| **按需加载** | 只加载当前需要的模块，减少首屏时间 |
| **团队自治** | 不同团队负责不同模块，独立开发 |
| **技术栈统一** | 共享依赖确保版本一致，避免重复下载 |
| **开发效率** | 模块可以单独启动，快速迭代 |

### 9.2 实施步骤

1. **准备阶段**（1-2周）
   - 统一依赖版本（React 18）
   - 建立 shared 共享库
   - 配置 CI/CD

2. **试点模块**（2-3周）
   - 选择非核心模块（如用户模块）
   - 验证构建、部署流程
   - 收集性能数据

3. **全面推广**（4-8周）
   - 按业务线拆分模块
   - 建立监控体系
   - 完善文档

### 9.3 注意事项

1. **版本管理**：所有模块使用相同版本的 React/React-DOM
2. **样式隔离**：使用 CSS Modules 或 BEM 避免样式冲突
3. **状态管理**：不要在模块间共享 zustand store，通过事件总线通信
4. **类型安全**：使用 TypeScript 和 d.ts 文件确保类型正确
5. **监控告警**：监控模块加载失败率，设置告警阈值

---

**文档版本**: v1.0.0
**更新日期**: 2026-05-13
**维护者**: 前端架构团队