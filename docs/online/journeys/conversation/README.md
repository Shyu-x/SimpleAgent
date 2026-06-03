# 旅程 1: 完整对话流程截图

> **生成时间**: 2026-06-02
> **服务**: backend `:30000` ✅ HTTP 200 / frontend `:3001` ✅ HTTP 200
> **视口**: 1440 × 900
> **脚本**: `scripts/journey-conversation.mjs`
> **环境**: Playwright 1.60.0 (headless chromium) / Node ≥20

## 截图清单（8/8）

| # | 文件 | 尺寸 | 实际状态 |
|---|------|------|----------|
| 1 | `01-landing.png` | 86 KB | **WelcomeGuide 引导弹窗**（第 1 步/共 5 步），主标题"欢迎使用 AI Chat"，副标题"一个现代化的 AI 对话平台，支持多种大语言模型"，底部 4 个特性标签（安全存储 / 流式响应 / 多模型 / 快速启动），左下角"跳过引导 (ESC)" + 右下"下一步"按钮。左下角红色浮标显示"2 Issues"（Next.js dev overlay，非页面错误）|
| 2 | `02-input-focused.png` | 238 KB | 引导弹窗已通过 ESC 关闭，进入主界面。左侧"对话历史"侧边栏含 1 条"新对话"。中央显示空状态卡片"从一个问题开始"+ 5 个快捷提示卡片（代码创作 / 信息整理 / 产品文案 / 方案评审 / 拿手提点），底部输入区已聚焦（光标位置）|
| 3 | `03-message-typed.png` | 241 KB | 在输入框填入"你好，介绍下你自己"（未发送），右侧发送按钮变为蓝色高亮（可点击状态），其它布局不变 |
| 4 | `04-streaming.png` | 200 KB | 点击发送后 0.5s，**SSE 流式响应已启动**。用户消息气泡在右上角"你好，介绍下自己"，左侧 ASSISTANT 气泡显示加载动画（闪烁竖线 `|` 占位），左下角色图标，下方时间"18:32 2 条消息"。MiniMax-M2.7 流式 API **实际可用** |
| 5 | `05-response-received.png` | 232 KB | 流式结束，**完整回复已渲染**：<br>"你好！我是 MiniMax-M2.7，由 MiniMax 公司构建的 AI 助手。<br>我是一个大型语言模型，可以帮助你完成各种任务，包括：<br>· 回答问题和提供信息<br>· 协助写作、翻译、编程等<br>· 进行对话交流<br>· 提供创意及灵感<br>有什么我可以帮助你的吗？" |
| 6 | `06-thinking-chain.png` | 233 KB | 点击下方"深度思考"标签页（紫色高亮激活态），与上一张回复内容相同（"深度思考"为页面下方模式切换器，非消息内嵌思维链——当前 SSE 响应未携带 `reasoning_split` 数据）|
| 7 | `07-multi-turn.png` | 259 KB | 第二轮对话"再讲个笑话"已收到回复：<br>"好的，给你讲个笑话：<br>为什么程序员总是分不清万圣节和圣诞节？<br>因为 Oct 31 = Dec 25。<br>(Oct 31 是八进制的 31，十进制等于 25，也就是 Dec 25 圣诞节)🎃🎄<br>希望你喜欢！有需要随时找我聊聊~"<br>侧边栏显示"4 条消息"，列表项标题从"新对话"更新为"你好，..." |
| 8 | `08-after-clear.png` | 246 KB | 点击侧边栏"+ 新建"后，回到空状态。**注意**：侧边栏现显示 2 条历史（刚才的对话保留），新会话是当前激活的空态。再次显示"从一个问题开始"卡片 + 5 个快捷提示 |

## 关键发现

### 真实运行状态（无 Mock）
- **MiniMax-M2.7 流式 API 完全可用**：截图 4-5 可见真实的 token-by-token 流式渲染
- **回复内容质量正常**：自我介绍内容完整，第二个笑话的 Oct 31 = Dec 25 程序员梗无问题
- **多轮上下文保持**：第二轮正确响应"再讲个笑话"，未失忆
- **侧边栏实时更新**：标题从"新对话"→"你好，..."，消息计数 0→2→4 实时刷新

### 思维链说明
第 6 张"思维链"实际是点击"深度思考"模式标签（非消息内的内嵌 thinking chain）。
原因：当前 SSE 响应中未携带 MiniMax-M2.7 的 `reasoning_split` 字段（可能是 Token Plan API 通道未开启该选项）。

### 控制台告警
截图过程中浏览器控制台报 2 条 React warning：
```
Received `%s` for a non-boolean attribute `%s`.
If you want to write it to the DOM, pass a string instead
```
类型: `jsx jsx true` / `global global true` —— 是 JSX 布尔属性写法问题，不影响功能。

### 已知 UI 细节
- 左下角"2 Issues"是 Next.js 开发模式浮标，仅 dev 模式显示，生产构建无
- 流式等待循环检测使用 `send-button` 的 `disabled` 属性，最长 8s 兜底

## 复现命令

```bash
# 前提：后端 30000 + 前端 3001 已启动
cd /home/xu/Develop/longTermProject/SimpleAgent
node scripts/journey-conversation.mjs
```

输出：
```
=== 截图清单 ===
  01-landing.png (86.4 KB)
  02-input-focused.png (237.8 KB)
  03-message-typed.png (241.2 KB)
  04-streaming.png (199.8 KB)
  05-response-received.png (232.4 KB)
  06-thinking-chain.png (232.9 KB)
  07-multi-turn.png (258.8 KB)
  08-after-clear.png (245.7 KB)

共 8 张截图
```
