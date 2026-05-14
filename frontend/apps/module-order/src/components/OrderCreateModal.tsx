/**
 * 订单创建弹窗组件
 */

import React from 'react';

export interface OrderCreateModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (orderId: string) => void;
}

const OrderCreateModal: React.FC<OrderCreateModalProps> = ({
  visible,
  onClose,
  onSuccess
}) => {
  if (!visible) return null;

  return (
    <div className="order-create-modal">
      <h2>创建订单</h2>
      <p>订单模块 - OrderCreateModal Component</p>
      <button onClick={() => onSuccess('order-' + Date.now())}>创建</button>
      <button onClick={onClose}>关闭</button>
    </div>
  );
};

export default OrderCreateModal;