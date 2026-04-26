# React设计思想 - 组件化与声明式编程

## 核心问题
传统命令式 UI 开发的问题是什么？

## 不使用组件化的后果

### 1. 代码重复
```javascript
// 传统方式：每次都要重新创建元素
const button1 = document.createElement('button');
button1.textContent = '提交';
button1.onclick = handleSubmit;
document.body.appendChild(button1);

const button2 = document.createElement('button');
button2.textContent = '取消';
button2.onclick = handleCancel;
document.body.appendChild(button2);
```

### 2. 状态管理混乱
- 多个地方修改同一份 DOM
- 难以追踪数据变化
- Bug 难以定位

### 3. 难以维护和测试
- 一个功能修改影响整个应用
- 无法单独测试某个 UI 单元

## React 的解决方案

### 核心概念

#### 1. 组件（Component）
组件是独立可复制的 UI 单元：
```jsx
// 函数组件 - 推荐方式
function Button({ text, onClick }) {
  return (
    <button onClick={onClick} className="btn">
      {text}
    </button>
  );
}

// 使用组件
<Button text="提交" onClick={handleSubmit} />
<Button text="取消" onClick={handleCancel} />
```

#### 2. 声明式编程
告诉"做什么"而不是"怎么做"：
```jsx
// 声明式：描述最终结果
function ChatMessage({ message }) {
  return <div className="message">{message.text}</div>;
}

// 对比：命令式
// const div = document.createElement('div');
// div.textContent = message.text;
// container.appendChild(div);
```

#### 3. Props 向下传递
数据从父组件流向子组件：
```jsx
// 父组件传递数据
function ChatArea({ messages }) {
  return (
    <div className="chat-area">
      {messages.map(msg => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
    </div>
  );
}

// 子组件接收 props
function ChatMessage({ message }) {
  return <div className="message">{message.text}</div>;
}
```

## 在项目中的实际应用

### 文件位置
- 主页面：`frontend/src/app/page.tsx`
- 聊天组件：`frontend/src/components/ChatArea.tsx`
- 输入框：`frontend/src/components/ChatInput.tsx`

### 核心组件示例
```tsx
// ChatInput.tsx - 消息输入组件
function ChatInput({ onSendMessage }) {
  const [input, setInput] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="输入消息..."
      />
      <button type="submit">发送</button>
    </form>
  );
}
```

## 虚拟 DOM 原理

### 为什么需要虚拟 DOM？
- 真实 DOM 操作昂贵
- 直接操作 DOM 触发重排重绘
- 批量更新减少性能损耗

### 工作流程
1. **状态变化** → setState() 被调用
2. **生成新 VDOM** → React 创建新的虚拟 DOM 树
3. **Diff 算法** → 对比新旧虚拟 DOM
4. **最小更新** → 只更新实际变化的真实 DOM

```
状态变化 → 创建新 VDOM → Diff 对比 → 最小更新
```

## 新手常见问题

Q: 为什么组件要用函数而不是类？
A: React 16.8 引入 Hooks 后，函数组件能完全替代类组件，且更简洁、更易测试

Q: Props 为什么不能修改？
A: Props 是只读的（不可变性），修改 Props 会破环数据流，导致 Bug

Q: 什么时候用 State？
A: 当数据会变化且影响 UI 时用 State，如用户输入、API 响应、展开/折叠状态

Q: 为什么需要 key 属性？
A: 帮助 React 识别每个元素，提高 Diff 算法效率，避免渲染错误

## 延伸学习

### 官方资源
- [React 官方文档](https://react.dev)
- [React Hooks 指南](https://react.dev/reference/react)

### 相关概念
- **Hooks**：useState、useEffect、useCallback、useMemo
- **Context**：跨层级传递数据
- **Reducer**：复杂状态逻辑

### 下一步
- 状态管理？→ [B2-Zustand状态管理.md](B2-Zustand状态管理.md)
- 组件设计？→ [B3-组件架构设计.md](B3-组件架构设计.md)
