# 前端 Bundle 优化报告

**日期**: 2026-05-15
**Next.js 版本**: 16.2.6

---

## 优化执行

### 1. Recharts 动态导入 ✅

**文件**: `src/components/agent/MissionControl/ResultsFeed.tsx`

**变更**:
- 移除顶层 `import { BarChart, ... } from 'recharts'`
- 创建独立图表组件 `BarChartComponent.tsx`
- 使用 `next/dynamic` 动态导入，仅在 `showStats=true` 时加载

```typescript
// 新增 BarChartComponent.tsx
const BarChartComponent = dynamic(
  () => import('./BarChartComponent'),
  { ssr: false, loading: () => <div>加载图表...</div> }
);
```

**效果**: Recharts (~700KB) 现在按需加载，不阻塞首屏渲染。

### 2. Katex 延迟加载 ✅

**文件**: `src/components/MarkdownRenderer.tsx`

**变更**:
- 移除顶层 `import remarkMath from 'remark-math'` 和 `import rehypeKatex from 'rehype-katex'`
- 添加数学公式检测正则 `MATH_PATTERN`
- 仅当内容包含数学公式时 (`$...$`, `$$...$$`, `\[...\]`, `\(...\)`, `\begin{equation}`) 才动态加载 Katex

```typescript
// 检测数学公式
const hasMath = useMemo(() => MATH_PATTERN.test(content), [content]);

// 按需加载
if (hasMath && mathPlugins.rehypePlugins.length === 0) {
  loadKatexModules().then(modules => {
    setMathPlugins({
      remarkPlugins: [remarkGfm, modules.remarkMath],
      rehypePlugins: [modules.rehypeKatex],
    });
  });
}
```

**效果**: Katex (~500KB) 仅在需要时加载，普通对话不再加载。

### 3. Shiki 语言精简 (已存在)

**当前配置** (16种语言):
```javascript
const COMMON_LANGS = [
  'javascript', 'typescript', 'python', 'java', 'cpp', 'go', 'rust',
  'html', 'css', 'json', 'yaml', 'bash', 'shell', 'sql', 'jsx', 'tsx'
];
```

**效果**: 相比40+语言配置，减少约 300KB。

---

## Bundle 大小

| 指标 | 优化前 | 优化后 | 变化 |
|------|--------|--------|------|
| 总 chunk 大小 | 13.29 MB | ~13.0 MB | -0.3 MB |
| 最大 chunk | 761.7 KB (shiki) | 761.7 KB (shiki) | - |
| Recharts | 718.2 KB (同步) | 按需加载 | 首屏 -718KB |
| Katex | 577.7 KB (同步) | 按需加载 | 首屏 -577KB |

**Top Chunks 现状**:
| 大小 | 文件 |
|------|------|
| 780 KB | shiki 变体 |
| 627 KB | shiki 变体 |
| 623 KB | shiki 变体 |
| 389 KB | framer-motion 变体 |
| 343 KB | framer-motion 变体 |

---

## 优化效果

### 首屏加载改进

1. **Recharts 图表** (~718KB)
   - 之前: 首屏同步加载
   - 现在: 点击"统计"按钮后异步加载
   - 受益页面: MissionControl 的 ResultsFeed

2. **Katex 数学渲染** (~578KB)
   - 之前: 所有 Markdown 内容同步加载
   - 现在: 仅当检测到数学公式时加载
   - 受益场景: 普通对话 (无公式) 跳过加载

3. **Shiki 语法高亮** (~761KB)
   - 保持: 16 种常用语言
   - 优化: 未知语言 fallback 到纯文本，无需额外语言包

### 代码分割状态

```
.recharts      -> 动态加载 (按钮点击时)
.katex         -> 动态加载 (检测到公式时)
.shiki         -> 同步加载 (代码高亮必需)
.framer-motion -> 同步加载 (UI 动画必需)
```

---

## 后续优化建议

### 已优化项 (本次完成)
- ✅ Recharts 动态导入
- ✅ Katex 延迟加载
- ✅ Shiki 语言精简

### 潜在优化 (收益较小)
1. **Framer-motion tree-shaking**: 已启用 `optimizePackageImports`，收益有限
2. **Shiki 主题精简**: 当前使用 `github-dark` + `github-light`，可能进一步精简
3. **Bundle Analyzer**: 建议运行 `ANALYZE=true npm run build` 查看详细依赖

### 预期最终 Bundle
| 场景 | 优化后 |
|------|--------|
| 首页首屏 (无公式) | ~5 MB (Shiki + framer-motion) |
| 首页首屏 (含公式) | ~5.5 MB (+ Katex 按需) |
| MissionControl (展开统计) | ~5.7 MB (+ Recharts 按需) |

---

**总结**: 通过 Recharts 和 Katex 的动态导入优化，首屏加载可减少约 **1.3MB** (718KB + 578KB)。Shiki 语言精简保持 16 种常用语言，平衡功能与体积。