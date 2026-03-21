/**
 * 数据库客户端
 * 使用原生 pg 库，支持 PostgreSQL 和 pgvector
 */
const { Pool } = require('pg');

// 创建连接池
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://chat:chat123@localhost:54320/aichat',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// 测试连接
async function initializeDatabase() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ PostgreSQL 数据库连接成功');
    return true;
  } catch (error) {
    console.log('⚠️ 数据库连接失败:', error.message);
    console.log('   服务将继续运行但数据将存储在内存中');
    return false;
  }
}

// 关闭连接池
async function closeDatabase() {
  await pool.end();
  console.log('✅ 数据库连接池已关闭');
}

// 导出查询方法
const query = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (error) {
    console.error('❌ 查询失败:', error.message);
    throw error;
  }
};

// Prisma 兼容接口 (简化实现，用于现有代码兼容)
const prisma = {
  $connect: async () => {
    const client = await pool.connect();
    client.release();
  },
  $disconnect: async () => {
    await pool.end();
  },
  $executeRaw: async (strings, ...params) => {
    const queryText = strings.reduce((acc, str, i) => acc + str + (i < params.length ? `$${i + 1}` : ''), '');
    const result = await pool.query(queryText, params);
    return result.rowCount;
  },
  $queryRaw: async (strings, ...params) => {
    const queryText = strings.reduce((acc, str, i) => acc + str + (i < params.length ? `$${i + 1}` : ''), '');
    const result = await pool.query(queryText, params);
    return result.rows;
  },
  conversation: {
    findMany: async (options = {}) => {
      const { where = {}, orderBy = {}, take = 50, skip = 0, select = {} } = options;
      let query = 'SELECT * FROM conversations WHERE 1=1';
      const params = [];

      if (where.userId) {
        params.push(where.userId);
        query += ` AND user_id = $${params.length}`;
      }
      if (where.isDeleted !== undefined) {
        query += ' AND is_deleted = ' + (where.isDeleted ? 'TRUE' : 'FALSE');
      }

      query += ` ORDER BY updated_at DESC LIMIT ${take} OFFSET ${skip}`;

      const result = await pool.query(query, params);
      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    },
    findUnique: async ({ where }) => {
      const result = await pool.query('SELECT * FROM conversations WHERE id = $1', [where.id]);
      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
    create: async ({ data }) => {
      const result = await pool.query(
        'INSERT INTO conversations (user_id, title, metadata) VALUES ($1, $2, $3) RETURNING *',
        [data.userId || 'default', data.title || '新对话', JSON.stringify(data.metadata || {})]
      );
      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
    update: async ({ where, data }) => {
      const updates = [];
      const params = [];

      if (data.title) {
        params.push(data.title);
        updates.push(`title = $${params.length}`);
      }
      if (data.metadata) {
        params.push(JSON.stringify(data.metadata));
        updates.push(`metadata = $${params.length}`);
      }
      if (data.isDeleted !== undefined) {
        updates.push(`is_deleted = ${data.isDeleted}`);
        if (data.isDeleted) {
          updates.push(`deleted_at = NOW()`);
        }
      }

      params.push(where.id);
      const result = await pool.query(
        `UPDATE conversations SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      );
      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  },
  message: {
    findMany: async (options = {}) => {
      const { where = {}, orderBy = {}, take = 100, skip = 0 } = options;
      let query = 'SELECT * FROM messages WHERE 1=1';
      const params = [];

      if (where.conversationId) {
        params.push(where.conversationId);
        query += ` AND conversation_id = $${params.length}`;
      }
      if (where.isDeleted !== undefined) {
        query += ' AND is_deleted = ' + (where.isDeleted ? 'TRUE' : 'FALSE');
      }

      query += ` ORDER BY created_at ASC LIMIT ${take} OFFSET ${skip}`;

      const result = await pool.query(query, params);
      return result.rows.map(row => ({
        id: row.id,
        conversationId: row.conversation_id,
        role: row.role,
        content: row.content,
        model: row.model,
        provider: row.provider,
        tokensUsed: row.tokens_used,
        attachments: row.attachments,
        metadata: row.metadata,
        createdAt: row.created_at,
      }));
    },
    create: async ({ data }) => {
      const result = await pool.query(
        `INSERT INTO messages (conversation_id, role, content, model, provider, tokens_used, attachments, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          data.conversationId,
          data.role,
          data.content,
          data.model,
          data.provider,
          data.tokensUsed,
          JSON.stringify(data.attachments || []),
          JSON.stringify(data.metadata || {}),
        ]
      );
      const row = result.rows[0];
      return {
        id: row.id,
        conversationId: row.conversation_id,
        role: row.role,
        content: row.content,
        model: row.model,
        provider: row.provider,
        tokensUsed: row.tokens_used,
        attachments: row.attachments,
        metadata: row.metadata,
        createdAt: row.created_at,
      };
    },
  },
  globalMemory: {
    findMany: async (options = {}) => {
      const { where = {}, take = 50, skip = 0 } = options;
      let query = 'SELECT * FROM global_memories WHERE 1=1';
      const params = [];

      if (where.userId) {
        params.push(where.userId);
        query += ` AND user_id = $${params.length}`;
      }
      if (where.type) {
        params.push(where.type);
        query += ` AND type = $${params.length}`;
      }

      query += ` ORDER BY importance DESC, updated_at DESC LIMIT ${take} OFFSET ${skip}`;

      const result = await pool.query(query, params);
      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        content: row.content,
        type: row.type,
        importance: row.importance,
        tags: row.tags,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    },
    create: async ({ data }) => {
      const result = await pool.query(
        `INSERT INTO global_memories (user_id, content, type, importance, tags)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          data.userId || 'default',
          data.content,
          data.type || 'general',
          data.importance || 'medium',
          data.tags || [],
        ]
      );
      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        content: row.content,
        type: row.type,
        importance: row.importance,
        tags: row.tags,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  },
};

module.exports = {
  pool,
  prisma,
  query,
  initializeDatabase,
  closeDatabase,
};
