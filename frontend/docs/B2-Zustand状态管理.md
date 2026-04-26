# Zustand状态管理 - 极简而强大

## 核心问题
Redux 那么强大，为什么还要 Zustand？

## Redux 的问题

### 1. 模板代码太多
```javascript
// Redux: 定义一个简单的 counter
// actions.js
export const increment = () => ({ type: 'INCREMENT' });
export const decrement = () => ({ type: 'DECREMENT' });

// reducer.js
const counterReducer = (state = 0, action) => {
  switch (action.type) {
    case 'INCREMENT': return state + 1;
    case 'DECREMENT': return state - 1;
    default: return state;
  }
};

// store.js
import { createStore } from 'redux';
export const store = createStore(counterReducer);

// component.js
import { connect } from 'react-redux';
function Counter({ count, increment, decrement }) {
  return (
    <div>
      <span>{count}</span>
      <button onClick={increment}>+</button>
      <button onClick={decrement}>-</button>
    </div>
  );
}
const mapStateToProps = state => ({ count: state });
export default connect(mapStateToProps, { increment, decrement })(Counter);
```

### 2. 概念复杂
- Action、Reducer、Store、Dispatch
- Middleware、Thunk、Saga
- 异步处理需要额外库

## Zustand 的解决方案

### 极简 API
```typescript
import { create } from 'zustand';

// 一个文件搞定所有
interface CounterState {
  count: number;
  increment: () => void;
  decrement: () => void;
}

const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
}));

// 组件中使用 - 直接使用 Hook
function Counter() {
  const { count, increment, decrement } = useCounterStore();
  return (
    <div>
      <span>{count}</span>
      <button onClick={increment}>+</button>
      <button onClick={decrement}>-</button>
    </div>
  );
}
```

### 对比

| 维度 | Redux | Zustand |
|------|-------|---------|
| 代码量 | 50+ 行 | 15 行 |
| 学习曲线 | 陡峭 | 平缓 |
| 性能 | 好 | 更好（原生支持） |
| DevTools | 丰富 | 基础 |
| 适用场景 | 大型复杂应用 | 中小型应用 |

## 核心概念

### 1. create() 函数
```typescript
const useStore = create((set, get) => ({
  // 状态
  count: 0,

  // 更新函数 (set)
  increment: () => set((state) => ({ count: state.count + 1 })),

  // 获取当前状态 (get)
  getCount: () => get().count,
}));
```

### 2. set() 函数
```typescript
// 方式1: 传入对象（常用）
set({ count: 5 });

// 方式2: 传入函数（推荐，用于基于当前状态更新）
set((state) => ({ count: state.count + 1 }));

// 错误方式: 直接修改
// set({ count: state.count + 1 }); // 如果不用函数可能出问题
```

### 3. get() 函数
```typescript
const useStore = create((set, get) => ({
  count: 0,
  double: () => get().count * 2,  // 获取当前状态
}));
```

## 在项目中的实际应用

### chatStore.ts
```typescript
// frontend/src/store/chatStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatState {
  // 消息列表
  messages: Message[];
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void;
  loadHistory: (messages: Message[]) => void;
  clearMessages: () => void;

  // SSE 流式状态
  isStreaming: boolean;
  setStreaming: (streaming: boolean) => void;

  // 当前输入
  inputValue: string;
  setInputValue: (value: string) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      isStreaming: false,
      inputValue: '',

      addMessage: (msg) => {
        const newMsg: Message = {
          ...msg,
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
        };
        set((state) => ({
          messages: [...state.messages, newMsg],
        }));
      },

      loadHistory: (messages) => set({ messages }),

      clearMessages: () => set({ messages: [] }),

      setStreaming: (streaming) => set({ isStreaming: streaming }),

      setInputValue: (value) => set({ inputValue: value }),
    }),
    {
      name: 'chat-storage',  // localStorage 的 key
      partialize: (state) => ({
        // 只持久化这些字段
        messages: state.messages,
      }),
    }
  )
);
```

### 多个 Store 分离
```typescript
// stores/chatStore.ts
export const useChatStore = create(...)  // 聊天状态

// stores/uiStore.ts
export const useUIStore = create((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}))

// stores/userStore.ts
export const useUserStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}))
```

## 持久化

### sessionStorage vs localStorage
```typescript
import { createJSONStorage } from 'zustand/middleware';

// sessionStorage（浏览器关闭后消失）
export const useSessionStore = create(
  persist(
    (set) => ({ /* ... */ }),
    {
      name: 'session-storage',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

// localStorage（永久保存）
export const usePersistentStore = create(
  persist(
    (set) => ({ /* ... */ }),
    {
      name: 'persistent-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
```

## 中间件

### 1. devtools（开发工具）
```typescript
import { devtools } from 'zustand/middleware';

const useStore = create(
  devtools(
    (set) => ({ /* ... */ }),
    { name: 'MyStore' }
  )
);
```

### 2. subscribe（订阅变化）
```typescript
const unsub = useStore.subscribe(
  (state) => state.count,  // 选择要监听的状态
  (newCount, prevCount) => {
    console.log(`count changed: ${prevCount} -> ${newCount}`);
  }
);

// 取消订阅
unsub();
```

## 新手常见问题

Q: 什么时候用 Zustand？
A: 需要跨组件共享状态、状态需要持久化、中等复杂度应用

Q: Redux 和 Zustand 怎么选？
A: 小到中型项目用 Zustand，大型复杂项目用 Redux

Q: 状态变化组件不更新怎么办？
A: 确保使用的是 `useStore()` hook 而不是直接导入 store

Q: 怎么调试 Zustand？
A: 使用 Chrome 插件 "Zustand DevTools" 或 React DevTools

## 延伸学习
- 官方文档：https://docs.pmnd.rs/zustand
- 项目源码：`frontend/src/store/chatStore.ts`
- 中间件：https://github.com/pmndrs/zustand/wiki/Zustand-Middleware
