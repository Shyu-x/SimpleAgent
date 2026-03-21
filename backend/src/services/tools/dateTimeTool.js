/**
 * 日期时间工具
 * 处理日期时间操作和格式化
 */

class DateTimeTool {
  constructor(options = {}) {
    this.name = 'datetime';
    this.description = '处理日期时间：获取、格式化、计算、转换';
    this.category = 'utility';
    this.defaultTimezone = options.defaultTimezone || 'Asia/Shanghai';
  }

  /**
   * 参数模式
   */
  get parameters() {
    return {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: [
            'now', 'format', 'parse', 'add', 'subtract',
            'diff', 'start_of', 'end_of', 'is_before', 'is_after',
            'to_timezone', 'to_timestamp', 'from_timestamp'
          ],
          description: '操作类型'
        },
        datetime: {
          type: 'string',
          description: '日期时间字符串（某些操作需要）'
        },
        options: {
          type: 'object',
          properties: {
            format: { type: 'string', description: '格式化模式' },
            unit: { type: 'string', enum: ['year', 'month', 'week', 'day', 'hour', 'minute', 'second'], description: '时间单位' },
            value: { type: 'number', description: '数值（加减操作）' },
            timezone: { type: 'string', description: '时区' },
            targetTimezone: { type: 'string', description: '目标时区' },
            targetDatetime: { type: 'string', description: '目标日期时间（比较操作）' }
          }
        }
      },
      required: ['operation']
    };
  }

  /**
   * 执行操作
   */
  async execute(params) {
    const { operation, datetime, options = {} } = params;

    try {
      switch (operation) {
        case 'now':
          return this.getNow(options);

        case 'format':
          return this.format(datetime, options);

        case 'parse':
          return this.parse(datetime, options);

        case 'add':
          return this.add(datetime, options);

        case 'subtract':
          return this.subtract(datetime, options);

        case 'diff':
          return this.diff(datetime, options);

        case 'start_of':
          return this.startOf(datetime, options);

        case 'end_of':
          return this.endOf(datetime, options);

        case 'is_before':
          return this.isBefore(datetime, options);

        case 'is_after':
          return this.isAfter(datetime, options);

        case 'to_timezone':
          return this.toTimezone(datetime, options);

        case 'to_timestamp':
          return this.toTimestamp(datetime, options);

        case 'from_timestamp':
          return this.fromTimestamp(datetime, options);

        default:
          return { success: false, error: `未知操作: ${operation}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        operation
      };
    }
  }

  /**
   * 获取当前时间
   */
  getNow(options) {
    const now = new Date();
    const timezone = options.timezone || this.defaultTimezone;

    return {
      success: true,
      data: {
        iso: now.toISOString(),
        local: now.toLocaleString('zh-CN', { timeZone: timezone }),
        timestamp: now.getTime(),
        timezone,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        weekday: ['日', '一', '二', '三', '四', '五', '六'][now.getDay()],
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds()
      }
    };
  }

  /**
   * 格式化日期时间
   */
  format(datetime, options) {
    const date = datetime ? new Date(datetime) : new Date();

    if (isNaN(date.getTime())) {
      return { success: false, error: '无效的日期时间' };
    }

    const format = options.format || 'YYYY-MM-DD HH:mm:ss';
    const timezone = options.timezone || this.defaultTimezone;

    const formatMap = {
      'YYYY': date.getFullYear(),
      'YY': String(date.getFullYear()).slice(-2),
      'MM': String(date.getMonth() + 1).padStart(2, '0'),
      'M': date.getMonth() + 1,
      'DD': String(date.getDate()).padStart(2, '0'),
      'D': date.getDate(),
      'HH': String(date.getHours()).padStart(2, '0'),
      'H': date.getHours(),
      'mm': String(date.getMinutes()).padStart(2, '0'),
      'm': date.getMinutes(),
      'ss': String(date.getSeconds()).padStart(2, '0'),
      's': date.getSeconds(),
      'dddd': ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getDay()],
      'ddd': ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
    };

    let result = format;
    for (const [key, value] of Object.entries(formatMap)) {
      result = result.replace(new RegExp(key, 'g'), value);
    }

    return {
      success: true,
      data: result,
      format,
      iso: date.toISOString()
    };
  }

  /**
   * 解析日期时间
   */
  parse(datetime, options) {
    const date = new Date(datetime);

    if (isNaN(date.getTime())) {
      return { success: false, error: '无法解析日期时间' };
    }

    return {
      success: true,
      data: {
        iso: date.toISOString(),
        timestamp: date.getTime(),
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        second: date.getSeconds(),
        weekday: date.getDay()
      },
      input: datetime
    };
  }

  /**
   * 添加时间
   */
  add(datetime, options) {
    const date = datetime ? new Date(datetime) : new Date();
    const { unit, value = 1 } = options;

    if (isNaN(date.getTime())) {
      return { success: false, error: '无效的日期时间' };
    }

    const result = this.adjustDate(date, unit, value);

    return {
      success: true,
      data: {
        iso: result.toISOString(),
        local: result.toLocaleString('zh-CN'),
        timestamp: result.getTime()
      },
      operation: `+${value} ${unit}`
    };
  }

  /**
   * 减去时间
   */
  subtract(datetime, options) {
    const date = datetime ? new Date(datetime) : new Date();
    const { unit, value = 1 } = options;

    if (isNaN(date.getTime())) {
      return { success: false, error: '无效的日期时间' };
    }

    const result = this.adjustDate(date, unit, -value);

    return {
      success: true,
      data: {
        iso: result.toISOString(),
        local: result.toLocaleString('zh-CN'),
        timestamp: result.getTime()
      },
      operation: `-${value} ${unit}`
    };
  }

  /**
   * 计算时间差
   */
  diff(datetime, options) {
    const date1 = new Date(datetime);
    const date2 = new Date(options.targetDatetime || Date.now());

    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
      return { success: false, error: '无效的日期时间' };
    }

    const diffMs = Math.abs(date2.getTime() - date1.getTime());
    const unit = options.unit || 'day';

    const conversions = {
      year: 365 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      hour: 60 * 60 * 1000,
      minute: 60 * 1000,
      second: 1000
    };

    const result = Math.floor(diffMs / conversions[unit]);
    const direction = date2 > date1 ? 'after' : 'before';

    return {
      success: true,
      data: {
        value: result,
        unit,
        direction,
        milliseconds: diffMs,
        humanReadable: `${result} ${unit}${result > 1 ? 's' : ''} ${direction}`
      }
    };
  }

  /**
   * 获取时间段开始
   */
  startOf(datetime, options) {
    const date = datetime ? new Date(datetime) : new Date();
    const unit = options.unit || 'day';

    if (isNaN(date.getTime())) {
      return { success: false, error: '无效的日期时间' };
    }

    let result = new Date(date);

    switch (unit) {
      case 'year':
        result.setMonth(0, 1);
        result.setHours(0, 0, 0, 0);
        break;
      case 'month':
        result.setDate(1);
        result.setHours(0, 0, 0, 0);
        break;
      case 'week':
        const day = result.getDay();
        result.setDate(result.getDate() - day);
        result.setHours(0, 0, 0, 0);
        break;
      case 'day':
        result.setHours(0, 0, 0, 0);
        break;
      case 'hour':
        result.setMinutes(0, 0, 0);
        break;
      case 'minute':
        result.setSeconds(0, 0);
        break;
    }

    return {
      success: true,
      data: {
        iso: result.toISOString(),
        local: result.toLocaleString('zh-CN'),
        timestamp: result.getTime()
      },
      unit
    };
  }

  /**
   * 获取时间段结束
   */
  endOf(datetime, options) {
    const date = datetime ? new Date(datetime) : new Date();
    const unit = options.unit || 'day';

    if (isNaN(date.getTime())) {
      return { success: false, error: '无效的日期时间' };
    }

    let result = new Date(date);

    switch (unit) {
      case 'year':
        result.setMonth(11, 31);
        result.setHours(23, 59, 59, 999);
        break;
      case 'month':
        result.setMonth(result.getMonth() + 1, 0);
        result.setHours(23, 59, 59, 999);
        break;
      case 'week':
        const day = result.getDay();
        result.setDate(result.getDate() + (6 - day));
        result.setHours(23, 59, 59, 999);
        break;
      case 'day':
        result.setHours(23, 59, 59, 999);
        break;
      case 'hour':
        result.setMinutes(59, 59, 999);
        break;
      case 'minute':
        result.setSeconds(59, 999);
        break;
    }

    return {
      success: true,
      data: {
        iso: result.toISOString(),
        local: result.toLocaleString('zh-CN'),
        timestamp: result.getTime()
      },
      unit
    };
  }

  /**
   * 判断是否在之前
   */
  isBefore(datetime, options) {
    const date1 = new Date(datetime);
    const date2 = new Date(options.targetDatetime || Date.now());

    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
      return { success: false, error: '无效的日期时间' };
    }

    return {
      success: true,
      data: date1 < date2,
      comparison: `${date1.toISOString()} < ${date2.toISOString()}`
    };
  }

  /**
   * 判断是否在之后
   */
  isAfter(datetime, options) {
    const date1 = new Date(datetime);
    const date2 = new Date(options.targetDatetime || Date.now());

    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
      return { success: false, error: '无效的日期时间' };
    }

    return {
      success: true,
      data: date1 > date2,
      comparison: `${date1.toISOString()} > ${date2.toISOString()}`
    };
  }

  /**
   * 转换时区
   */
  toTimezone(datetime, options) {
    const date = datetime ? new Date(datetime) : new Date();
    const targetTimezone = options.targetTimezone || this.defaultTimezone;

    if (isNaN(date.getTime())) {
      return { success: false, error: '无效的日期时间' };
    }

    return {
      success: true,
      data: {
        iso: date.toISOString(),
        local: date.toLocaleString('zh-CN', { timeZone: targetTimezone }),
        timezone: targetTimezone
      }
    };
  }

  /**
   * 转时间戳
   */
  toTimestamp(datetime, options) {
    const date = datetime ? new Date(datetime) : new Date();

    if (isNaN(date.getTime())) {
      return { success: false, error: '无效的日期时间' };
    }

    return {
      success: true,
      data: date.getTime(),
      iso: date.toISOString()
    };
  }

  /**
   * 从时间戳转换
   */
  fromTimestamp(datetime, options) {
    const timestamp = parseInt(datetime);
    const date = new Date(timestamp);

    if (isNaN(date.getTime())) {
      return { success: false, error: '无效的时间戳' };
    }

    return {
      success: true,
      data: {
        iso: date.toISOString(),
        local: date.toLocaleString('zh-CN'),
        timestamp
      }
    };
  }

  /**
   * 辅助方法：调整日期
   */
  adjustDate(date, unit, value) {
    const result = new Date(date);

    switch (unit) {
      case 'year':
        result.setFullYear(result.getFullYear() + value);
        break;
      case 'month':
        result.setMonth(result.getMonth() + value);
        break;
      case 'week':
        result.setDate(result.getDate() + (value * 7));
        break;
      case 'day':
        result.setDate(result.getDate() + value);
        break;
      case 'hour':
        result.setHours(result.getHours() + value);
        break;
      case 'minute':
        result.setMinutes(result.getMinutes() + value);
        break;
      case 'second':
        result.setSeconds(result.getSeconds() + value);
        break;
    }

    return result;
  }
}

module.exports = DateTimeTool;