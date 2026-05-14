/**
 * 模块化架构设计文档
 * ===================
 *
 * 本模块化方案旨在将 React + NestJS 老项目改造为可独立部署的微模块架构
 *
 * 设计目标：
 * 1. 模块独立部署 - 每个模块可单独发布、回滚
 * 2. 故障隔离 - 单模块故障不影响其他模块
 * 3. 团队自治 - 不同团队负责不同模块
 * 4. 技术异构 - 模块可使用不同技术栈
 *
 * 目录结构：
 * ├── modules/           # 业务模块
 * │   ├── module-order/  # 订单模块
 * │   ├── module-user/   # 用户模块
 * │   └── module-payment/# 支付模块
 * ├── common/           # 公共基础设施
 * │   ├── decorators/   # 装饰器
 * │   ├── filters/      # 异常过滤器
 * │   └── interceptors/ # 拦截器
 * ├── infra/            # 基础设施层
 * │   ├── database/     # 数据库连接
 * │   ├── cache/        # 缓存服务
 * │   ├── queue/        # 消息队列
 * │   └── config/       # 配置中心
 * └── gateway/          # API 网关
 */

export const MODULAR_ARCHITECTURE_VERSION = '1.0.0';
export const ARCHITECTURE_FEATURES = [
  '模块动态配置',
  '事件总线通信',
  '分库分表数据隔离',
  '读写分离',
  '独立部署',
  '故障隔离',
] as const;