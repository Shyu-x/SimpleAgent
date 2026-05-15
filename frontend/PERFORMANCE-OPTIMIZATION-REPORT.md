# 前端性能分析与优化报告

**生成时间**: 2026-05-15
**Next.js 版本**: 16.2.6
**分析范围**: Bundle、依赖、运行时性能

---

## 1. Bundle 分析

### 1.1 总览
| 指标 | 数值 |
|------|------|
| 总 chunk 数量 | 337 个 |
| 总大小 | **13.29 MB** |
| 最大 chunk | 761.7 KB |
| > 500KB chunks | 5 个 |

### 1.2 大小分布
| 大小范围 | 数量 |
|----------|------|
| < 10 KB | 119 |
| 10-50 KB | 150 |
| 50-100 KB | 40 |
| 100-200 KB | 21 |
| 200-500 KB | 2 |
| > 500 KB | 5 |

### 1.3 Top 10 最大 Chunk
| 排名 | 大小 | 文件 |
|------|------|------|
| 1 | 761.7 KB | shiki (语法高亮引擎) |
| 2 | 718.2 KB | recharts (图表库) |
| 3 | 612.1 KB | framer-motion (动画) |
| 4 | 608.0 KB | shiki 变体 |
| 5 | 577.7 KB | katex (数学公式) |
| 6 | 256.4 KB | MDX/Markdown 处理 |
| 7 | 227.3 KB | Lucide 图标包 |
| 8 | 185.6 KB | React 运行时 |
| 9 | 179.6 KB | React DOM |
| 10 | 177.0 KB | 状态管理 |

---

## 2. 依赖分析

### 2.1 大型依赖包 (按体积估算)
| 包名 | 版本 | 估算大小 | 问题 |
|------|------|----------|------|
| shiki | 4.0.2 | 600-800 KB | 包含 40+ 语言高亮规则 |
| recharts | 3.8.1 | 200-400 KB | 图表库过于庞大 |
| framer-motion | 12.38.0 | 100-200 KB | 动画功能强大但重量级 |
| katex | 0.16.46 | 100-200 KB | 数学公式渲染 |
| highlight.js | 11.11.1 | **应移除** | 已用 shiki 替代 |

### 2.2 重复依赖问题
发现多版本依赖，主要影响构建体积：
- `debug`: 3 个版本
- `ms`: 2 个版本
- `semver`: 2 个版本
- `commander`: 5 个版本

**关键依赖 (正常)**:
- react: 1 版本 (19.0.0)
- react-dom: 1 版本
- zustand: 1 版本 (5.0.0)

---

## 3. 运行时性能分析

### 3.1 Zustand Store 问题

**UnifiedStore 过于庞大**:
```
unifiedStore 包含:
- 对话状态 (conversations, messages)
- 全局记忆 (globalMemories) 
- 自定义提示词 (customPrompts)
- 设置状态 (settings)
- API 配置 (apiConfig)
- UI 状态 (appMode, focusMode, etc.)
```

**问题**: 任何状态变化都会导致所有订阅者重渲染

**ChatArea.tsx 使用了 9 个选择器订阅**:
- conversations (1次)
- activeConversationId (1次)
- addMessage, updateLastMessage 等 actions (7次)

### 3.2 已使用的代码分割
- `ToolMarketplace`: dynamic import ✓
- `WelcomeGuide`: dynamic import ✓
- 管理后台页面: 懒加载 ✓
- 移动端 AgentWorkspace: dynamic import ✓

### 3.3 API 调用分析
发现 8 个 fetch 调用，主要端点：
- `/api/v1/chat/completions` (SSE 聊天)
- `/api/rag/kb/*` (知识库)
- `/api/health` (健康检查)

**优化空间**: API 客户端可添加请求合并

---

## 4. 优化建议

### 4.1 紧急优化 (立即实施)

#### A. 移除 highlight.js
```bash
npm uninstall highlight.js
```
**收益**: 节省 ~50-100KB (已用 shiki 替代)

#### B. Shiki 按语言加载
当前加载 40+ 语言，应按需加载：
```typescript
// 当前 (全量加载)
langs: ['javascript', 'typescript', 'python', ... 40+]

// 建议 (按需加载)
langs: ['javascript', 'typescript', 'python', 'bash', 'json']
```
**收益**: 节省 300-500KB

#### C. Recharts 动态导入
```typescript
const PerformanceChart = dynamic(() => import('@/components/PerformanceChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />
});
```

#### D. 拆分 UnifiedStore
建议拆分为:
- `useConversationStore`: 对话 CRUD
- `useMessageStore`: 消息操作  
- `useSettingsStore`: 设置
- `useUIStore`: UI 状态

### 4.2 中期优化 (1-2周)

| 优化项 | 预期收益 | 复杂度 |
|--------|----------|--------|
| Katex 动态加载 | 100-150KB | 中 |
| Framer-motion 树摇 | 50-100KB | 低 |
| 图片压缩/懒加载 | 首屏 -200ms | 低 |
| Zustand 拆分 | 运行时性能提升 | 高 |
| 启用 Brotli 压缩 | 60% 压缩率 | 低 |

### 4.3 高级优化 (长期)

- 迁移到 Turbopack (已启用)
- 增量构建优化
- 预取关键路由
- Service Worker 缓存策略

---

## 5. Next.js 配置优化

当前 `next.config.js` 已有优化:
- ✓ `optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion']`
- ✓ 图片 `formats: ['image/avif', 'image/webp']`
- ✓ `removeConsole` 生产环境
- ✓ Immutable 静态资源缓存

**建议添加**:
```javascript
// next.config.js
{
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion'],
    // 新增
    optimizeCss: true,  // critters
  },
  // 新增压缩
  compress: true,
}
```

---

## 6. 预期效果

| 优化项 | 优化前 | 优化后 | 收益 |
|--------|--------|--------|------|
| 移除 highlight.js | 13.29 MB | ~13.0 MB | -0.3 MB |
| Shiki 按需加载 | 13.29 MB | ~12.0 MB | -1.3 MB |
| Recharts 动态导入 | 12.0 MB | ~11.0 MB | -1.0 MB |
| 启用 Brotli | 11.0 MB | ~4.0 MB | -7.0 MB (传输) |

---

## 7. 验证建议

### 性能测试命令
```bash
# 重新构建
npm run build

# 检查 bundle 大小
du -sh .next/static/

# 使用 Lighthouse
npx lighthouse http://localhost:3001 --view
```

### 目标指标
| 指标 | 当前 | 目标 |
|------|------|------|
| JS Bundle (传输) | ~13 MB | < 5 MB |
| First Contentful Paint | - | < 1.5s |
| Largest Contentful Paint | - | < 2.5s |
| Time to Interactive | - | < 3.0s |

---

**报告生成**: 前端性能分析脚本
**下一步**: 实施上述优化建议
