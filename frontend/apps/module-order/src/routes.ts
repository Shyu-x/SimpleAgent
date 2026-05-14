/**
 * 订单模块路由配置
 */

import React from 'react';

export const orderRoutes = [
  {
    path: '/orders',
    component: React.lazy(() => import('./components/OrderList')),
    exact: true
  },
  {
    path: '/orders/:id',
    component: React.lazy(() => import('./components/OrderDetail')),
    exact: false
  },
  {
    path: '/orders/create',
    component: React.lazy(() => import('./components/OrderCreateModal')),
    exact: true
  }
];

export default orderRoutes;