/**
 * 订单列表组件
 */

import React from 'react';

export interface OrderListProps {
  status?: 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled';
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onOrderClick?: (orderId: string) => void;
}

const OrderList: React.FC<OrderListProps> = ({
  status,
  pageSize = 10,
  onPageChange,
  onOrderClick
}) => {
  return (
    <div className="order-list">
      <h2>订单列表</h2>
      <p>订单模块 - OrderList Component</p>
      <p>状态筛选: {status || '全部'}</p>
      <p>每页显示: {pageSize}</p>
    </div>
  );
};

export default OrderList;