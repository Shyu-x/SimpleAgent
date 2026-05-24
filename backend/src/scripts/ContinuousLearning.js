/**
 * 持续学习脚本
 * 每10分钟搜索GitHub优秀项目，更新技术趋势
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const { sleep } = require('../utils/retry');

class ContinuousLearning {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './docs/learning';
    this.interval = options.interval || 10 * 60 * 1000; // 10分钟
    this.intervalId = null;
  }

  /**
   * 搜索GitHub项目
   */
  async searchGitHub(query, options = {}) {
    const { limit = 10, sort = 'stars' } = options;

    try {
      // 使用正确的gh搜索命令
      const command = `gh search repos "${query}" --limit ${limit} --sort ${sort} 2>&1`;
      const output = execSync(command, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });

      // 每行是一个项目
      const lines = output.trim().split('\n').filter(line => line.includes('\t') || line.includes('/') );

      const projects = [];
      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          // 标准格式: name\tdescription\t...
          projects.push({
            name: parts[0].trim(),
            description: parts[1].trim(),
            stars: 0,
            updated: parts[3]?.trim() || ''
          });
        } else if (line.includes('/')) {
          // 简单格式: name\tdescription
          const [name, ...descParts] = line.split('\t');
          projects.push({
            name: name.trim(),
            description: descParts.join('\t').trim(),
            stars: 0,
            updated: ''
          });
        }
      }

      return projects.filter(p => p.name && p.name.includes('/'));
    } catch (error) {
      console.error('[ContinuousLearning] GitHub搜索失败:', error.message);
      return [];
    }
  }

  /**
   * 提取stars数量
   */
  extractStars(text) {
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * 获取项目详情
   */
  async getRepoDetails(repoName) {
    try {
      const command = `gh repo view ${repoName} --json description,stargazerCount,repositoryTopics,url,updatedAt`;
      const output = execSync(command, { encoding: 'utf-8' });
      return JSON.parse(output);
    } catch (error) {
      console.error(`[ContinuousLearning] 获取项目详情失败: ${repoName}`, error.message);
      return null;
    }
  }

  /**
   * 分析项目技术栈
   */
  analyzeTechStack(repoDetails) {
    const topics = (repoDetails?.repositoryTopics || []).map(t => t.name);
    const keywords = {
      'framework': topics.includes('framework'),
      'typescript': topics.includes('typescript') || topics.includes('ts'),
      'react': topics.includes('react'),
      'python': topics.includes('python'),
      'agent': topics.some(t => ['agents', 'ai-agents', 'agent'].includes(t)),
      'multiagent': topics.includes('multiagent'),
      'mcp': topics.includes('mcp'),
      'langchain': topics.includes('langchain'),
      'langgraph': topics.includes('langgraph'),
      'rag': topics.includes('rag')
    };

    return keywords;
  }

  /**
   * 学习并更新文档
   */
  async learn() {
    console.log('[ContinuousLearning] 开始学习...');

    const searches = [
      { query: 'langgraph OR langchain agent', name: 'agent_framework' },
      { query: 'react AI agent workflow', name: 'react_agent' },
      { query: 'mcp model context protocol', name: 'mcp_protocol' },
      { query: 'browser automation AI agent', name: 'browser_agent' },
      { query: 'multi-agent collaboration', name: 'multi_agent' },
      { query: 'react-19 next.js-16', name: 'latest_react' },
      { query: 'zustand state management', name: 'zustand_patterns' },
      { query: 'typescript best practices 2025', name: 'typescript_best' }
    ];

    const results = {
      timestamp: new Date().toISOString(),
      categories: {}
    };

    for (const search of searches) {
      console.log(`[ContinuousLearning] 搜索: ${search.query}`);
      const projects = await this.searchGitHub(search.query, { limit: 5 });

      const detailedProjects = [];
      for (const project of projects.slice(0, 3)) {
        const details = await this.getRepoDetails(project.name);
        if (details) {
          detailedProjects.push({
            name: project.name,
            description: details.description,
            stars: details.stargazerCount,
            topics: details.repositoryTopics?.map(t => t.name) || [],
            techStack: this.analyzeTechStack(details)
          });
        }
      }

      results.categories[search.name] = {
        query: search.query,
        projects: detailedProjects
      };

      // 避免API限制
      await sleep(1000);
    }

    // 保存结果
    await this.saveResults(results);

    // 生成趋势报告
    await this.generateTrendsReport(results);

    console.log('[ContinuousLearning] 学习完成');
    return results;
  }

  /**
   * 保存学习结果
   */
  async saveResults(results) {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(this.outputDir, `learning-${timestamp}.json`);

      await fs.writeFile(filePath, JSON.stringify(results, null, 2));
      console.log(`[ContinuousLearning] 保存到: ${filePath}`);

      // 更新最新结果
      const latestPath = path.join(this.outputDir, 'latest.json');
      await fs.writeFile(latestPath, JSON.stringify(results, null, 2));
    } catch (error) {
      console.error('[ContinuousLearning] 保存失败:', error);
    }
  }

  /**
   * 生成趋势报告
   */
  async generateTrendsReport(results) {
    const report = `# AI技术趋势报告

> 生成时间: ${results.timestamp}
> 自动更新

## 概览

本报告基于GitHub热门项目分析，涵盖以下领域：

${Object.entries(results.categories).map(([key, data]) => `
### ${this.formatCategoryName(key)}

搜索关键词: \`${data.query}\`

${data.projects.length} 个热门项目:

${data.projects.map(p => `
#### ${p.name}

- ⭐ ${p.stars} stars
- ${p.description || '无描述'}

**技术栈**: ${p.topics.slice(0, 8).join(', ') || '未知'}

**特性**:
${Object.entries(p.techStack).filter(([k, v]) => v).map(([k]) => `- ${k}`).join('\n') || '无详细特性'}
`).join('\n')}
`).join('\n')}

---

*由 ContinuousLearning 脚本自动生成*
`;

    try {
      await fs.mkdir(this.outputDir, { recursive: true });
      const reportPath = path.join(this.outputDir, '技术趋势报告.md');
      await fs.writeFile(reportPath, report);
      console.log(`[ContinuousLearning] 趋势报告已更新: ${reportPath}`);
    } catch (error) {
      console.error('[ContinuousLearning] 生成趋势报告失败:', error);
    }
  }

  /**
   * 格式化分类名称
   */
  formatCategoryName(name) {
    const names = {
      'agent_framework': 'Agent框架',
      'react_agent': 'React Agent',
      'mcp_protocol': 'MCP协议',
      'browser_agent': '浏览器Agent',
      'multi_agent': '多Agent协作',
      'latest_react': '最新React技术',
      'zustand_patterns': 'Zustand模式',
      'typescript_best': 'TypeScript最佳实践'
    };
    return names[name] || name;
  }

  /**
   * 启动持续学习
   */
  start() {
    if (this.intervalId) {
      console.log('[ContinuousLearning] 已经在运行中');
      return;
    }

    console.log(`[ContinuousLearning] 启动，每 ${this.interval / 60000} 分钟执行一次`);

    // 立即执行一次
    this.learn();

    // 设置定时任务
    this.intervalId = setInterval(() => {
      this.learn();
    }, this.interval);
  }

  /**
   * 停止
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[ContinuousLearning] 已停止');
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const learner = new ContinuousLearning({
    outputDir: './docs/learning',
    interval: 10 * 60 * 1000 // 10分钟
  });

  // 解析命令行参数
  const args = process.argv.slice(2);

  if (args.includes('--once')) {
    // 单次执行
    learner.learn().then(() => process.exit(0));
  } else if (args.includes('--daemon')) {
    // 守护进程模式
    learner.start();

    process.on('SIGINT', () => {
      learner.stop();
      process.exit(0);
    });
  } else {
    console.log('用法: node ContinuousLearning.js [--once|--daemon]');
    console.log('  --once  : 单次执行');
    console.log('  --daemon: 守护进程模式（持续运行）');
    process.exit(1);
  }
}

module.exports = ContinuousLearning;
