# SimpleAgent 用户故事与验收清单

> 项目路径: `/home/xu/Develop/longTermProject/SimpleAgent`
> 文档版本: v1.0
> 更新日期: 2026-05-23

---

## 功能模块 1: 核心对话

### 用户故事 1.1 - 发送消息与流式回复
**作为** 任意用户
**我想要** 在输入框输入消息并发送，收到 AI 流式回复
**以便** 获得即时、智能的对话响应

**验收标准**:
- [ ] Given 用户已打开应用且已配置 API Key When 用户在输入框输入"你好"并点击发送 Then 系统显示用户消息气泡并显示"正在思考..."加载动画
- [ ] Given 系统正在流式返回回复 When 回复传输中 Then 消息以打字机效果逐字显示，包含智能停顿（句尾 2.5x、换行 1.8x）
- [ ] Given 系统正在流式返回回复 When 用户手动上滑查看历史 Then 显示"回到底部"悬浮按钮，点击可平滑滚动到底部
- [ ] Given 流式回复传输完成 When 所有内容接收完毕 Then 打字光标消失，消息标记为已完成，显示复制/删除等操作菜单
- [ ] Given 用户已配置 MiniMax API Key When 发送消息时网络超时 Then 显示错误 Banner，提示"消息发送失败"并可关闭
- [ ] Given 用户未配置 API Key When 点击发送按钮 Then 显示错误提示"请先在设置中选择一个模型"
- [ ] Given 流式回复进行中 When 用户按 ESC 键 Then 取消当前请求，显示部分回复内容
- [ ] Given 用户发送图片附件 When 发送消息 Then 图片以缩略图形式显示在用户气泡内，可点击放大预览

---

### 用户故事 1.2 - 打字机效果
**作为** 用户
**我想要** AI 回复以打字机效果呈现
**以便** 直观感受回复生成过程，增强阅读体验

**验收标准**:
- [ ] Given AI 回复正在流式传输 When 正常中文字符 Then 以基准速度逐字显示
- [ ] Given AI 回复正在流式传输 When 遇到句末标点（.!?。！？）Then 停顿 2.5 倍基准时间后继续
- [ ] Given AI 回复正在流式传输 When 遇到代码块（```）Then 以 0.3 倍速度快速闪过
- [ ] Given AI 回复正在流式传输 When 遇到数字/英文字母 Then 以 0.7 倍速度略快显示
- [ ] Given AI 回复正在流式传输 When 显示动画已启用 Then 打字光标以 530ms 间隔闪烁
- [ ] Given AI 回复传输完成 When typingSpeed 设置为默认 Then 光标消失，渲染完整 Markdown
- [ ] Given AI 回复传输完成 When 用户禁用动画 Then 直接显示完整内容，无光标和动画
- [ ] Given AI 回复进行中 When 用户刷新页面 Then 回复重新从开头开始流式播放（不会续接）

---

### 用户故事 1.3 - 多模态输入
**作为** 用户
**我想要** 上传图片或粘贴 URL 链接作为附件发送
**以便** 在对话中引用外部内容

**验收标准**:
- [ ] Given 用户在输入框区域 When 点击附件按钮 Then 弹出文件选择器，支持图片文件
- [ ] Given 用户选择了图片文件 When 图片上传成功 Then 在输入框下方显示图片缩略图，可预览和删除
- [ ] Given 用户粘贴了 URL 链接 When 系统检测到链接 Then 显示链接预览卡片（标题+描述）
- [ ] Given 用户在发送带附件的消息后 When AI 回复到来 Then 用户气泡内显示附件图标，AI 气泡正常显示
- [ ] Given 用户发送的是图片生成请求（"帮我画..."）When 系统检测到意图 Then 调用 MiniMax image-01 API 生成图片
- [ ] Given 图片生成成功 When 返回 URL Then 在消息气泡中显示生成的图片，附带下载链接
- [ ] Given 图片生成失败 When 触发 usage limit Then 显示"图片生成配额已用完"友好提示

---

## 功能模块 2: 思维链展示

### 用户故事 2.1 - 深度思考开关
**作为** 用户
**我想要** 开启"深度思考"开关，让 AI 展示推理过程
**以便** 理解 AI 的思考路径，增加答案可信度

**验收标准**:
- [ ] Given 用户未开启深度思考 When 发送普通问题 Then 仅返回最终答案，不显示思考过程
- [ ] Given 用户开启深度思考 When 发送问题 Then 输入框上方显示紫色"深度思考"标签
- [ ] Given 深度思考已开启 When AI 思考中 Then 消息气泡内显示独立的"思考过程"折叠区块
- [ ] Given 深度思考已开启 When AI 思考完成 Then thinking 内容以等宽字体（font-mono）显示在折叠区块内
- [ ] Given 用户关闭深度思考 When 已有思考过程的消息 Then 折叠区块自动隐藏，不影响已显示内容
- [ ] Given 深度思考进行中 When 用户开启/关闭切换 Then 立即响应，不中断当前流式输出

---

### 用户故事 2.2 - 思维链可视化
**作为** 用户
**我想要** 在 AI 回复旁看到完整的思维链可视化
**以便** 更清晰地了解 AI 如何得出结论

**验收标准**:
- [ ] Given AI 回复包含 thinking 内容 When 用户展开思维链 Then 显示带 Brain 图标的专属区块
- [ ] Given 思维链内容较长 When 展示时 Then 自动折叠，显示展开按钮
- [ ] Given 用户点击展开按钮 When 思维链展开 Then 内容以平滑动画展开
- [ ] Given 用户点击收起按钮 When 思维链收起 Then 内容折叠，仅显示部分预览
- [ ] Given 用户设置 showThinking 为 false When 查看消息 Then 思维链区块完全不渲染
- [ ] Given 思维链区块 When 内容为代码或 JSON Then 以等宽字体正确渲染，不走 Markdown

---

## 功能模块 3: Agent 模式

### 用户故事 3.1 - Agent 模式入口
**作为** 普通用户
**我想要** 从主界面一键进入 Agent 模式
**以便** 使用工具调用、意图识别等高级功能

**验收标准**:
- [ ] Given 用户在主页 Header When 看到 Agent 按钮 Then 显示带 Bot 图标的高亮按钮（bg-primary/8）
- [ ] Given 用户点击 Agent 按钮 When 路由跳转 Then 导航到 `/agent` 页面
- [ ] Given 用户在 Agent 页面 When 页面加载 Then 显示 Agent 专属 UI，包含工具面板、状态栏
- [ ] Given 用户已打开 Agent 面板 When 切换回主聊天页 Then Agent 状态保持，不会丢失上下文
- [ ] Given 用户在 Agent 模式发送消息 When 消息发送 Then 启用工具调用、意图识别等 Agent 能力

---

### 用户故事 3.2 - 工具调用
**作为** Agent 用户
**我想要** AI 自动调用合适的工具来完成任务
**以便** 获得比普通对话更强大的任务执行能力

**验收标准**:
- [ ] Given 用户发送"帮我查一下北京天气" When AI 检测到工具意图 Then 自动调用天气工具，获取实时数据后返回
- [ ] Given 用户发送搜索请求 When AI 调用搜索工具 Then 在回复中展示搜索来源和摘要
- [ ] Given 工具调用执行中 When 工具返回结果 Then AI 根据结果生成自然语言回复
- [ ] Given 工具调用失败 When 工具执行异常 Then AI 给出友好错误提示，不暴露内部错误
- [ ] Given 工具调用进行中 When 用户取消请求 Then 立即中断工具执行，不返回部分结果
- [ ] Given 连续多次工具调用 When AI 规划多个步骤 Then 按顺序执行，显示每个步骤进度

---

### 用户故事 3.3 - 联网搜索增强
**作为** 用户
**我想要** 开启"联网搜索"让 AI 引用最新信息
**以便** 获得基于实时网络数据的回答

**验收标准**:
- [ ] Given 用户开启联网搜索 When 发送需要实时信息的问题 Then 显示"正在联网搜索相关信息..."提示
- [ ] Given 联网搜索进行中 When 获取到结果 Then 将搜索结果作为上下文注入到 AI Prompt
- [ ] Given 联网搜索成功 When AI 生成回复 Then 回复包含来源标注，格式为 `[来源: URL]`
- [ ] Given 联网搜索失败 When 网络异常 Then 使用普通模式回答，提示"联网搜索失败"
- [ ] Given 用户关闭联网搜索 When 发送相同问题 Then 直接调用 AI 模型，不进行联网
- [ ] Given 联网搜索返回多条结果 When 组装上下文 Then 取 Top 3 条结果注入，截断过长内容

---

## 功能模块 4: HITL 人机协作

### 用户故事 4.1 - 危险操作确认对话框
**作为** 用户
**我想要** 当 Agent 准备执行危险操作时弹出确认对话框
**以便** 我可以审阅并决定是否批准

**验收标准**:
- [ ] Given Agent 准备执行高风险操作 When 操作触发 HITL Then 弹出 HumanConfirmationDialog，遮罩背景
- [ ] Given 确认对话框显示 When 用户未操作 Then 显示 60 秒倒计时，超时自动取消
- [ ] Given 倒计时 <= 10 秒 When 倒计时更新 Then 时间显示为红色，进度条变红
- [ ] Given 倒计时到达 0 When 超时触发 Then 自动选择第一个选项，完成或取消操作
- [ ] Given 用户按 Y 键 When 对话框可见且无输入框聚焦 Then 批准第一个选项
- [ ] Given 用户按 N 键 When 对话框可见且无输入框聚焦 Then 拒绝或取消操作
- [ ] Given 用户按 Tab 键 When 有多个选项 Then 在选项间循环切换，当前选项高亮
- [ ] Given 用户按 Enter 键 When 已选择选项 Then 确认当前选择
- [ ] Given 用户按 ESC 键 When 对话框可见 Then 关闭对话框，视为拒绝
- [ ] Given 用户点击遮罩层 When 任意位置 Then 关闭对话框，视为拒绝

---

### 用户故事 4.2 - 确认对话框内容展示
**作为** 用户
**我想要** 在确认对话框中看到操作类型、风险等级、数据预览
**以便** 做出明智的决策

**验收标准**:
- [ ] Given 高风险操作确认 When 对话框显示 Then 显示红色"高风险"标签和 AlertTriangle 图标
- [ ] Given 中风险操作确认 When 对话框显示 Then 显示黄色"中风险"标签和 AlertCircle 图标
- [ ] Given 对话框显示 Then 展示操作标题、操作类型标签（操作确认/数据访问/外部调用等）
- [ ] Given 有数据预览 When 显示 Then 以 JSON 格式化展示，支持滚动和复制
- [ ] Given 包含敏感数据 When 数据预览显示 Then 初始隐藏显示为 `••••••••••`，有点击显示切换
- [ ] Given 有操作命令 When 显示 Then 显示可复制的命令预览区块
- [ ] Given 有警告信息 When 用户点击展开 Then 显示所有警告条目列表
- [ ] Given 有影响范围 When 用户展开 Then 显示受影响文件/系统/副作用说明
- [ ] Given 对话框包含敏感字段 When 渲染 Then 支持隐藏/显示切换

---

### 用户故事 4.3 - 确认选项与修改
**作为** 用户
**我想要** 可以批准、拒绝或修改参数后批准操作
**以便** 更灵活地控制 Agent 行为

**验收标准**:
- [ ] Given 确认对话框显示 When 用户点击"批准"按钮 Then 发送 confirm 响应，关闭对话框
- [ ] Given 确认对话框显示 When 用户点击"拒绝"按钮 Then 发送 cancel 响应，关闭对话框
- [ ] Given 确认对话框显示 When 用户点击"修改"按钮 Then 显示 JSON 编辑器，可修改参数
- [ ] Given 用户修改参数 When 点击"确认修改" Then 验证 JSON 格式，发送修改后的参数
- [ ] Given 用户修改参数 When 输入无效 JSON Then 提示"格式错误"，不关闭编辑模式
- [ ] Given 勾选了"不再提示同类操作" When 确认操作 Then 存储 skip key，同类操作自动放行
- [ ] Given 确认操作成功 When Agent 收到响应 Then 继续执行后续步骤
- [ ] Given 拒绝/超时/关闭操作 When Agent 收到响应 Then 停止当前任务流程，返回用户

---

## 功能模块 5: 管理后台

### 用户故事 5.1 - 管理后台概览
**作为** 管理员
**我想要** 打开管理后台看到系统概览仪表盘
**以便** 了解系统运行状态和关键指标

**验收标准**:
- [ ] Given 管理员点击 Header"管理后台"按钮 When 导航到 `/admin` Then 显示管理后台 Dashboard
- [ ] Given Dashboard 加载 When API 正常 Then 显示 Stats 统计卡片（对话数/用户数/模型调用次数等）
- [ ] Given Dashboard 加载 When 后端 API 异常 Then 显示"加载失败"状态和重试按钮
- [ ] Given Dashboard 显示 Then 显示快捷入口卡片：知识库、工具管理、模型配置、Prompt 模板、链路追踪
- [ ] Given 点击任意快捷入口 When 导航 Then 跳转到对应管理页面
- [ ] Given 管理员权限不足 When 访问 `/admin` Then 显示无权限提示，不泄露系统信息

---

### 用户故事 5.2 - 知识库管理
**作为** 管理员
**我想要** 在知识库管理界面添加、查看、删除文档
**以便** 为 RAG 检索提供知识支撑

**验收标准**:
- [ ] Given 管理员进入知识库管理 When 页面加载 Then 显示文档列表，包含标题、上传时间、状态
- [ ] Given 管理员上传文档 When 上传成功 Then 文档进入处理队列，显示进度条
- [ ] Given 文档处理完成 When 处理成功 Then 文档状态变为"已索引"，可被检索
- [ ] Given 管理员搜索知识 When 输入关键词 Then 返回包含关键词的文档片段
- [ ] Given 管理员删除文档 When 确认删除 Then 从向量数据库中移除，不可恢复
- [ ] Given 管理员查看文档详情 When 点击文档 Then 显示文档内容、向量维度、关联对话数
- [ ] Given Ctrl+K 快捷键 When 在任意页面按下 Then 打开知识库管理面板（模态形式）

---

### 用户故事 5.3 - 工具注册管理
**作为** 管理员
**我想要** 在工具管理界面注册、启用/禁用、测试工具
**以便** 扩展 Agent 能力

**验收标准**:
- [ ] Given 管理员进入工具管理 When 页面加载 Then 显示工具列表，包含名称、分类、状态、调用次数
- [ ] Given 管理员注册新工具 When 填写表单（名称/描述/参数/URL）Then 调用 POST `/api/tools/register` 创建工具
- [ ] Given 工具注册成功 When 创建完成 Then 工具出现在列表顶部，状态为"未启用"
- [ ] Given 管理员启用工具 When 点击启用 Then 调用 PATCH `/api/tools/:id/enable`，状态变绿色
- [ ] Given 管理员禁用工具 When 点击禁用 Then 调用 PATCH `/api/tools/:id/disable`，状态变灰色
- [ ] Given 管理员测试工具 When 填写参数并点击测试 Then 调用 POST `/api/tools/:id/test`，显示返回结果
- [ ] Given 工具测试失败 When 执行异常 Then 显示红色错误信息，包含错误类型
- [ ] Given 管理员查看工具分类 When 点击分类 Tab Then 显示该分类下所有工具

---

### 用户故事 5.4 - 模型配置管理
**作为** 管理员
**我想要** 在模型配置界面查看/修改模型参数、熔断器状态
**以便** 优化模型调用策略

**验收标准**:
- [ ] Given 管理员进入模型配置 When 页面加载 Then 显示模型列表，包含名称、状态、调用次数、错误率
- [ ] Given 管理员修改模型参数 When 填写并保存 Then 调用 PATCH `/api/admin/models/:name`，实时更新
- [ ] Given 模型健康 When 显示状态 Then 显示绿色"健康"标签和最后检查时间
- [ ] Given 模型不健康 When 显示状态 Then 显示红色"不健康"标签和错误信息
- [ ] Given 管理员查看熔断器状态 When 点击熔断器 Tab Then 显示各模型的熔断状态（open/half-open/closed）
- [ ] Given 管理员手动重置熔断器 When 点击重置按钮 Then 调用 POST `/api/admin/models/:name/circuit-breaker`
- [ ] Given 模型统计 When 加载 Then 调用 GET `/api/admin/models/stats`，显示 QPS/延迟/Token 消耗图表

---

### 用户故事 5.5 - Prompt 模板管理
**作为** 管理员
**我想要** 在 Prompt 模板界面创建、编辑、版本化管理 Prompt
**以便** 标准化 Agent 提示词

**验收标准**:
- [ ] Given 管理员进入 Prompt 模板 When 页面加载 Then 显示模板列表，包含名称、版本、更新时间
- [ ] Given 管理员创建新模板 When 填写名称和内容 Then 调用 POST `/api/admin/prompts` 创建
- [ ] Given 模板已创建 When 管理员编辑内容 Then 调用 PUT `/api/admin/prompts/:id` 更新，版本号 +1
- [ ] Given 管理员查看历史版本 When 点击版本 Tab Then 显示版本列表，可切换查看
- [ ] Given 管理员对比版本 When 选择两个版本 Then 并排显示差异，高亮变更部分
- [ ] Given 模板预览 When 输入测试变量 Then 显示渲染后的完整 Prompt

---

### 用户故事 5.6 - 链路追踪查看
**作为** 管理员
**我想要** 在 TraceViewer 查看请求的完整链路追踪
**以便** 排查问题和监控性能

**验收标准**:
- [ ] Given 管理员进入链路追踪 When 页面加载 Then 显示最近的 Trace 列表，包含 Trace ID、时间、耗时
- [ ] Given 管理员搜索 Trace When 输入 Trace ID 或关键词 Then 返回匹配的追踪记录
- [ ] Given 管理员点击 Trace When 查看详情 Then 显示时间线视图，包含各节点耗时
- [ ] Given Trace 详情显示 When 包含工具调用 Then 显示工具名称、参数、结果和耗时
- [ ] Given Trace 详情显示 When 包含模型调用 Then 显示模型名称、Token 消耗、返回长度
- [ ] Given 管理员筛选 By 状态 When 选择 error Then 仅显示包含错误的 Trace
- [ ] Given 管理员筛选 By 时间范围 When 选择时间范围 Then 仅显示该时间段内的 Trace

---

## 功能模块 6: 侧边栏

### 用户故事 6.1 - 对话列表展示
**作为** 用户
**我想要** 在侧边栏看到按时间分组的历史对话列表
**以便** 快速切换和查找历史会话

**验收标准**:
- [ ] Given 用户打开应用 When 侧边栏显示 Then 按"今天/昨天/最近7天/最近30天/月"分组显示对话
- [ ] Given 对话列表显示 Then 每个对话显示标题、最后消息预览、时间和消息条数
- [ ] Given 当前活动的对话 When 列表显示 Then 显示"当前"标签和彩色高亮边框
- [ ] Given 对话超过 64 字符 When 预览显示 Then 截断并加省略号
- [ ] Given 对话无消息 When 预览显示 Then 显示"开始新的对话"
- [ ] Given 对话列表为空 When 加载完成 Then 显示空状态插图和"未找到相关对话"文字

---

### 用户故事 6.2 - 新建与切换对话
**作为** 用户
**我想要** 新建对话并在不同对话间切换
**以便** 保持多个独立的对话上下文

**验收标准**:
- [ ] Given 用户在侧边栏 When 点击"新建"按钮 Then 创建新对话并自动切换为活动状态
- [ ] Given 用户无 API Key When 点击新建 Then 新建成功但发送消息时提示配置 Key
- [ ] Given 用户点击历史对话 When 切换对话 Then 清空主聊天区，加载历史消息
- [ ] Given 切换对话时 When 存在未完成的流式请求 Then 取消请求，再切换
- [ ] Given 用户首次打开应用 When 无任何对话 Then 自动创建一个空对话并设为活动
- [ ] Given 用户点击侧边栏关闭按钮 When 关闭侧边栏 Then 侧边栏收起，Header 显示打开按钮
- [ ] Given 侧边栏关闭时 When 用户点击 Header 打开按钮 Then 侧边栏以动画展开

---

### 用户故事 6.3 - 删除与恢复对话
**作为** 用户
**我想要** 删除不需要的对话，并可在 5 秒内撤销
**以便** 保持对话列表整洁

**验收标准**:
- [ ] Given 用户点击删除按钮 When 删除对话 Then 弹出确认对话框，显示"确认删除对话？"
- [ ] Given 用户点击"删除"确认 When 确认删除 Then 对话从列表移除，显示 Toast"对话已删除"
- [ ] Given 删除操作完成 When Toast 显示 Then 显示"撤销"按钮，5 秒内有效
- [ ] Given 用户点击"撤销" When 撤销操作 Then 恢复对话到原位置，列表更新
- [ ] Given 5 秒后 When 用户未点击撤销 Then Toast 消失，对话永久删除
- [ ] Given 用户右键对话项 When 右键菜单显示 Then 显示重命名、删除、导出、新窗口打开选项
- [ ] Given 用户导出对话 When 点击导出 Then 下载 JSON 文件，包含标题、消息和创建时间

---

### 用户故事 6.4 - 对话搜索
**作为** 用户
**我想要** 搜索历史对话，快速找到相关内容
**以便** 无需手动翻阅大量历史记录

**验收标准**:
- [ ] Given 用户在搜索框输入关键词 When 输入中 Then 300ms 防抖后触发搜索
- [ ] Given 搜索进行中 When 匹配对话标题 Then 返回标题包含关键词的对话
- [ ] Given 搜索进行中 When 匹配最后一条消息 Then 返回最后消息包含关键词的对话
- [ ] Given 搜索进行中 When 匹配历史消息 Then 搜索最近 6 条消息，返回匹配项
- [ ] Given 搜索无结果 When 搜索完成 Then 显示空状态"未找到相关对话"
- [ ] Given 搜索结果高亮 When 匹配关键词 Then 搜索结果中关键词以高亮样式显示

---

## 功能模块 7: 响应式布局

### 用户故事 7.1 - 移动端适配
**作为** 移动端用户
**我想要** 在手机上有良好的聊天体验
**以便** 随时随地使用 SimpleAgent

**验收标准**:
- [ ] Given 屏幕宽度 < 640px When 页面加载 Then 显示移动端专用布局，不渲染侧边栏
- [ ] Given 移动端布局 When 用户打开应用 Then 显示简洁的单窗口聊天界面
- [ ] Given 移动端布局 When 键盘弹出 Then 输入框自动上推，不被键盘遮挡
- [ ] Given 移动端布局 When Header 显示 Then 仅显示简洁的菜单按钮和对话标题
- [ ] Given 移动端布局 When 侧边栏隐藏 Then 点击菜单按钮打开侧边栏（全屏覆盖）
- [ ] Given 移动端布局 When 功能面板打开 Then 以模态形式覆盖聊天区
- [ ] Given 移动端布局 When 快捷键面板触发 Then 适配小屏幕，显示必要快捷键

---

### 用户故事 7.2 - 桌面端多窗口布局
**作为** 桌面端用户
**我想要** 在桌面上使用多窗口布局，同时管理多个对话
**以便** 提升多任务效率

**验收标准**:
- [ ] Given 屏幕宽度 >= 1024px When 页面加载 Then 显示侧边栏 + 多窗口聊天区
- [ ] Given 默认布局 When 加载完成 Then 使用"single"单窗口布局
- [ ] Given 用户切换布局 When 点击布局切换器 Then 在 single/side-by-side/grid 布局间切换
- [ ] Given Side-by-side 布局 When 显示 Then 左右两个聊天窗口，各占 50% 宽度
- [ ] Given Grid 布局 When 显示 Then 四个聊天窗口，2x2 网格排列
- [ ] Given 任意布局 When 拖动对话到窗口 Then 将对话添加到目标窗口显示
- [ ] Given 专注模式开启 When 切换布局 Then 专注模式优先，全屏显示单个聊天窗口

---

### 用户故事 7.3 - 专注模式
**作为** 用户
**我想要** 开启专注模式获得沉浸式聊天体验
**以便** 减少干扰，专注于当前对话

**验收标准**:
- [ ] Given 用户在 Header 点击"专注模式" When 切换开启 Then 全屏显示聊天区域，隐藏侧边栏和面板
- [ ] Given 专注模式开启 When Header 显示 Then 仅显示对话标题和"退出专注"按钮
- [ ] Given 专注模式开启 When 功能面板按钮可见 Then 仍可打开设置/记忆/知识库面板
- [ ] Given 专注模式开启 When ESC 键按下 Then 退出专注模式，恢复常规布局
- [ ] Given 专注模式开启 When 用户切换布局 Then 专注模式保持，不受布局切换影响
- [ ] Given 专注模式退出 When 恢复布局 Then 返回切换前的布局状态

---

### 用户故事 7.4 - 暗色/亮色主题
**作为** 用户
**我想要** 在亮色和暗色主题间切换
**以便** 根据环境光线选择舒适的显示模式

**验收标准**:
- [ ] Given 用户在设置中切换主题 When 选择"暗色" Then 页面立即切换为暗色主题
- [ ] Given 用户在设置中切换主题 When 选择"亮色" Then 页面立即切换为亮色主题
- [ ] Given 用户在设置中切换主题 When 选择"跟随系统" Then 页面跟随操作系统主题设置
- [ ] Given 跟随系统主题 When 操作系统主题切换 Then 页面自动同步切换
- [ ] Given 主题切换时 When 动画已启用 Then 所有颜色变化以 500ms 平滑过渡
- [ ] Given 主题已切换 When 刷新页面 Then 保持选择的主题设置，不重置为默认

---

## 功能模块 8: 消息操作

### 用户故事 8.1 - 消息复制、删除、再生
**作为** 用户
**我想要** 对 AI 回复进行复制、删除、再生操作
**以便** 方便地分享和修正回复

**验收标准**:
- [ ] Given AI 消息显示 When 用户悬停或点击消息气泡 Then 显示操作菜单（复制/再生/删除）
- [ ] Given 用户点击复制按钮 When 复制成功 Then 显示 Toast"已复制到剪贴板"，按钮变为勾号
- [ ] Given 用户点击复制按钮 When 复制失败 Then 显示 Toast"复制失败"
- [ ] Given 用户点击再生按钮 When AI 消息已完整 Then 清空该消息内容，重新发送原始 Prompt
- [ ] Given 用户点击删除按钮 When 用户消息删除 Then 消息立即移除，不显示确认
- [ ] Given 用户点击删除按钮 When AI 消息删除 Then 显示确认对话框（5秒可撤销）
- [ ] Given 用户悬停用户消息 When 操作菜单显示 Then 显示编辑按钮，不显示再生按钮

---

### 用户故事 8.2 - 消息编辑
**作为** 用户
**我想要** 编辑我发送的用户消息并重新生成回复
**以便** 修改输入内容后继续对话

**验收标准**:
- [ ] Given 用户消息显示 When 用户点击编辑按钮 Then 显示文本编辑区域，填充原内容
- [ ] Given 编辑区域显示 When 用户修改内容 Then 可正常编辑，不限制字符数
- [ ] Given 用户点击"取消" When 编辑取消 Then 恢复原消息内容，关闭编辑模式
- [ ] Given 用户点击"保存" When 内容已修改 Then 更新消息内容，清空后续 AI 回复，重新生成
- [ ] Given 用户点击"保存" When 内容未修改 Then 关闭编辑模式，不触发重新生成
- [ ] Given 编辑模式开启 When 输入框为空 Then "保存"按钮禁用，不可提交

---

### 用户故事 8.3 - 消息引用
**作为** 用户
**我想要** 引用对话中的某条消息
**以便** 针对特定内容进行回复

**验收标准**:
- [ ] Given AI 消息显示 When 用户点击引用按钮 Then 激活引用模式，在输入框显示引用格式
- [ ] Given 引用模式激活 When 输入内容并发送 Then 新消息包含引用前缀，格式为 `> 引用内容\n\n`
- [ ] Given 用户发送引用消息 When AI 回复 Then 理解上下文，针对引用内容回复
- [ ] Given 引用内容较长 When 显示引用 Then 截断过长引用，显示部分内容和省略号

---

## 功能模块 9: 快捷键与辅助功能

### 用户故事 9.1 - 全局快捷键
**作为** 用户
**我想要** 使用快捷键快速完成常用操作
**以便** 提升操作效率

**验收标准**:
- [ ] Given 用户按 Ctrl+/ When 任意页面 Then 打开快捷键帮助面板
- [ ] Given 用户按 Ctrl+K When 任意页面 Then 打开知识库管理面板
- [ ] Given 用户按 ESC When 任意面板打开 Then 关闭当前面板，返回聊天
- [ ] Given 用户按 ESC When 专注模式开启 Then 退出专注模式
- [ ] Given 用户按 ESC When 无面板打开 Then 关闭侧边栏
- [ ] Given 快捷键帮助面板显示 Then 显示所有可用快捷键列表

---

### 用户故事 9.2 - 设置面板
**作为** 用户
**我想要** 在设置面板中配置 API Key、主题、动画等选项
**以便** 个性化使用体验

**验收标准**:
- [ ] Given 用户点击设置图标 When 面板打开 Then 显示设置面板，包含 API 配置、主题、动画等 Tab
- [ ] Given 用户输入 API Key When 粘贴到输入框 Then Key 以黑点显示，支持显示/隐藏切换
- [ ] Given API Key 格式错误 When 保存配置 Then 提示 Key 格式不正确，不保存
- [ ] Given 用户调整打字速度 When 拖动滑块 Then 实时预览打字效果，速度变化生效
- [ ] Given 用户开关动画 When 切换开关 Then 立即生效，无需刷新页面
- [ ] Given 设置面板打开 When 用户关闭面板 Then 设置自动保存，无需手动点击

---

## 功能模块 10: 会话记忆与上下文

### 用户故事 10.1 - 记忆面板
**作为** 用户
**我想要** 在记忆面板中查看和管理当前会话的记忆
**以便** 利用历史上下文提升对话质量

**验收标准**:
- [ ] Given 用户点击记忆图标 When 面板打开 Then 显示当前会话的短期记忆列表
- [ ] Given 记忆面板显示 When 记忆条目存在 Then 显示记忆内容、时间、分类标签
- [ ] Given 用户添加记忆 When 输入内容并保存 Then 记忆保存到后端 API，可跨会话同步
- [ ] Given 用户删除记忆 When 确认删除 Then 记忆从后端和 UI 同时移除
- [ ] Given 记忆面板加载 When 后端 API 异常 Then 显示加载失败状态，不崩溃
- [ ] Given 记忆面板打开 When 切换对话 Then 面板内容自动切换为新对话的记忆

---

### 用户故事 10.2 - 会话上下文保持
**作为** 用户
**我想要** 在多轮对话中保持上下文连贯
**以便** 进行自然的持续对话

**验收标准**:
- [ ] Given 用户发送第二条消息 When 发送成功 Then 包含上一条消息作为上下文
- [ ] Given 对话进行到 20+ 轮 When Token 接近限制 Then 系统自动摘要超长部分，保留关键信息
- [ ] Given Token 摘要触发 When 摘要完成 Then 显示系统提示"上下文已自动摘要"
- [ ] Given 对话中断后恢复 When 用户重新打开对话 Then 加载完整的消息历史，包括摘要后的消息
- [ ] Given 上下文超长 When 用户发送长消息 Then 智能拆分消息，分段处理

---

## 功能模块 11: 欢迎指南

### 用户故事 11.1 - 新用户首次使用引导
**作为** 新用户
**我想要** 在首次使用时看到欢迎指南
**以便** 快速了解 SimpleAgent 的核心功能

**验收标准**:
- [ ] Given 用户首次打开应用 When 页面加载完成 Then 显示 WelcomeGuide 欢迎指南弹窗
- [ ] Given 欢迎指南显示 When 用户完成引导 Then 点击"开始使用"关闭指南，设置 `showWelcomeGuide=false`
- [ ] Given 欢迎指南显示 When 用户关闭弹窗 Then 视为完成引导，下次不再显示
- [ ] Given 欢迎指南显示 Then 包含功能介绍卡片：发送消息、切换主题、使用工具
- [ ] Given 欢迎指南完成 When 用户进入主界面 Then 默认创建一个新对话

---

## 功能模块 12: Markdown 渲染与预览

### 用户故事 12.1 - Markdown 渲染
**作为** 用户
**我想要** AI 回复以格式化的 Markdown 显示
**以便** 获得良好的阅读体验

**验收标准**:
- [ ] Given AI 消息包含 Markdown When 渲染显示 Then 支持标题、列表、链接、图片、代码块
- [ ] Given 代码块显示 When 代码高亮 Then 使用 Shiki 语法高亮，支持常见语言
- [ ] Given 链接显示 When 用户点击 Then 调用 onPreviewLink 回调，打开内容预览
- [ ] Given 图片链接显示 When 图片加载 Then 显示图片，可点击放大
- [ ] Given XSS 注入尝试 When 恶意脚本注入 Then DOMPurify 过滤，不执行脚本
- [ ] Given Markdown 渲染异常 When 渲染失败 Then 显示原始文本，不崩溃

---

### 用户故事 12.2 - 外部内容预览
**作为** 用户
**我想要** 点击消息中的链接时看到内容预览
**以便** 无需离开当前页面即可了解链接内容

**验收标准**:
- [ ] Given 用户点击链接 When 预览加载 Then 显示 ContentPreview 面板，加载中显示骨架屏
- [ ] Given 预览加载成功 When 内容返回 Then 显示标题、描述、关键信息
- [ ] Given 预览加载失败 When 请求超时 Then 显示"无法加载预览"提示
- [ ] Given 预览面板打开 When 用户点击关闭 Then 预览面板关闭，返回聊天
- [ ] Given 预览面板打开 When 用户点击外部链接 Then 在新标签页打开原链接

---

## Edge Cases（边界情况）

### 边界情况 1: 网络异常
- [ ] Given 网络断开 When 用户发送消息 Then 显示网络异常提示，不崩溃
- [ ] Given 网络恢复 When 页面检测到网络 Then 自动重连 SSE，不丢失状态
- [ ] Given 后端服务不可用 When 调用 API Then 显示服务不可用提示，不暴露错误详情
- [ ] Given SSE 连接中断 When 传输中断 Then 自动重连，恢复流式输出

### 边界情况 2: 数据异常
- [ ] Given 用户发送空消息 When 点击发送 Then 输入框拒绝空白提交
- [ ] Given 用户粘贴超长文本 When 粘贴内容 Then 截断到 Token 限制内，提示用户
- [ ] Given 消息内容包含特殊字符 When 渲染 Then 正确转义，不破坏布局
- [ ] Given 附件超过大小限制 When 上传附件 Then 显示"文件过大"提示

### 边界情况 3: 状态异常
- [ ] Given 页面刷新 When 有进行中的请求 Then 请求取消，状态以 localStorage 恢复
- [ ] Given 快速连续发送消息 When 多次点击发送 Then 防抖处理，仅发送最后一条
- [ ] Given 多个确认对话框同时触发 When HITL 并发 Then 仅显示第一个，其余排队
- [ ] Given Store 数据损坏 When localStorage 解析失败 Then 使用默认状态，不崩溃

---

## 验收清单速查表

| 模块 | 故事数 | 验收标准数 | 优先级 |
|------|--------|-----------|--------|
| 核心对话 | 3 | 25 | P0 |
| 思维链展示 | 2 | 12 | P1 |
| Agent 模式 | 3 | 15 | P1 |
| HITL 人机协作 | 3 | 25 | P0 |
| 管理后台 | 6 | 42 | P2 |
| 侧边栏 | 4 | 25 | P1 |
| 响应式布局 | 4 | 22 | P1 |
| 消息操作 | 3 | 18 | P1 |
| 快捷键与辅助功能 | 2 | 11 | P2 |
| 会话记忆与上下文 | 2 | 10 | P1 |
| 欢迎指南 | 1 | 5 | P3 |
| Markdown 渲染与预览 | 2 | 11 | P1 |
| 边界情况 | 3 | 12 | P0 |
| **合计** | **37** | **233** | - |

> **优先级说明**: P0 = 核心功能必须可用；P1 = 重要功能影响体验；P2 = 增强功能提升效率；P3 = 边际功能锦上添花