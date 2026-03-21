# AI Chat 前端

现代化AI对话平台前端，基于 Next.js 15 + React 19 + TypeScript + Tailwind CSS + Framer Motion。

## 功能特性

- 对话界面布局（左侧会话列表 + 右侧聊天区域）
- 消息展示（用户消息 + AI回复）
- 打字机效果（SSE流式输出）
- API配置界面（API Key、模型选择）
- 多模型支持
- 对话历史管理
- 多窗口聊天支持（水平分屏、垂直分屏、网格布局）
- 响应式设计（移动端优化）
- 平滑动画效果（framer-motion）
- 键盘快捷键
- Prompt模板选择
- 消息右键菜单
- 拖拽排序对话列表

## 技术栈

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Zustand（状态管理）
- react-markdown（Markdown渲染）
- framer-motion（动画）
- lucide-react（图标）

## 快速开始

### 1. 安装依赖

```bash
cd frontend
npm install
```

### 2. 运行开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看。

### 3. 配置API

点击右上角设置按钮，配置：
- API Key
- Base URL（默认: https://api.openai.com/v1）
- 模型选择

## 键盘快捷键

| 快捷键 | 功能 |
|---------|------|
| Ctrl + / | 打开快捷键帮助 |
| Ctrl + Shift + P | 打开Prompt选择器 |
| Ctrl + N | 新建对话 |
| Esc | 关闭弹窗/侧边栏 |

## 移动端支持

- 底部导航栏
- 底部弹出式设置面板
- 触摸手势（侧滑打开侧边栏）
- 优化的触摸目标尺寸（最小44px）
- 键盘弹出时的界面自适应

## 项目结构

```
frontend/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── layout.tsx    # 根布局
│   │   ├── page.tsx      # 主页面
│   │   └── globals.css   # 全局样式
│   ├── components/       # React组件
│   │   ├── animations/   # 动画组件库
│   │   │   ├── index.ts  # 动画组件导出
│   │   │   └── variants.ts # 动画变体配置
│   │   ├── ChatArea.tsx      # 聊天区域
│   │   ├── ChatInput.tsx     # 输入框
│   │   ├── ConversationList.tsx  # 会话列表
│   │   ├── Message.tsx       # 消息组件
│   │   ├── Settings.tsx      # 设置面板
│   │   ├── Typewriter.tsx    # 打字机效果
│   │   ├── Toast.tsx         # 通知组件
│   │   ├── MultiWindowChat.tsx # 多窗口聊天
│   │   ├── KeyboardShortcuts.tsx # 键盘快捷键
│   │   ├── PromptSelector.tsx # Prompt选择器
│   │   ├── MessageContextMenu.tsx # 消息右键菜单
│   │   └── ConversationContextMenu.tsx # 对话右键菜单
│   ├── store/            # Zustand状态管理
│   │   └── chatStore.ts
│   ├── lib/              # 工具函数
│   │   └── sse.ts        # SSE客户端
│   └── types/            # TypeScript类型
│       └── index.ts
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── next.config.js
```

## 动画系统

项目使用 framer-motion 实现流畅的动画效果。所有动画都支持在设置中禁用。

### 可用的动画组件

在 `src/components/animations/index.ts` 中提供了以下可复用的动画组件：

- `MotionDiv` - 基础动画容器
- `StaggerChildren` - 交错动画容器
- `AnimatedItem` - 动画列表项
- `MotionButton` - 带悬停动画的按钮
- `PageTransition` - 页面过渡
- `ModalAnimation` - 模态框动画
- `Skeleton` - 骨架屏动画
- `LoadingDots` - 加载点动画

### 使用示例

```tsx
import { MotionDiv, AnimatePresence } from '@/components/animations';

function MyComponent() {
  return (
    <MotionDiv className="my-content">
      <h1>带动画的内容</h1>
    </MotionDiv>
  );
}
```

### 动画配置

在设置面板中可以：
- 启用/禁用所有动画
- 调整动画时长
- 自定义缓动曲线
