/**
 * 订单详情组件
 */

import React from 'react';

export interface OrderDetailProps {
  orderId: string;
  editable?: boolean;
  onBack?: () => void;
}

const OrderDetail: React.FC<OrderDetailProps> = ({
  orderId,
  editable = false,
  onBack
}) => {
  return (
    <div className="order-detail">
      <h2>订单详情</h2>
      <p>订单ID: {orderId}</p>
      <p>可编辑: {editable ? '是' : '否'}</p>
      {onBack && (
        <button onClick={onBack}>返回</button>
      )}
    </div>
  );
};

export default OrderDetail;