# i18n 验证报告 (2026-06-07)

## 配置
- i18n lib: next-intl (内联 `getRequestConfig` via `frontend/src/i18n/request.ts`)
- locales: `zh-CN` (默认), `en`
- strategy: 服务端 inline routing, 无 URL 前缀, 无 `middleware.ts`
  - 语言切换走 cookie / `Accept-Language` / `NEXT_LOCALE`
  - 通过 `dynamic import` 按需加载 `frontend/locales/{locale}.json`

## 文件清单
| 文件 | 行数 | 角色 |
|------|------|------|
| `frontend/src/i18n/request.ts` | 27 | `getRequestConfig` 配置 + locale 校验 |
| `frontend/locales/zh-CN.json` | 282 | 默认翻译 (9 顶层 ns, 163 内层 keys) |
| `frontend/locales/en.json` | 282 | 英文翻译 (结构镜像) |
| 抽字符串组件 | 5 | `app/page.tsx`, `ChatInput`, `ConversationList`, `IntentSuggestionBanner`, `admin/AdminDashboard` |

## 一致性 (zh-CN vs en)

### 顶层 namespace
| 顶层 | zh-CN keys | en keys | 状态 |
|------|------------|---------|------|
| `admin` | 12 | 12 | OK |
| `chat` | 4 (含嵌套) | 4 | OK |
| `common` | 45 | 45 | OK |
| `conversation` | 19 | 19 | OK |
| `hitl` | 7 | 7 | OK |
| `intent` | 10 | 10 | OK |
| `page` | 10 | 10 | OK |
| `thinking` | 8 | 8 | OK (未在代码中使用, 预留给 ThinkingChain) |
| `welcome` | 48 | 48 | OK (未在代码中使用, 预留给 WelcomeGuide) |

- 顶层 key diff: 空集 (完全一致)
- 内层 keys 总数: zh-CN 163 / en 163 (一致)
- 翻译抽查: `common.save='保存'/'Save'`, `chat.input.placeholder='发送消息...'/'Send a message...'`, `page.newChat='新对话'/'New Chat'` — 均为真实翻译

## 命名空间绑定
- 代码使用的 ns: `['admin', 'chat', 'common', 'conversation', 'hitl', 'intent', 'page']`
- locale 中存在的 ns: `['admin', 'chat', 'common', 'conversation', 'hitl', 'intent', 'page', 'thinking', 'welcome']`
- 缺失/孤儿: **无** (代码用到的 7 个 ns 全部存在; 2 个未用 ns 仅为预留)

## useTranslations 调用规范
- 全部 11 处 `useTranslations(...)` 均有引号包裹 (无裸 namespace)
- 文件分布:
  - `src/app/page.tsx`: `t`(page), `tConv`(conversation), `tCommon`(common), `tHitl`(hitl) × 2
  - `src/components/ChatInput.tsx`: `t`(chat), `tCommon`(common)
  - `src/components/ConversationList.tsx`: `t`(conversation), `tCommon`(common)
  - `src/components/IntentSuggestionBanner.tsx`: `t`(intent)
  - `src/components/admin/AdminDashboard.tsx`: `t`(admin)

## 运行时验证
- [x] `GET /` → 200 OK
- [x] `GET /admin` → 200 OK
- [x] HTML `<html lang="zh-CN">` — 默认 locale 生效
- [x] 主页渲染中文: 匹配 `发送`, `工具`, `会话`, `设置`, `AI Chat`
- [x] admin 页渲染中文: 匹配 `管理`, `系统`, `仪表盘`, `状态`
- [x] 修复后 `GET /` 仍 200 (无回归)
- [x] next-intl runtime marker (`next-intl`) 在 HTML 中出现

## 关键引用校验 (脚本化穷举)
对 5 个文件的所有 `t(` / `tCommon(` / `tConv(` / `tHitl(` / `tAdmin(` 调用做 dot-path 解析校验:

| Locale | 解析失败 |
|--------|----------|
| zh-CN.json | **0** (修复后) |
| en.json | **0** (修复后) |

## 问题清单

### P1 (已修复) - IntentSuggestionBanner 重复前缀 bug
- **位置**: `frontend/src/components/IntentSuggestionBanner.tsx:82,85,87`
- **症状**: `t('intent.confidence.high')` 等 3 处调用, 但 `t` 已被 `useTranslations('intent')` 绑定到 `intent` namespace, 实际查找路径变成 `intent.intent.confidence.high` (不存在)
- **触发条件**: 意图置信度渲染分支 (`getConfidenceLevel`)
- **影响**: 运行时 next-intl 会 fallback 到显示 key 字符串本身, 即页面上出现 `intent.confidence.high` / `intent.confidence.medium` / `intent.confidence.low` 而非"高置信"/"中置信"/"低置信"
- **修复**: 已改为 `t('confidence.high')` / `t('confidence.medium')` / `t('confidence.low')`
- **验证**: 脚本重跑 0 失败, dev 服务仍 200

### P3 (文档漂移, 非代码问题)
- `CLAUDE.md` 声称 locale 文件有 "238+ keys", 实际内层 keys 总数 163
- 282 行是文件行数 (含格式化), 不是 key 计数
- 建议下次文档刷新时改为 "163 keys across 9 namespaces"

### P4 (预留在 locale 中但未用)
- `thinking` 和 `welcome` 两个 namespace 当前无组件引用
- 不构成 broken reference, 是 forward-compatible 预留
- 若短期内无对应组件要迁移, 可考虑暂时删减以减小 bundle

## 结论

**i18n 完整工作 ✅** (1 个 P1 bug 已修复)

- 9 个 namespace × 163 keys × 2 locale, 结构与翻译完全镜像
- 5 个组件 11 处 `useTranslations` 全部合法, 全部 t() 调用可解析
- dev 服务正常, 中文为默认, 切换到 en 也无 key 缺失
- 修复后零回归
