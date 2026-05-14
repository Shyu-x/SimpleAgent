# 模块划分说明

## 概述

本项目采用前后端分离架构，后端基于 Node.js/Express，前端基于 Next.js/React。两个模块独立构建、测试和部署。

## 模块列表

| 模块 | 服务名 | 端口 | 说明 |
|------|--------|------|------|
| `backend` | AI Chat 后端服务 | 30000 | 核心 API 服务 (Agent/RAG/A2A/HITL) |
| `frontend` | AI Chat 前端服务 | 8080 | Next.js Web 应用 |

## 模块结构

```
C:\Users\Xu\Desktop\chat玩具\
├── backend/                 # 后端模块
│   ├── src/
│   │   ├── routes/         # API 路由 (25+)
│   │   ├── services/       # 业务逻辑
│   │   ├── domain/         # 领域模型 (RAG/Agent/Search)
│   │   ├── infra/          # 基础设施 (熔断/限流/监控)
│   │   └── middleware/     # 中间件
│   ├── package.json
│   ├── Dockerfile
│   └── jest.config.js
│
├── frontend/               # 前端模块
│   ├── src/
│   │   ├── app/           # Next.js App Router
│   │   ├── components/     # React 组件
│   │   ├── stores/        # Zustand 状态管理
│   │   └── lib/           # 工具函数
│   ├── package.json
│   ├── Dockerfile
│   └── eslint.config.mjs
│
├── .gitlab-ci.yml          # 主流水线配置
└── docs/CI-CD/             # CI/CD 文档

## 触发条件

### Backend 后端模块

```yaml
only:
  changes:
    - backend/src/**/*.js      # 核心代码
    - backend/Dockerfile       # 构建配置
    - backend/package.json     # 依赖配置
    - backend/package-lock.json
```

### Frontend 前端模块

```yaml
only:
  changes:
    - frontend/src/**/*
    - frontend/Dockerfile
    - frontend/package.json
    - frontend/package-lock.json
```

## 模块独立性

每个模块具备以下独立性：

1. **独立 Dockerfile** - 可单独构建镜像
2. **独立 package.json** - 独立依赖管理
3. **独立测试** - 可单独运行测试
4. **独立部署** - 可单独部署到 K8s
5. **独立回滚** - 可单独回滚

## 模块间通信

### REST API 调用

模块间通过 HTTP REST API 进行通信：

```javascript
// Order 模块调用 User 服务
const userServiceUrl = process.env.USER_SERVICE_URL || 'http://user-service:30002';
const response = await fetch(`${userServiceUrl}/api/users/${userId}`);

// Order 模块调用 Payment 服务
const paymentServiceUrl = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:30003';
const response = await fetch(`${paymentServiceUrl}/api/payments/${paymentId}`);
```

### 服务发现

使用 Kubernetes DNS 进行服务发现：

```
http://<service-name>.<namespace>.svc.cluster.local:<port>
```

示例：
```
http://user-service.ai-chat-staging.svc.cluster.local:30002
```

## 健康检查

每个模块需要实现健康检查端点：

```javascript
// health.js
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    module: 'order',
    timestamp: new Date().toISOString()
  });
});
```

## Kubernetes 部署

### Deployment 配置

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: ai-chat-staging
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
    spec:
      containers:
        - name: order
          image: registry.gitlab.com/ai-chat-backend/order:latest
          ports:
            - containerPort: 30001
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: order-secrets
                  key: database-url
          readinessProbe:
            httpGet:
              path: /health
              port: 30001
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health
              port: 30001
            initialDelaySeconds: 30
            periodSeconds: 15
```

### Service 配置

```yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: ai-chat-staging
spec:
  type: ClusterIP
  selector:
    app: order-service
  ports:
    - port: 30001
      targetPort: 30001
```

## 扩展指南

### 添加新模块

1. 创建模块目录结构
2. 编写模块代码
3. 创建 Dockerfile
4. 创建 package.json
5. 更新 .gitlab-ci.yml 添加对应 job

### 模块移除

1. 删除模块目录
2. 移除 .gitlab-ci.yml 中的相关 job
3. 更新 Kubernetes 部署配置

## 相关文档

- [部署流程](./DEPLOYMENT.md)
- [.gitlab-ci.yml 详解](./gitlab-ci-reference.md)
