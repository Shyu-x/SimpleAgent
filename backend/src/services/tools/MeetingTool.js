/**
 * 日程工具
 * 日程管理，支持创建、查询、提醒
 */

class MeetingTool {
  constructor(options = {}) {
    this.name = 'meeting';
    this.description = '日程管理 - 创建会议、设置提醒、时间规划';
    this.category = 'utility';
    this.timeout = options.timeout || 5000;
    this.events = new Map();
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'get', 'list', 'delete', 'remind', 'today', 'conflict'],
          description: '操作类型'
        },
        id: {
          type: 'string',
          description: '日程ID'
        },
        title: {
          type: 'string',
          description: '日程标题'
        },
        description: {
          type: 'string',
          description: '日程描述'
        },
        startTime: {
          type: 'string',
          description: '开始时间 (ISO 8601格式)'
        },
        endTime: {
          type: 'string',
          description: '结束时间 (ISO 8601格式)'
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: '参与者邮箱'
        },
        options: {
          type: 'object',
          properties: {
            reminder: { type: 'number', description: '提前提醒分钟数' },
            location: { type: 'string', description: '地点' }
          }
        }
      },
      required: ['action']
    };
  }

  async execute(params) {
    const { action, id, title, description, startTime, endTime, attendees = [], options = {} } = params;

    try {
      switch (action) {
        case 'create':
          return this.createEvent(title, description, startTime, endTime, attendees, options);
        case 'get':
          return this.getEvent(id);
        case 'list':
          return this.listEvents(params);
        case 'delete':
          return this.deleteEvent(id);
        case 'remind':
          return this.setReminder(id, options.reminder);
        case 'today':
          return this.getTodayEvents();
        case 'conflict':
          return this.checkConflict(startTime, endTime);
        default:
          return { success: false, error: `未知操作: ${action}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  generateId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  createEvent(title, description, startTime, endTime, attendees, options = {}) {
    if (!title || !startTime) {
      return { success: false, error: '标题和开始时间不能为空' };
    }

    const id = this.generateId();
    const event = {
      id,
      title,
      description: description || '',
      startTime,
      endTime: endTime || this.addHours(startTime, 1),
      attendees,
      reminder: options.reminder || 30,
      location: options.location || '',
      createdAt: new Date().toISOString(),
      status: 'confirmed'
    };

    this.events.set(id, event);
    return { success: true, event };
  }

  addHours(isoTime, hours) {
    const date = new Date(isoTime);
    date.setHours(date.getHours() + hours);
    return date.toISOString();
  }

  getEvent(id) {
    const event = this.events.get(id);
    if (!event) {
      return { success: false, error: '日程不存在' };
    }
    return { success: true, event };
  }

  listEvents(params) {
    const { startDate, endDate, status } = params;
    let events = Array.from(this.events.values());

    if (startDate) {
      events = events.filter(e => new Date(e.startTime) >= new Date(startDate));
    }

    if (endDate) {
      events = events.filter(e => new Date(e.startTime) <= new Date(endDate));
    }

    if (status) {
      events = events.filter(e => e.status === status);
    }

    events.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    return { success: true, events, total: events.length };
  }

  deleteEvent(id) {
    if (!this.events.has(id)) {
      return { success: false, error: '日程不存在' };
    }
    this.events.delete(id);
    return { success: true, message: '日程已删除' };
  }

  setReminder(id, minutes) {
    const event = this.events.get(id);
    if (!event) {
      return { success: false, error: '日程不存在' };
    }

    event.reminder = minutes;
    this.events.set(id, event);

    return {
      success: true,
      message: `已设置 ${minutes} 分钟前提醒`,
      reminderTime: this.calculateReminderTime(event.startTime, minutes)
    };
  }

  calculateReminderTime(startTime, minutes) {
    const reminderDate = new Date(new Date(startTime).getTime() - minutes * 60000);
    return reminderDate.toISOString();
  }

  getTodayEvents() {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const events = Array.from(this.events.values())
      .filter(e => {
        const eventStart = new Date(e.startTime);
        return eventStart >= startOfDay && eventStart < endOfDay;
      })
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    return {
      success: true,
      date: startOfDay.toISOString().split('T')[0],
      events,
      total: events.length
    };
  }

  checkConflict(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);

    const conflicts = Array.from(this.events.values()).filter(e => {
      const eStart = new Date(e.startTime);
      const eEnd = new Date(e.endTime);
      return (start < eEnd && end > eStart);
    });

    return {
      success: true,
      hasConflict: conflicts.length > 0,
      conflictingEvents: conflicts
    };
  }
}

module.exports = MeetingTool;
