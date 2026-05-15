/**
 * 天气查询工具
 * 通过网页抓取获取天气信息
 */

class WeatherTool {
  constructor(options = {}) {
    this.name = 'weather';
    this.AppError = require('../../common/errors/AppError');
    this.description = '查询天气预报 - 支持城市名称或位置';
    this.category = 'information';
    this.timeout = options.timeout || 15000;
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称 (如：北京、上海、Beijing)'
        },
        location: {
          type: 'string',
          description: '位置/地址 (如：北京市朝阳区)'
        },
        options: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['json', 'text'], default: 'json' }
          }
        }
      },
      required: ['city']
    };
  }

  async execute(params) {
    const { city, location, options = {} } = params;

    try {
      // 使用wttr.in获取天气（免费无需API Key）
      const queryCity = location || city;
      const url = `https://wttr.in/${encodeURIComponent(queryCity)}?format=j1`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0'
        },
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw AppError.internalError(`HTTP ${response.status}`);
      }

      const data = await response.json();

      const current = data.current_condition[0];
      const weather = {
        city: queryCity,
        temperature: current.temp_C + '°C',
        feelsLike: current.FeelsLikeC + '°C',
        humidity: current.humidity + '%',
        wind: current.windspeedKm + ' km/h ' + current.winddir16Point,
        weather: current.weatherDesc[0].value,
        uvIndex: current.UVIndex,
        visibility: current.visibility + ' km',
        pressure: current.pressure + ' mb',
        sunrise: data.weather[0].astronomy[0].sunrise,
        sunset: data.weather[0].astronomy[0].sunset,
        source: 'wttr.in'
      };

      if (options.format === 'text') {
        return {
          success: true,
          text: `${weather.city}天气：${weather.weather}，温度${weather.temperature}，体感${weather.feelsLike}，湿度${weather.humidity}，风速${weather.wind}`
        };
      }

      return {
        success: true,
        weather
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = WeatherTool;
