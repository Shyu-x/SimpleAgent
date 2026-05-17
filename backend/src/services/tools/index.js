/**
 * 工具索引 - 导出所有工具
 */

const ToolRegistry = require('./toolRegistry');
const FileSystemTool = require('./fileSystemTool');
const ShellTool = require('./shellTool');
const WebSearchTool = require('./webSearchTool');
const CodeExecutionTool = require('./codeExecutionTool');
const HttpRequestTool = require('./httpRequestTool');
const DataProcessingTool = require('./dataProcessingTool');
const CalculatorTool = require('./calculatorTool');
const DateTimeTool = require('./dateTimeTool');
const WebScraperTool = require('./webScraperTool');
const GitHubTool = require('./githubTool');
const EnhancedSearchTool = require('./enhancedSearchTool');
const ReadmeTool = require('./readmeTool');
const MiniMaxSearchTool = require('../miniMaxSearchTool');
const DuckDuckGoSearchTool = require('../duckduckgoSearchTool');
const WeatherTool = require('./weatherTool');
const TranslationTool = require('./translationTool');
const CodeReviewTool = require('./codeReviewTool');
const ImageGenerationTool = require('./ImageGenerationTool');
const QrCodeTool = require('./QrCodeTool');
const CurrencyConverterTool = require('./CurrencyConverterTool');
const UrlShortenerTool = require('./UrlShortenerTool');
const TimezoneConverterTool = require('./TimezoneConverterTool');
const TextSummaryTool = require('./TextSummaryTool');
const ErrorTrackingTool = require('./ErrorTrackingTool');
const NoteTool = require('./NoteTool');
const PromptTemplateTool = require('./PromptTemplateTool');
const MeetingTool = require('./MeetingTool');

/**
 * 创建默认工具注册表
 */
function createDefaultToolRegistry(options = {}) {
  const registry = new ToolRegistry();

  // 文件系统工具
  registry.register(new FileSystemTool(options.fileSystem || {}));

  // Shell 工具
  registry.register(new ShellTool(options.shell || {}));

  // Web 搜索工具
  registry.register(new WebSearchTool(options.webSearch || {}));

  // HTTP 请求工具
  registry.register(new HttpRequestTool(options.httpRequest || {}));

  // 数据处理工具
  registry.register(new DataProcessingTool(options.dataProcessing || {}));

  // 计算器工具
  registry.register(new CalculatorTool(options.calculator || {}));

  // 日期时间工具
  registry.register(new DateTimeTool(options.datetime || {}));

  // 网页抓取工具
  registry.register(new WebScraperTool(options.webScraper || {}));

  // 代码执行工具
  if (options.enableCodeExecution !== false) {
    registry.register(new CodeExecutionTool(options.codeExecution || {}));
  }

  // GitHub 工具
  registry.register(new GitHubTool());

  // 天气查询工具
  registry.register(new WeatherTool(options.weather || {}));

  // 翻译工具
  registry.register(new TranslationTool(options.translation || {}));

  // 代码审查工具
  registry.register(new CodeReviewTool(options.codeReview || {}));

  // 图片生成工具
  registry.register(new ImageGenerationTool(options.imageGeneration || {}));

  // 二维码生成工具
  registry.register(new QrCodeTool(options.qrCode || {}));

  // 货币转换工具
  registry.register(new CurrencyConverterTool(options.currency || {}));

  // URL缩短工具
  registry.register(new UrlShortenerTool(options.urlShortener || {}));

  // 时区转换工具
  registry.register(new TimezoneConverterTool(options.timezone || {}));

  // 文本摘要工具
  registry.register(new TextSummaryTool(options.textSummary || {}));

  // 错误跟踪工具
  registry.register(new ErrorTrackingTool(options.errorTracking || {}));

  // 笔记工具
  registry.register(new NoteTool(options.note || {}));

  // 提示词模板工具
  registry.register(new PromptTemplateTool(options.promptTemplate || {}));

  // 日程管理工具
  registry.register(new MeetingTool(options.meeting || {}));

  return registry;
}

/**
 * 工具分类
 */
const TOOL_CATEGORIES = {
  filesystem: {
    name: '文件系统',
    description: '文件读写、目录操作',
    tools: ['file_operations']
  },
  system: {
    name: '系统',
    description: '系统命令执行',
    tools: ['shell']
  },
  internet: {
    name: '网络',
    description: '网络请求和搜索',
    tools: ['web_search', 'http_request', 'web_scraper']
  },
  compute: {
    name: '计算',
    description: '代码执行和数学计算',
    tools: ['code_execution', 'calculator']
  },
  data: {
    name: '数据',
    description: '数据处理和转换',
    tools: ['data_processing']
  },
  utility: {
    name: '实用工具',
    description: '日期时间、货币、时区等实用工具',
    tools: ['datetime', 'currency_converter', 'timezone_converter', 'calculator', 'qrcode', 'url_shortener']
  },
  developer: {
    name: '开发者',
    description: '代码审查、GitHub、错误跟踪等开发工具',
    tools: ['github', 'code_review', 'error_tracking', 'prompt_template']
  },
  content: {
    name: '内容处理',
    description: '翻译、摘要、笔记等内容处理工具',
    tools: ['translation', 'text_summary', 'note']
  },
  communication: {
    name: '沟通协作',
    description: '日程管理等协作工具',
    tools: ['meeting']
  },
  multimodal: {
    name: '多模态',
    description: '图像生成等多模态工具',
    tools: ['image_generation']
  },
  finance: {
    name: '金融',
    description: '货币转换等金融工具',
    tools: ['currency_converter']
  },
  information: {
    name: '信息查询',
    description: '天气查询等信息查询工具',
    tools: ['weather']
  }
};

module.exports = {
  // 注册表
  ToolRegistry,

  // 工具类
  FileSystemTool,
  ShellTool,
  WebSearchTool,
  CodeExecutionTool,
  HttpRequestTool,
  DataProcessingTool,
  CalculatorTool,
  DateTimeTool,
  WebScraperTool,
  GitHubTool,
  EnhancedSearchTool,
  ReadmeTool,
  MiniMaxSearchTool,
  DuckDuckGoSearchTool,
  WeatherTool,
  TranslationTool,
  CodeReviewTool,
  ImageGenerationTool,
  QrCodeTool,
  CurrencyConverterTool,
  UrlShortenerTool,
  TimezoneConverterTool,
  TextSummaryTool,
  ErrorTrackingTool,
  NoteTool,
  PromptTemplateTool,
  MeetingTool,

  // 工厂函数
  createDefaultToolRegistry,

  // 分类信息
  TOOL_CATEGORIES
};