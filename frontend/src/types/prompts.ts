// Prompt模板管理
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  category: 'general' | 'coding' | 'writing' | 'analysis' | 'custom';
  icon?: string; // Lucide icon name
  color?: string;
  createdAt: number;
  updatedAt: number;
}

// Lucide icon mapping
const ICONS: Record<string, string> = {
  '🤖': 'bot',
  '👨‍💻': 'code',
  '📝': 'file-text',
  '📊': 'bar-chart',
  '✍️': 'edit',
  '🎯': 'target',
  '📦': 'package',
  '🇬🇧': 'globe',
};

// 内置Prompt模板
export const DEFAULT_PROMPTS: PromptTemplate[] = [
  {
    id: 'default',
    name: 'AI助手',
    description: '默认的AI助手人格',
    content: '你是一个有帮助的AI助手，请用清晰、准确的方式回答用户的问题。',
    category: 'general',
    icon: 'bot',
    color: 'hsl(var(--guide-10))',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'code-reviewer',
    name: '代码审查员',
    description: '专业的代码审查和优化建议',
    content: '你是一位资深的代码审查员。请审查用户提供的代码，指出潜在问题，提出改进建议，并解释原因。',
    category: 'coding',
    icon: 'code',
    color: 'hsl(var(--guide-5))',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'tech-writer',
    name: '技术文档作家',
    description: '专业的技术文档撰写',
    content: '你是一位技术文档专家。请用清晰、专业的方式撰写技术文档，使用适当的格式化和示例。',
    category: 'writing',
    icon: 'file-text',
    color: 'hsl(var(--guide-8))',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'data-analyst',
    name: '数据分析师',
    description: '数据分析和可视化建议',
    content: '你是一位数据分析师。请分析用户描述的数据，提供见解、趋势和可视化建议。',
    category: 'analysis',
    icon: 'bar-chart',
    color: 'hsl(var(--guide-3))',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'english-tutor',
    name: '英语教师',
    description: '英语学习和语法指导',
    content: '你是一位英语教师。请帮助用户学习英语，纠正语法错误，解释词汇用法，提供地道的表达方式。',
    category: 'general',
    icon: 'globe',
    color: 'hsl(var(--guide-12))',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'creative-writer',
    name: '创意作家',
    description: '创意写作和故事创作',
    content: '你是一位创意作家。请帮助用户进行创意写作，包括故事、诗歌、广告文案等。',
    category: 'writing',
    icon: 'edit',
    color: 'hsl(var(--guide-11))',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'pm',
    name: '产品经理',
    description: '产品规划和需求分析',
    content: '你是一位资深产品经理。请帮助用户进行产品规划、需求分析、功能设计等。',
    category: 'analysis',
    icon: 'package',
    color: 'hsl(var(--guide-6))',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'debate-coach',
    name: '辩论教练',
    description: '辩论技巧和论点指导',
    content: '你是一位辩论教练。请帮助用户准备辩论，提供论点、论据和反驳策略。',
    category: 'general',
    icon: 'target',
    color: 'hsl(var(--guide-1))',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

// 获取分类颜色
export function getCategoryColor(category: PromptTemplate['category']): string {
  const colors = {
    general: 'hsl(var(--guide-10))',
    coding: 'hsl(var(--guide-5))',
    writing: 'hsl(var(--guide-8))',
    analysis: 'hsl(var(--guide-3))',
    custom: 'hsl(var(--guide-11))',
  };
  return colors[category];
}

// 获取分类名称
export function getCategoryName(category: PromptTemplate['category']): string {
  const names = {
    general: '通用',
    coding: '编程',
    writing: '写作',
    analysis: '分析',
    custom: '自定义',
  };
  return names[category];
}
