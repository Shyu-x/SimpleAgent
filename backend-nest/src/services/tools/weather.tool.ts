/**
 * 天气查询工具
 * 使用 Open-Meteo API (免费，无需 API Key)
 */

import { Logger } from '@nestjs/common';
import { ToolDefinition, ToolExecutionResult } from './tool-registry.service';
import { executeWithTimeout, executeWithRetry, validateRequiredParams } from './base.tool';

const logger = new Logger('WeatherTool');

// Open-Meteo API 端点
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

interface GeocodingResult {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  admin1?: string; // 省份/州
}

interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  weatherDescription: string;
  isDay: boolean;
  uvIndex: number;
}

/**
 * 创建天气工具定义
 */
export function createWeatherTool(): ToolDefinition {
  return {
    name: 'weather',
    description: 'Query current weather or weather forecast for a city. Use this when user asks about weather conditions, temperature, or forecasts.',
    category: 'information',
    keywords: ['天气', 'weather', '温度', '下雨', '晴天', '气温', 'forecast'],
    examples: [
      '北京今天天气怎么样',
      '上海明天会下雨吗',
      'weather in Tokyo'
    ],
    parameters: {
      properties: {
        city: {
          type: 'string',
          description: 'City name (e.g., Beijing, Shanghai, Tokyo)'
        },
        days: {
          type: 'number',
          description: 'Number of forecast days (1-7, default: 1 for today)',
          default: 1
        }
      },
      required: ['city']
    },
    execute: async (params: { city: string; days?: number }): Promise<ToolExecutionResult> => {
      const startTime = Date.now();
      const city = params.city?.trim();
      const days = Math.min(Math.max(params.days || 1, 1), 7);

      if (!city) {
        return {
          success: false,
          tool: 'weather',
          error: 'City name is required',
          errorType: 'validation',
          executionTime: 0
        };
      }

      try {
        // 第一步：地理编码
        const geoResult = await executeWithTimeout(
          () => executeWithRetry(() => geocodeCity(city), 2, 500),
          5000,
          'weather_geocoding'
        );

        if (!geoResult) {
          return {
            success: false,
            tool: 'weather',
            error: `City not found: ${city}`,
            errorType: 'not_found',
            executionTime: Date.now() - startTime
          };
        }

        // 第二步：获取天气数据
        const weatherData = await executeWithTimeout(
          () => executeWithRetry(
            () => fetchWeather(geoResult.latitude, geoResult.longitude, days),
            2,
            500
          ),
          8000,
          'weather_fetch'
        );

        return {
          success: true,
          tool: 'weather',
          result: {
            location: {
              city: geoResult.name,
              country: geoResult.country,
              province: geoResult.admin1 || '',
              latitude: geoResult.latitude,
              longitude: geoResult.longitude
            },
            weather: weatherData,
            fetchedAt: new Date().toISOString()
          },
          executionTime: Date.now() - startTime
        };
      } catch (error) {
        logger.error(`Weather query failed: ${error.message}`);
        return {
          success: false,
          tool: 'weather',
          error: error.message,
          errorType: 'weather_query_failed',
          executionTime: Date.now() - startTime
        };
      }
    }
  };
}

/**
 * 地理编码 - 将城市名转换为坐标
 */
async function geocodeCity(cityName: string): Promise<GeocodingResult | null> {
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Geocoding API error: HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    return null;
  }

  const result = data.results[0];
  return {
    name: result.name,
    country: result.country || '',
    latitude: result.latitude,
    longitude: result.longitude,
    admin1: result.admin1
  };
}

/**
 * 获取天气预报数据
 */
async function fetchWeather(
  latitude: number,
  longitude: number,
  days: number
): Promise<WeatherData[] | WeatherData> {
  const hourlyParams = 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day,uv_index';
  const dailyParams = 'weather_code,temperature_2m_max,temperature_2m_min';

  const url = `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&hourly=${hourlyParams}&daily=${dailyParams}&timezone=auto&forecast_days=${days}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Weather API error: HTTP ${response.status}`);
  }

  const data = await response.json();

  if (days === 1) {
    // 今天的数据
    return parseTodayWeather(data);
  } else {
    // 多天预报
    return parseForecastWeather(data, days);
  }
}

/**
 * 解析今天的天气数据
 */
function parseTodayWeather(data: any): WeatherData {
  const currentHour = new Date().getHours();
  const hourlyIndex = Math.min(currentHour, data.hourly.time.length - 1);

  const weatherCode = data.hourly.weather_code[hourlyIndex];
  const temperature = data.hourly.temperature_2m[hourlyIndex];
  const feelsLike = data.hourly.apparent_temperature[hourlyIndex];
  const humidity = data.hourly.relative_humidity_2m[hourlyIndex];
  const windSpeed = data.hourly.wind_speed_10m[hourlyIndex];
  const isDay = data.hourly.is_day[hourlyIndex] === 1;
  const uvIndex = data.hourly.uv_index[hourlyIndex];

  return {
    temperature: Math.round(temperature * 10) / 10,
    feelsLike: Math.round(feelsLike * 10) / 10,
    humidity: Math.round(humidity),
    windSpeed: Math.round(windSpeed * 10) / 10,
    weatherCode,
    weatherDescription: getWeatherDescription(weatherCode),
    isDay,
    uvIndex: Math.round(uvIndex * 10) / 10
  };
}

/**
 * 解析多天天气预报
 */
function parseForecastWeather(data: any, days: number): WeatherData[] {
  const results: WeatherData[] = [];

  for (let i = 0; i < days; i++) {
    const dailyCode = data.daily.weather_code[i];
    const maxTemp = data.daily.temperature_2m_max[i];
    const minTemp = data.daily.temperature_2m_min[i];

    // 使用中午的温度作为当天代表温度
    const hourIndex = 12;
    const hourlyTemp = data.hourly.temperature_2m[hourIndex + i * 24] || (maxTemp + minTemp) / 2;

    results.push({
      temperature: Math.round(hourlyTemp * 10) / 10,
      feelsLike: Math.round(hourlyTemp * 10) / 10,
      humidity: 50, // 日预报不提供湿度，用默认值
      windSpeed: 10,
      weatherCode: dailyCode,
      weatherDescription: getWeatherDescription(dailyCode),
      isDay: true,
      uvIndex: 5
    });
  }

  return results;
}

/**
 * WMO 天气代码转描述
 */
function getWeatherDescription(code: number): string {
  const weatherCodes: Record<number, string> = {
    0: '晴朗',
    1: '基本晴朗',
    2: '多云',
    3: '阴天',
    45: '有雾',
    48: '雾凇',
    51: '小毛毛雨',
    53: '中等毛毛雨',
    55: '大毛毛雨',
    56: '冻毛毛雨',
    57: '强冻毛毛雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    66: '冻雨',
    67: '强冻雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    77: '雪粒',
    80: '小阵雨',
    81: '中阵雨',
    82: '大阵雨',
    85: '小阵雪',
    86: '大阵雪',
    95: '雷暴',
    96: '雷暴伴小冰雹',
    99: '雷暴伴大冰雹'
  };

  return weatherCodes[code] || '未知天气';
}
