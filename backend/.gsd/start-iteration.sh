#!/bin/bash
# GSD 工作流快速启动脚本

echo "=== AI Chat 玩具 GSD 工作流 ==="
echo "版本: v2.5.0"
echo "架构健康: 8.25/10"
echo ""

# 检查服务状态
echo "[1/4] 检查服务状态..."
curl -s http://localhost:30000/api/health > /dev/null && echo "✓ 后端运行中" || echo "✗ 后端未运行"
curl -s http://localhost:3001 > /dev/null && echo "✓ 前端运行中" || echo "✗ 前端未运行"

# 显示待办任务
echo ""
echo "[2/4] 读取待办任务..."
cat .gsd/todo.md 2>/dev/null || echo "无待办任务"

# 显示迭代状态
echo ""
echo "[3/4] 迭代状态..."
cat .gsd/iteration-state.json 2>/dev/null | head -20 || echo "无迭代状态"

# 启动指导
echo ""
echo "[4/4] 下一步行动:"
echo "  1. 分析待办任务"
echo "  2. 使用 gsd-executor agent 执行"
echo "  3. 验证测试通过"
echo "  4. 迭代继续"

echo ""
echo "=== GSD 工作流就绪 ==="