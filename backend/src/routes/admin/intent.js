/**
 * 意图树管理 API
 *
 * 提供意图树的 CRUD 操作，支持：
 * - 领域 -> 类目 -> 话题 三层树结构
 * - 节点创建、更新、删除、移动
 * - 意图匹配测试
 *
 * @swagger
 * tags:
 *   - name: admin
 *     description: 管理后台接口
 *   - name: intent
 *     description: 意图树管理
 */

const express = require('express');
const router = express.Router();

// ==================== 数据模型 ====================

/**
 * @typedef {Object} IntentNode
 * @property {string} id
 * @property {string} name
 * @property {number} level - 层级 (1: 领域, 2: 类目, 3: 话题)
 * @property {string[]} keywords
 * @property {string} [description]
 * @property {IntentNode[]} children
 * @property {boolean} enabled
 * @property {string} [parentId]
 * @property {string} [action]
 * @property {Object} [parameters]
 * @property {number} [priority]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

// ==================== 内存存储 ====================

// 意图树存储 (key: node.id, value: node)
const intentStore = new Map();

// 根节点列表
let rootNodes = [];

// 版本号用于缓存控制
let treeVersion = Date.now().toString(36);

// 初始化示例数据
function initSampleData() {
  const sampleTree = [
    {
      id: '1',
      name: '编程帮助',
      level: 1,
      keywords: ['编程', '代码', '程序', 'programming'],
      description: '提供各类编程问题的帮助',
      enabled: true,
      action: 'code_assistant',
      parameters: {},
      children: [
        {
          id: '1-1',
          name: 'JavaScript',
          level: 2,
          keywords: ['javascript', 'js', 'ecmascript'],
          description: 'JavaScript编程相关',
          enabled: true,
          action: 'js_helper',
          parameters: {},
          children: [
            {
              id: '1-1-1',
              name: '异步编程',
              level: 3,
              keywords: ['async', 'await', 'promise', '回调', '异步'],
              description: 'JavaScript异步编程相关问题',
              enabled: true,
              action: 'async_helper',
              parameters: {},
              children: []
            },
            {
              id: '1-1-2',
              name: 'DOM操作',
              level: 3,
              keywords: ['dom', 'document', 'element', '事件'],
              description: 'DOM操作和事件处理',
              enabled: true,
              action: 'dom_helper',
              parameters: {},
              children: []
            }
          ]
        },
        {
          id: '1-2',
          name: 'Python',
          level: 2,
          keywords: ['python', 'py'],
          description: 'Python编程相关',
          enabled: true,
          action: 'python_helper',
          parameters: {},
          children: [
            {
              id: '1-2-1',
              name: '数据分析',
              level: 3,
              keywords: ['pandas', 'numpy', 'matplotlib', '数据'],
              description: 'Python数据分析相关',
              enabled: true,
              action: 'data_analysis',
              parameters: {},
              children: []
            }
          ]
        }
      ]
    },
    {
      id: '2',
      name: '写作助手',
      level: 1,
      keywords: ['写作', '文章', '文案', 'write'],
      description: '帮助用户进行各类写作任务',
      enabled: true,
      action: 'writing_assistant',
      parameters: {},
      children: [
        {
          id: '2-1',
          name: '文案创作',
          level: 2,
          keywords: ['文案', '广告', '营销', '推广'],
          description: '营销文案创作',
          enabled: true,
          action: 'copy_writer',
          parameters: {},
          children: [
            {
              id: '2-1-1',
              name: '社交媒体',
              level: 3,
              keywords: ['微博', '小红书', '抖音', '短视频'],
              description: '社交媒体文案',
              enabled: true,
              action: 'social_media_writer',
              parameters: {},
              children: []
            }
          ]
        }
      ]
    },
    {
      id: '3',
      name: '知识问答',
      level: 1,
      keywords: ['什么是', '解释', '请问', '问答', '知识'],
      description: '通用知识问答',
      enabled: true,
      action: 'knowledge_qa',
      parameters: {},
      children: []
    }
  ];

  // 扁平化存储所有节点
  const flattenAndStore = (nodes, parentId = null) => {
    nodes.forEach(node => {
      // 复制节点避免引用问题，设置正确的parentId
      const nodeCopy = {
        ...node,
        parentId,
        children: []
      };
      intentStore.set(node.id, nodeCopy);
      if (node.children && node.children.length > 0) {
        flattenAndStore(node.children, node.id);
      }
    });
  };

  flattenAndStore(sampleTree);
  rootNodes = sampleTree.map(n => ({ ...n, children: [] }));
}

// 初始化
initSampleData();

// ==================== 辅助函数 ====================

/**
 * 生成唯一ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * 递归构建树结构
 */
function buildTreeFromStore(parentId = null) {
  const children = [];

  for (const [id, node] of intentStore) {
    if (node.parentId === parentId) {
      const nodeWithChildren = {
        ...node,
        children: buildTreeFromStore(id)
      };
      children.push(nodeWithChildren);
    }
  }

  // 按 priority 和 name 排序
  children.sort((a, b) => {
    if (a.priority !== b.priority) {
      return (a.priority || 0) - (b.priority || 0);
    }
    return a.name.localeCompare(b.name);
  });

  return children;
}

/**
 * 深度克隆节点
 */
function cloneNode(node) {
  return JSON.parse(JSON.stringify(node));
}

/**
 * 更新父节点的children引用
 */
function updateParentChildren(node) {
  if (node.parentId) {
    const parent = intentStore.get(node.parentId);
    if (parent) {
      const childIndex = parent.children.findIndex(c => c.id === node.id);
      if (childIndex === -1) {
        parent.children.push(node.id);
      }
    }
  }
}

/**
 * 从父节点移除孩子引用
 */
function removeFromParent(node) {
  if (node.parentId) {
    const parent = intentStore.get(node.parentId);
    if (parent) {
      parent.children = parent.children.filter(c => c !== node.id);
    }
  }
}

/**
 * 递归查找节点
 */
function findNodeRecursive(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      const found = findNodeRecursive(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 查找节点（从树或存储）
 */
function findNode(id) {
  const tree = buildTreeFromStore();
  return findNodeRecursive(tree, id);
}

/**
 * 递归删除节点
 */
function deleteNodeRecursive(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      const deleted = nodes.splice(i, 1)[0];
      // 递归删除所有子节点
      if (deleted.children && deleted.children.length > 0) {
        for (const childId of deleted.children) {
          const childNode = intentStore.get(childId);
          if (childNode) {
            deleteNodeRecursive([childNode], id); // 递归删除
            intentStore.delete(childId);
          }
        }
      }
      intentStore.delete(id);
      return true;
    }
    if (nodes[i].children && nodes[i].children.length > 0) {
      if (deleteNodeRecursive(nodes[i].children, id)) {
        return true;
      }
    }
  }
  return false;
}

// ==================== API 路由 ====================

/**
 * GET /api/admin/intent
 * 获取完整的意图树 (根路径)
 */
router.get('/', (req, res) => {
  try {
    const tree = buildTreeFromStore();
    res.json({
      tree,
      version: treeVersion,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('获取意图树失败:', error);
    res.status(500).json({
      error: {
        message: '获取意图树失败',
        type: 'internal_error'
      }
    });
  }
});

/**
 * GET /api/admin/intent/tree
 * 获取完整的意图树
 */
router.get('/tree', (req, res) => {
  try {
    const tree = buildTreeFromStore();
    res.json({
      tree,
      version: treeVersion,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('获取意图树失败:', error);
    res.status(500).json({
      error: {
        message: '获取意图树失败',
        type: 'internal_error'
      }
    });
  }
});

/**
 * GET /api/admin/intent/node/:id
 * 获取单个节点详情
 */
router.get('/node/:id', (req, res) => {
  try {
    const { id } = req.params;
    const node = findNode(id);

    if (!node) {
      return res.status(404).json({
        error: {
          message: '节点不存在',
          type: 'not_found_error'
        }
      });
    }

    res.json(node);
  } catch (error) {
    console.error('获取节点失败:', error);
    res.status(500).json({
      error: {
        message: '获取节点失败',
        type: 'internal_error'
      }
    });
  }
});

/**
 * POST /api/admin/intent/node
 * 创建新节点
 *
 * Body: {
 *   name: string,
 *   level: number,
 *   keywords: string[],
 *   description?: string,
 *   parentId?: string,
 *   enabled?: boolean,
 *   action?: string,
 *   parameters?: object,
 *   priority?: number
 * }
 */
router.post('/node', (req, res) => {
  try {
    const {
      name,
      level,
      keywords = [],
      description = '',
      parentId = null,
      enabled = true,
      action = '',
      parameters = {},
      priority = 0
    } = req.body;

    // 验证必填字段
    if (!name || !name.trim()) {
      return res.status(400).json({
        error: {
          message: '节点名称不能为空',
          type: 'validation_error'
        }
      });
    }

    if (!level || level < 1 || level > 3) {
      return res.status(400).json({
        error: {
          message: '层级必须为 1、2 或 3',
          type: 'validation_error'
        }
      });
    }

    // 验证父节点存在且层级正确
    if (parentId) {
      const parent = intentStore.get(parentId);
      if (!parent) {
        return res.status(400).json({
          error: {
            message: '父节点不存在',
            type: 'validation_error'
          }
        });
      }
      if (parent.level >= level) {
        return res.status(400).json({
          error: {
            message: '子节点层级必须大于父节点层级',
            type: 'validation_error'
          }
        });
      }
    }

    const id = generateId();
    const now = new Date().toISOString();

    const newNode = {
      id,
      name: name.trim(),
      level,
      keywords,
      description,
      parentId,
      enabled,
      action,
      parameters,
      priority,
      children: [],
      createdAt: now,
      updatedAt: now
    };

    // 存储节点
    intentStore.set(id, newNode);

    // 更新版本号
    treeVersion = Date.now().toString(36);

    res.status(201).json({
      id,
      message: '节点创建成功',
      version: treeVersion
    });
  } catch (error) {
    console.error('创建节点失败:', error);
    res.status(500).json({
      error: {
        message: '创建节点失败',
        type: 'internal_error'
      }
    });
  }
});

/**
 * PUT /api/admin/intent/node/:id
 * 更新节点
 *
 * Body: {
 *   name?: string,
 *   keywords?: string[],
 *   description?: string,
 *   enabled?: boolean,
 *   action?: string,
 *   parameters?: object,
 *   priority?: number,
 *   parentId?: string  // 用于移动节点
 * }
 */
router.put('/node/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const node = intentStore.get(id);
    if (!node) {
      return res.status(404).json({
        error: {
          message: '节点不存在',
          type: 'not_found_error'
        }
      });
    }

    // 如果要移动节点（改变 parentId）
    if (updates.parentId !== undefined && updates.parentId !== node.parentId) {
      const newParentId = updates.parentId;

      // 验证不能将自己设为祖先
      if (newParentId) {
        let ancestorId = newParentId;
        while (ancestorId) {
          if (ancestorId === id) {
            return res.status(400).json({
              error: {
                message: '不能将节点移动到自己的子节点下',
                type: 'validation_error'
              }
            });
          }
          const ancestor = intentStore.get(ancestorId);
          ancestorId = ancestor ? ancestor.parentId : null;
        }

        // 验证父节点存在
        const newParent = intentStore.get(newParentId);
        if (!newParent) {
          return res.status(400).json({
            error: {
              message: '父节点不存在',
              type: 'validation_error'
            }
          });
        }

        // 验证层级关系
        if (newParent.level >= node.level) {
          return res.status(400).json({
            error: {
              message: '子节点层级必须大于父节点层级',
              type: 'validation_error'
            }
          });
        }
      }

      // 从旧父节点移除
      removeFromParent(node);

      // 设置新父节点
      node.parentId = newParentId || null;
    }

    // 更新其他字段
    if (updates.name !== undefined) node.name = updates.name.trim();
    if (updates.keywords !== undefined) node.keywords = updates.keywords;
    if (updates.description !== undefined) node.description = updates.description;
    if (updates.enabled !== undefined) node.enabled = updates.enabled;
    if (updates.action !== undefined) node.action = updates.action;
    if (updates.parameters !== undefined) node.parameters = updates.parameters;
    if (updates.priority !== undefined) node.priority = updates.priority;
    node.updatedAt = new Date().toISOString();

    // 更新版本号
    treeVersion = Date.now().toString(36);

    res.json({
      message: '节点更新成功',
      version: treeVersion
    });
  } catch (error) {
    console.error('更新节点失败:', error);
    res.status(500).json({
      error: {
        message: '更新节点失败',
        type: 'internal_error'
      }
    });
  }
});

/**
 * DELETE /api/admin/intent/node/:id
 * 删除节点及其所有子节点
 */
router.delete('/node/:id', (req, res) => {
  try {
    const { id } = req.params;

    const node = intentStore.get(id);
    if (!node) {
      return res.status(404).json({
        error: {
          message: '节点不存在',
          type: 'not_found_error'
        }
      });
    }

    // 收集所有要删除的节点ID（包括自己）
    const nodesToDelete = [id];
    const collectChildIds = (parentId) => {
      for (const [nodeId, n] of intentStore) {
        if (n.parentId === parentId) {
          nodesToDelete.push(nodeId);
          collectChildIds(nodeId);
        }
      }
    };
    collectChildIds(id);

    // 删除节点及其子节点
    for (const nodeId of nodesToDelete) {
      intentStore.delete(nodeId);
    }

    // 从根节点列表中移除
    rootNodes = rootNodes.filter(n => n.id !== id);

    // 更新版本号
    treeVersion = Date.now().toString(36);

    res.json({
      message: `成功删除 ${nodesToDelete.length} 个节点`,
      deletedCount: nodesToDelete.length,
      version: treeVersion
    });
  } catch (error) {
    console.error('删除节点失败:', error);
    res.status(500).json({
      error: {
        message: '删除节点失败',
        type: 'internal_error'
      }
    });
  }
});

/**
 * POST /api/admin/intent/node/:id/children
 * 添加子节点（快捷方式）
 */
router.post('/node/:id/children', (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      keywords = [],
      description = '',
      enabled = true,
      action = '',
      parameters = {},
      priority = 0
    } = req.body;

    const parent = intentStore.get(id);
    if (!parent) {
      return res.status(404).json({
        error: {
          message: '父节点不存在',
          type: 'not_found_error'
        }
      });
    }

    if (parent.level >= 3) {
      return res.status(400).json({
        error: {
          message: '话题层级不能再添加子节点',
          type: 'validation_error'
        }
      });
    }

    const newLevel = parent.level + 1;
    const newId = generateId();
    const now = new Date().toISOString();

    const newNode = {
      id: newId,
      name: name.trim(),
      level: newLevel,
      keywords,
      description,
      parentId: id,
      enabled,
      action,
      parameters,
      priority,
      children: [],
      createdAt: now,
      updatedAt: now
    };

    intentStore.set(newId, newNode);
    treeVersion = Date.now().toString(36);

    res.status(201).json({
      id: newId,
      message: '子节点创建成功',
      version: treeVersion
    });
  } catch (error) {
    console.error('添加子节点失败:', error);
    res.status(500).json({
      error: {
        message: '添加子节点失败',
        type: 'internal_error'
      }
    });
  }
});

/**
 * PUT /api/admin/intent/node/:id/move
 * 移动节点位置
 *
 * Body: {
 *   parentId: string | null,  // 新的父节点ID，null 表示移到根
 *   position?: number          // 在父节点children中的位置
 * }
 */
router.put('/node/:id/move', (req, res) => {
  try {
    const { id } = req.params;
    const { parentId, position } = req.body;

    const node = intentStore.get(id);
    if (!node) {
      return res.status(404).json({
        error: {
          message: '节点不存在',
          type: 'not_found_error'
        }
      });
    }

    // 验证不能将自己设为祖先
    if (parentId) {
      let ancestorId = parentId;
      while (ancestorId) {
        if (ancestorId === id) {
          return res.status(400).json({
            error: {
              message: '不能将节点移动到自己的子节点下',
              type: 'validation_error'
            }
          });
        }
        const ancestor = intentStore.get(ancestorId);
        ancestorId = ancestor ? ancestor.parentId : null;
      }

      const newParent = intentStore.get(parentId);
      if (!newParent) {
        return res.status(400).json({
          error: {
            message: '父节点不存在',
            type: 'validation_error'
          }
        });
      }

      if (newParent.level >= node.level) {
        return res.status(400).json({
          error: {
            message: '子节点层级必须大于父节点层级',
            type: 'validation_error'
          }
        });
      }
    }

    // 从旧父节点移除
    removeFromParent(node);

    // 设置新父节点
    node.parentId = parentId || null;
    node.updatedAt = new Date().toISOString();

    treeVersion = Date.now().toString(36);

    res.json({
      message: '节点移动成功',
      version: treeVersion
    });
  } catch (error) {
    console.error('移动节点失败:', error);
    res.status(500).json({
      error: {
        message: '移动节点失败',
        type: 'internal_error'
      }
    });
  }
});

/**
 * PATCH /api/admin/intent/node/:id/move
 * 移动节点位置 (PATCH 别名，与 PUT 相同)
 *
 * Body: {
 *   parentId: string | null,  // 新的父节点ID，null 表示移到根
 *   position?: number          // 在父节点children中的位置
 * }
 */
router.patch('/node/:id/move', (req, res) => {
  try {
    const { id } = req.params;
    const { parentId, position } = req.body;

    const node = intentStore.get(id);
    if (!node) {
      return res.status(404).json({
        error: {
          message: '节点不存在',
          type: 'not_found_error'
        }
      });
    }

    // 验证不能将自己设为祖先
    if (parentId) {
      let ancestorId = parentId;
      while (ancestorId) {
        if (ancestorId === id) {
          return res.status(400).json({
            error: {
              message: '不能将节点移动到自己的子节点下',
              type: 'validation_error'
            }
          });
        }
        const ancestor = intentStore.get(ancestorId);
        ancestorId = ancestor ? ancestor.parentId : null;
      }

      const newParent = intentStore.get(parentId);
      if (!newParent) {
        return res.status(400).json({
          error: {
            message: '父节点不存在',
            type: 'validation_error'
          }
        });
      }

      if (newParent.level >= node.level) {
        return res.status(400).json({
          error: {
            message: '子节点层级必须大于父节点层级',
            type: 'validation_error'
          }
        });
      }
    }

    // 从旧父节点移除
    removeFromParent(node);

    // 设置新父节点
    node.parentId = parentId || null;
    node.updatedAt = new Date().toISOString();

    treeVersion = Date.now().toString(36);

    res.json({
      message: '节点移动成功',
      version: treeVersion
    });
  } catch (error) {
    console.error('移动节点失败:', error);
    res.status(500).json({
      error: {
        message: '移动节点失败',
        type: 'internal_error'
      }
    });
  }
});

/**
 * POST /api/admin/intent/test
 * 测试意图匹配
 *
 * Body: {
 *   query: string
 * }
 */
router.post('/test', (req, res) => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({
        error: {
          message: '查询不能为空',
          type: 'validation_error'
        }
      });
    }

    const lowerQuery = query.toLowerCase().trim();
    let bestMatch = null;
    let bestMatchCount = 0;

    // 遍历所有节点查找匹配
    for (const [id, node] of intentStore) {
      if (!node.enabled) continue;

      const matchedKeywords = node.keywords.filter(kw =>
        kw.toLowerCase().includes(lowerQuery) || lowerQuery.includes(kw.toLowerCase())
      );

      if (matchedKeywords.length > bestMatchCount) {
        bestMatchCount = matchedKeywords.length;
        bestMatch = {
          nodeId: id,
          nodeName: node.name,
          matchedKeywords,
          confidence: Math.min(1, matchedKeywords.length * 0.3 + 0.3)
        };
      }
    }

    if (bestMatch) {
      res.json({
        matched: true,
        nodeId: bestMatch.nodeId,
        nodeName: bestMatch.nodeName,
        confidence: bestMatch.confidence,
        matchedKeywords: bestMatch.matchedKeywords
      });
    } else {
      res.json({
        matched: false,
        confidence: 0,
        matchedKeywords: []
      });
    }
  } catch (error) {
    console.error('意图测试失败:', error);
    res.status(500).json({
      error: {
        message: '意图测试失败',
        type: 'internal_error'
      }
    });
  }
});

/**
 * GET /api/admin/intent/version
 * 获取当前版本号（用于缓存控制）
 */
router.get('/version', (req, res) => {
  res.json({
    version: treeVersion,
    updatedAt: new Date().toISOString()
  });
});

/**
 * POST /api/admin/intent/reset
 * 重置为示例数据
 */
router.post('/reset', (req, res) => {
  try {
    intentStore.clear();
    rootNodes = [];
    initSampleData();
    treeVersion = Date.now().toString(36);

    res.json({
      message: '意图树已重置为示例数据',
      version: treeVersion
    });
  } catch (error) {
    console.error('重置失败:', error);
    res.status(500).json({
      error: {
        message: '重置失败',
        type: 'internal_error'
      }
    });
  }
});

module.exports = router;
