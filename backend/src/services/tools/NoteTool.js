/**
 * 笔记工具
 * 个人知识管理，支持创建、搜索笔记
 */

class NoteTool {
  constructor(options = {}) {
    this.name = 'note';
    this.description = '笔记 - 创建和管理个人笔记，支持分类和搜索';
    this.category = 'utility';
    this.timeout = options.timeout || 5000;
    this.notes = new Map();
    this.categories = ['general', 'work', 'idea', 'todo', 'meeting', 'study'];
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'get', 'search', 'list', 'delete', 'update'],
          description: '操作类型'
        },
        id: {
          type: 'string',
          description: '笔记ID'
        },
        title: {
          type: 'string',
          description: '笔记标题'
        },
        content: {
          type: 'string',
          description: '笔记内容'
        },
        category: {
          type: 'string',
          description: `笔记分类: ${['general', 'work', 'idea', 'todo', 'meeting', 'study'].join(', ')}`
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '标签列表'
        }
      },
      required: ['action']
    };
  }

  async execute(params) {
    const { action, id, title, content, category = 'general', tags = [] } = params;

    try {
      switch (action) {
        case 'create':
          return this.createNote(title, content, category, tags);
        case 'get':
          return this.getNote(id);
        case 'search':
          return this.searchNotes(params);
        case 'list':
          return this.listNotes(category);
        case 'delete':
          return this.deleteNote(id);
        case 'update':
          return this.updateNote(id, { title, content, category, tags });
        default:
          return { success: false, error: `未知操作: ${action}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  generateId() {
    return `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  createNote(title, content, category, tags) {
    if (!title || !content) {
      return { success: false, error: '标题和内容不能为空' };
    }

    const id = this.generateId();
    const note = {
      id,
      title,
      content,
      category,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.notes.set(id, note);
    return { success: true, note };
  }

  getNote(id) {
    const note = this.notes.get(id);
    if (!note) {
      return { success: false, error: '笔记不存在' };
    }
    return { success: true, note };
  }

  searchNotes(params) {
    const { keyword, category, tags, limit = 10 } = params;

    let results = Array.from(this.notes.values());

    if (category) {
      results = results.filter(n => n.category === category);
    }

    if (tags && tags.length > 0) {
      results = results.filter(n =>
        tags.some(t => n.tags.includes(t))
      );
    }

    if (keyword) {
      const kw = keyword.toLowerCase();
      results = results.filter(n =>
        n.title.toLowerCase().includes(kw) ||
        n.content.toLowerCase().includes(kw)
      );
    }

    // 按更新时间排序
    results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return {
      success: true,
      notes: results.slice(0, limit),
      total: results.length
    };
  }

  listNotes(category) {
    let notes = Array.from(this.notes.values());

    if (category) {
      notes = notes.filter(n => n.category === category);
    }

    notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return {
      success: true,
      notes,
      total: notes.length,
      categories: this.categories
    };
  }

  deleteNote(id) {
    if (!this.notes.has(id)) {
      return { success: false, error: '笔记不存在' };
    }
    this.notes.delete(id);
    return { success: true, message: '笔记已删除' };
  }

  updateNote(id, updates) {
    const note = this.notes.get(id);
    if (!note) {
      return { success: false, error: '笔记不存在' };
    }

    const updated = {
      ...note,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.notes.set(id, updated);
    return { success: true, note: updated };
  }
}

module.exports = NoteTool;
