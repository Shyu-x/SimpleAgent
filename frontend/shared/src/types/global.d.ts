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
declare module 'remote-order/OrderList' {
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

declare module 'remote-order/OrderDetail' {
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

declare module 'remote-order/OrderCreateModal' {
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

declare module 'remote-order/routes' {
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
declare module 'remote-user/Profile' {
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

declare module 'remote-user/Settings' {
  import { ComponentType } from 'react';

  export interface UserSettingsProps {
    /** 设置分类 */
    category?: 'account' | 'privacy' | 'notifications' | 'appearance';
  }

  const UserSettings: ComponentType<UserSettingsProps>;
  export default UserSettings;
}

declare module 'remote-user/Avatar' {
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
declare module 'remote-payment/PaymentForm' {
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

declare module 'remote-payment/PaymentResult' {
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

declare module 'remote-payment/PaymentHistory' {
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

/**
 * 全局变量声明
 */
interface Window {
  /** 用户 ID（由后端注入） */
  __USER_ID__?: string;

  /** 用户信息（由后端注入） */
  __USER__?: {
    id: string;
    name: string;
    roles: string[];
  };

  /** 特性开关配置（由后端注入） */
  __FEATURE_FLAGS__?: import('../config/featureFlags').FeatureFlagsConfig;

  /** Module Federation 初始化参数 */
  __MF_INIT_PARAMS__?: import('../config/featureFlags').RemoteInitParams;
}