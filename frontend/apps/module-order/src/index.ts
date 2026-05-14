/**
 * 订单模块入口文件
 * 导出所有可被 Host 加载的组件
 */

export { default as OrderList } from './components/OrderList';
export { default as OrderDetail } from './components/OrderDetail';
export { default as OrderCreateModal } from './components/OrderCreateModal';

// 导出路由配置
export { orderRoutes } from './routes';