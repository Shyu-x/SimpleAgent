/**
 * 时区转换工具
 * 支持全球时区之间的日期时间转换
 */

class TimezoneConverterTool {
  constructor(options = {}) {
    this.name = 'timezone_converter';
    this.AppError = require('../../common/errors/AppError');
    this.description = '时区转换 - 全球时区之间的时间转换';
    this.category = 'utility';
    this.timeout = options.timeout || 5000;

    // 常用时区映射
    this.timezones = {
      'UTC': 'Etc/UTC',
      '北京': 'Asia/Shanghai',
      '上海': 'Asia/Shanghai',
      '香港': 'Asia/Hong_Kong',
      '台北': 'Asia/Taipei',
      '东京': 'Asia/Tokyo',
      '首尔': 'Asia/Seoul',
      '新加坡': 'Asia/Singapore',
      '伦敦': 'Europe/London',
      '巴黎': 'Europe/Paris',
      '柏林': 'Europe/Berlin',
      '纽约': 'America/New_York',
      '洛杉矶': 'America/Los_Angeles',
      '旧金山': 'America/Los_Angeles',
      '芝加哥': 'America/Chicago',
      '多伦多': 'America/Toronto',
      '悉尼': 'Australia/Sydney',
      '墨尔本': 'Australia/Melbourne',
      '迪拜': 'Asia/Dubai',
      '孟买': 'Asia/Kolkata'
    };
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        time: {
          type: 'string',
          description: '时间 (格式: YYYY-MM-DD HH:mm 或 HH:mm，默认为当前时间)'
        },
        fromTimezone: {
          type: 'string',
          description: '源时区 (如: 北京, UTC, America/New_York)'
        },
        toTimezone: {
          type: 'string',
          description: '目标时区 (如: 伦敦, Tokyo)'
        }
      },
      required: ['fromTimezone', 'toTimezone']
    };
  }

  async execute(params) {
    const { time, fromTimezone, toTimezone } = params;

    try {
      const fromTz = this.normalizeTimezone(fromTimezone);
      const toTz = this.normalizeTimezone(toTimezone);

      // 解析时间
      let dateTime;
      if (time) {
        dateTime = this.parseTime(time);
      } else {
        dateTime = new Date();
      }

      // 创建指定时区的日期对象
      const options = {
        timeZone: toTz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      };

      const formatter = new Intl.DateTimeFormat('zh-CN', options);
      const parts = formatter.formatToParts(dateTime);

      const getPart = (type) => parts.find(p => p.type === type)?.value || '';

      const resultTime = `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;

      // 计算时差
      const offsetDiff = this.getTimezoneOffset(toTz) - this.getTimezoneOffset(fromTz);
      const hoursDiff = offsetDiff / 60;

      return {
        success: true,
        from: {
          time: this.formatTime(dateTime, fromTz),
          timezone: fromTimezone,
          offset: `UTC${hoursDiff >= 0 ? '+' : ''}${hoursDiff}`
        },
        to: {
          time: resultTime,
          timezone: toTimezone,
          offset: 'UTC'
        },
        timeDifference: `${hoursDiff >= 0 ? '+' : ''}${hoursDiff}小时`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  normalizeTimezone(tz) {
    return this.timezones[tz] || tz;
  }

  parseTime(timeStr) {
    // 简单解析：支持 YYYY-MM-DD HH:mm 或 HH:mm
    const dateTimeRegex = /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?$/;
    const match = timeStr.match(dateTimeRegex);

    if (match) {
      const dateStr = match[1];
      const timeStr = match[2] || '00:00';
      return new Date(`${dateStr}T${timeStr}:00`);
    }

    // 尝试直接解析
    const parsed = new Date(timeStr);
    if (isNaN(parsed.getTime())) {
      throw this.AppError.validationError('time format', '时间格式无效，请使用 YYYY-MM-DD HH:mm 或 HH:mm 格式');
    }
    return parsed;
  }

  formatTime(date, timezone) {
    const options = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };

    const parts = new Intl.DateTimeFormat('zh-CN', options).formatToParts(date);
    const getPart = (type) => parts.find(p => p.type === type)?.value || '';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
  }

  getTimezoneOffset(tz) {
    const now = new Date();
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    return (tzDate - utcDate) / (1000 * 60);
  }

  getSupportedTimezones() {
    return Object.keys(this.timezones);
  }
}

module.exports = TimezoneConverterTool;
