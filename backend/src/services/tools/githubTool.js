/**
 * GitHub 工具
 * 使用 gh CLI 与 GitHub API 交互
 * 功能：搜索项目、获取仓库信息、获取文件内容等
 */

const { spawn } = require('child_process');
const { execSync } = require('child_process');

class GitHubTool {
  constructor(options = {}) {
    this.name = 'github';
    this.description = '与 GitHub 交互 - 搜索项目、获取仓库信息、文件内容等';
    this.category = 'internet';
    this.timeout = options.timeout || 30000;
  }

  /**
   * 参数模式
   */
  get parameters() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search_repos', 'repo_info', 'repo_content', 'user_info', 'trending', 'issues', 'commits'],
          description: '操作类型'
        },
        query: {
          type: 'string',
          description: '搜索查询 (search_repos 时使用)'
        },
        owner: {
          type: 'string',
          description: '仓库所有者 (repo_info, repo_content 时使用)'
        },
        repo: {
          type: 'string',
          description: '仓库名称 (repo_info, repo_content 时使用)'
        },
        path: {
          type: 'string',
          description: '文件路径 (repo_content 时使用)'
        },
        user: {
          type: 'string',
          description: '用户名 (user_info 时使用)'
        },
        language: {
          type: 'string',
          description: '编程语言筛选 (search_repos 时使用)'
        },
        limit: {
          type: 'number',
          description: '结果数量限制 (默认 10)'
        },
        options: {
          type: 'object',
          description: '额外选项'
        }
      },
      required: ['action']
    };
  }

  /**
   * 执行 GitHub 操作
   */
  async execute(params) {
    const { action, query, owner, repo, path, user, language, limit = 10, options = {} } = params;

    try {
      switch (action) {
        case 'search_repos':
          return await this.searchRepos(query, { language, limit, ...options });
        case 'repo_info':
          return await this.getRepoInfo(owner, repo);
        case 'repo_content':
          return await this.getRepoContent(owner, repo, path);
        case 'user_info':
          return await this.getUserInfo(user);
        case 'trending':
          return await this.getTrendingRepos({ language, limit, ...options });
        case 'issues':
          return await this.getIssues(owner, repo, options);
        case 'commits':
          return await this.getCommits(owner, repo, { limit, ...options });
        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      console.error('[GitHubTool] 执行失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 搜索仓库
   */
  async searchRepos(query, options = {}) {
    const { language, limit = 10, sort = 'stars', order = 'desc' } = options;

    if (!query) {
      return { success: false, error: '搜索关键词不能为空' };
    }

    try {
      // 构建搜索命令
      let cmd = `gh search repos "${query}" --limit ${limit}`;
      if (language) cmd += ` --language ${language}`;
      if (sort) cmd += ` --sort ${sort}`;
      if (order) cmd += ` --order ${order}`;

      const output = await this.execCommand(cmd);
      const repos = this.parseRepoList(output);

      return {
        success: true,
        query,
        total: repos.length,
        repos
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取仓库信息
   */
  async getRepoInfo(owner, repo) {
    if (!owner || !repo) {
      return { success: false, error: 'owner 和 repo 不能为空' };
    }

    try {
      const cmd = `gh repo view ${owner}/${repo} --json name,description,url,stargazerCount,forksCount,language,topics,createdAt,updatedAt,owner`;
      const output = await this.execCommand(cmd);
      const info = JSON.parse(output);

      return {
        success: true,
        repo: {
          name: info.name,
          fullName: `${info.owner.login}/${info.name}`,
          description: info.description || '无描述',
          url: info.url,
          stars: info.stargazersCount || 0,
          forks: info.forkCount || 0,
          language: info.primaryLanguage?.name || 'Unknown',
          topics: info.topics || [],
          createdAt: info.createdAt,
          updatedAt: info.updatedAt,
          owner: info.owner.login
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取仓库内容
   */
  async getRepoContent(owner, repo, path = '') {
    if (!owner || !repo) {
      return { success: false, error: 'owner 和 repo 不能为空' };
    }

    try {
      let cmd;
      if (path) {
        // 获取特定文件内容
        cmd = `gh api repos/${owner}/${repo}/contents/${path} --jq '.content'`;
        const content = await this.execCommand(cmd);
        // Base64 解码
        const decoded = Buffer.from(content.trim(), 'base64').toString('utf-8');
        return {
          success: true,
          path,
          content: decoded,
          encoding: 'base64'
        };
      } else {
        // 获取仓库根目录
        cmd = `gh api repos/${owner}/${repo}/contents --jq '.[].name'`;
        const output = await this.execCommand(cmd);
        const files = output.split('\n').filter(f => f.trim());

        return {
          success: true,
          path: '/',
          files
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(user) {
    if (!user) {
      return { success: false, error: '用户名不能为空' };
    }

    try {
      const cmd = `gh api users/${user} --jq '{login,name,bio,company,location,blog,public_repos,followers,following,created_at}'`;
      const output = await this.execCommand(cmd);
      const info = JSON.parse(output);

      return {
        success: true,
        user: {
          login: info.login,
          name: info.name || info.login,
          bio: info.bio || '无',
          company: info.company || '',
          location: info.location || '',
          blog: info.blog || '',
          publicRepos: info.public_repos || 0,
          followers: info.followers || 0,
          following: info.following || 0,
          createdAt: info.created_at
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取 trending 仓库
   */
  async getTrendingRepos(options = {}) {
    const { language, limit = 10, since = 'daily' } = options;

    try {
      // 使用 gh 命令搜索最近创建的热门仓库
      const date = new Date();
      date.setDate(date.getDate() - 1); // 最近一天
      const dateStr = date.toISOString().split('T')[0];

      let cmd = `gh search repos created:>${dateStr} --sort stars --order desc --limit ${limit}`;
      if (language) cmd += ` --language ${language}`;

      const output = await this.execCommand(cmd);
      const repos = this.parseRepoList(output);

      return {
        success: true,
        since,
        language: language || 'all',
        total: repos.length,
        repos
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取 Issues
   */
  async getIssues(owner, repo, options = {}) {
    const { state = 'open', limit = 10, labels } = options;

    if (!owner || !repo) {
      return { success: false, error: 'owner 和 repo 不能为空' };
    }

    try {
      let cmd = `gh issue list --repo ${owner}/${repo} --state ${state} --limit ${limit}`;
      if (labels) cmd += ` --label "${labels}"`;

      const output = await this.execCommand(cmd);
      const lines = output.split('\n').filter(l => l.trim());

      const issues = lines.map(line => {
        const parts = line.split('\t');
        return {
          number: parseInt(parts[0]),
          title: parts[1] || '',
          labels: parts[2]?.split(',').map(l => l.trim()) || [],
          author: parts[3] || '',
          createdAt: parts[4] || '',
          state
        };
      });

      return {
        success: true,
        owner,
        repo,
        state,
        total: issues.length,
        issues
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取 Commits
   */
  async getCommits(owner, repo, options = {}) {
    const { limit = 10 } = options;

    if (!owner || !repo) {
      return { success: false, error: 'owner 和 repo 不能为空' };
    }

    try {
      const cmd = `gh api repos/${owner}/${repo}/commits --jq '.[0:${limit}] | .[] | {sha: .sha[0:7], message: .commit.message, author: .commit.author.name, date: .commit.author.date}'`;
      const output = await this.execCommand(cmd);
      const commits = output.split('\n').filter(l => l.trim()).map(l => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      }).filter(c => c);

      return {
        success: true,
        owner,
        repo,
        total: commits.length,
        commits
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 执行命令
   */
  execCommand(cmd) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`命令执行超时: ${cmd.substring(0, 50)}...`));
      }, this.timeout);

      try {
        const output = execSync(cmd, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        clearTimeout(timeout);
        resolve(output);
      } catch (error) {
        clearTimeout(timeout);
        if (error.status === 1 && error.stderr) {
          reject(new Error(error.stderr.toString()));
        } else {
          reject(error);
        }
      }
    });
  }

  /**
   * 解析仓库列表
   */
  parseRepoList(output) {
    if (!output || !output.trim()) return [];

    const lines = output.split('\n').filter(l => l.trim());
    return lines.map(line => {
      // 格式: owner/repo (stars) [topic1, topic2]
      const match = line.match(/^(.+?)\/(.+?)\s*\((\d+)\)/);
      if (match) {
        return {
          fullName: `${match[1]}/${match[2]}`,
          owner: match[1],
          repo: match[2],
          stars: parseInt(match[3])
        };
      }
      // 尝试解析为简单格式
      const parts = line.split('/');
      if (parts.length >= 2) {
        return {
          fullName: line.trim(),
          owner: parts[0],
          repo: parts[1]
        };
      }
      return { fullName: line.trim() };
    });
  }
}

module.exports = GitHubTool;
