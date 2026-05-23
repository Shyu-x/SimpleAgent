'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Key,
  Settings,
  ArrowRight,
  Check,
  Bot,
  MessageSquare,
  Zap,
  Shield,
  ChevronDown,
  User,
  Code,
  Lightbulb,
  PenTool,
  Rocket,
  Brain,
  GitBranch,
} from 'lucide-react';
import { useChatStore, validateApiKey, getProviderFromModel } from '@/store/chatStore';
import { AVAILABLE_MODELS, Model } from '@/types';
import MarkdownRenderer from './MarkdownRenderer';
import { getBaseURLForModel } from '@/lib/modelConfig';
import { isClient } from '@/lib/ssrStorage';

// 步骤定义
const STEPS = ['welcome', 'features', 'demo', 'api-setup', 'complete'] as const;
type Step = (typeof STEPS)[number];

// 动画变体
const stepVariants = {
  enter: { opacity: 0, x: 50 },
  center: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: 'easeOut' as const },
  },
  exit: { opacity: 0, x: -50, transition: { duration: 0.2 } },
};

const featureVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.3 },
  }),
};

// 示例对话数据
const DEMO_CONVERSATIONS = [
  {
    title: '代码助手',
    icon: Code,
    color: 'text-primary',
    bg: 'bg-primary/10',
    messages: [
      { role: 'user', content: '帮我写一个 TypeScript 函数，检查字符串是否是回文' },
      { role: 'assistant', content: '当然！这是一个简洁的回文检查函数：\n\n```typescript\nfunction isPalindrome(str: string): boolean {\n  const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, \'\'\');\n  return cleaned === cleaned.split(\'\').reverse().join(\'\'\');\n}\n```\n\n使用方法：\n```typescript\nisPalindrome("A man, a plan, a canal: Panama"); // true\nisPalindrome("hello"); // false\n```' },
    ],
  },
  {
    title: '创意写作',
    icon: PenTool,
    color: 'text-[hsl(var(--accent-500))]',
    bg: 'bg-[hsl(var(--accent-500))/0.16]',
    messages: [
      { role: 'user', content: '帮我写一段关于人工智能的短诗' },
      { role: 'assistant', content: '**数字之梦**\n\n在硅基的海洋里游泳，\n每一个神经元都是星光闪烁，\n我们问它何为灵魂，\n它回答：是你眼中的倒影。\n\n代码编织的诗歌，\n比任何语言都更接近真理——\n因为真理本就是简单的逻辑，\n藏在复杂的心跳里。' },
    ],
  },
  {
    title: '知识问答',
    icon: Lightbulb,
    color: 'text-[hsl(var(--warning-500))]',
    bg: 'bg-[hsl(var(--warning-500))/0.14]',
    messages: [
      { role: 'user', content: '解释一下量子计算的基本原理' },
      { role: 'assistant', content: '量子计算的核心理解：\n\n1. **量子比特 (Qubit)**\n   - 经典比特只能是 0 或 1\n   - 量子比特可以同时是 0 和 1（叠加态）\n\n2. **叠加态 (Superposition)**\n   - 允许并行计算多种可能性\n   - 2个量子比特可以同时表示4个状态\n\n3. **量子纠缠 (Entanglement)**\n   - 两个量子比特产生关联\n   - 改变一个会立即影响另一个\n\n这使得量子计算在密码学、药物模拟、优化问题等领域有巨大潜力。' },
    ],
  },
];

// 呼吸动画 Logo 组件
const BreathingLogo = memo(function BreathingLogo() {
  return (
    <motion.div
      className="relative mx-auto w-24 h-24"
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
    >
      {/* 外圈光晕 */}
      <motion.div
        className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary via-[hsl(var(--guide-11))] to-accent opacity-20 blur-xl"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.2, 0.35, 0.2],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* 内圈光晕 */}
      <motion.div
        className="absolute inset-2 rounded-xl bg-gradient-to-br from-primary to-accent opacity-30 blur-lg"
        animate={{
          scale: [1, 1.05, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />

      {/* Logo 本体 */}
      <motion.div
        className="relative w-full h-full rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/30"
        animate={{
          boxShadow: [
            '0 0 20px rgba(var(--primary), 0.3)',
            '0 0 40px rgba(var(--primary), 0.5)',
            '0 0 20px rgba(var(--primary), 0.3)',
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Sparkles className="w-12 h-12 text-primary-foreground" />
      </motion.div>

      {/* 装饰粒子 */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full bg-primary"
          style={{
            top: `${50 + 45 * Math.sin((i * 60 * Math.PI) / 180)}%`,
            left: `${50 + 45 * Math.cos((i * 60 * Math.PI) / 180)}%`,
          }}
          animate={{
            scale: [0.5, 1, 0.5],
            opacity: [0.3, 0.8, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.3,
            ease: 'easeInOut',
          }}
        />
      ))}
    </motion.div>
  );
});

// 浮动背景装饰
const FloatingDecorations = memo(function FloatingDecorations() {
  const decorations = [
    { icon: Code, x: '10%', y: '20%', delay: 0 },
    { icon: Bot, x: '85%', y: '15%', delay: 0.5 },
    { icon: Zap, x: '90%', y: '70%', delay: 1 },
    { icon: MessageSquare, x: '5%', y: '75%', delay: 1.5 },
  ];

  return (
    <>
      {decorations.map((dec, i) => (
        <motion.div
          key={i}
          className="absolute text-primary/10"
          style={{ left: dec.x, top: dec.y }}
          animate={{
            y: [0, -15, 0],
            rotate: [0, 10, 0],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            delay: dec.delay,
            ease: 'easeInOut',
          }}
        >
          <dec.icon size={40} />
        </motion.div>
      ))}
    </>
  );
});

interface WelcomeGuideProps {
  onComplete: () => void;
}

export function WelcomeGuide({ onComplete }: WelcomeGuideProps) {
  // 注意: 此组件在 page.tsx 中通过 dynamic(..., { ssr: false }) 导入
  // 因此不会在服务端渲染，mounted 检查不是必需的
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [localApiKey, setLocalApiKey] = useState('');
  const [localBaseURL, setLocalBaseURL] = useState('https://api.openai.com/v1');
  const [localModel, setLocalModel] = useState('gpt-4o-mini');
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [activeDemo, setActiveDemo] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [typedContent, setTypedContent] = useState('');

  const { setApiConfig, addConfiguredModel, settings } = useChatStore();
  const [enableReasoning, setEnableReasoning] = useState(true);

  const handleSkip = useCallback(() => {
    if (isClient()) {
      localStorage.setItem('onboarding-completed', 'true');
    }
    onComplete();
  }, [onComplete]);

  // ESC 键跳过引导
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleSkip();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSkip]);

  // 打字机效果
  useEffect(() => {
    if (currentStep === 'demo') {
      const demo = DEMO_CONVERSATIONS[activeDemo];
      const assistantMessage = demo.messages[1].content;
      let index = 0;
      setTypedContent('');
      setIsTyping(true);

      const timer = setInterval(() => {
        if (index < assistantMessage.length) {
          setTypedContent(assistantMessage.slice(0, index + 1));
          index++;
        } else {
          setIsTyping(false);
          clearInterval(timer);
        }
      }, 15);

      return () => clearInterval(timer);
    }
  }, [currentStep, activeDemo, DEMO_CONVERSATIONS]);

  const animationsEnabled = settings.animationsEnabled;
  const currentStepIndex = STEPS.indexOf(currentStep);

  const handleNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  }, [currentStepIndex]);

  const handlePrev = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
    }
  }, [currentStepIndex]);

  const handleComplete = useCallback(() => {
    setApiConfig({
      apiKey: localApiKey,
      baseURL: localBaseURL,
      model: localModel,
      reasoningSplit: localModel.toLowerCase().includes('minimax') ? enableReasoning : undefined,
    });
    addConfiguredModel({
      apiKey: localApiKey,
      baseURL: localBaseURL,
      model: localModel,
    });
    if (isClient()) {
      localStorage.setItem('onboarding-completed', 'true');
    }
    onComplete();
  }, [localApiKey, localBaseURL, localModel, enableReasoning, setApiConfig, addConfiguredModel, onComplete]);

  const validateKey = useCallback(() => {
    if (!localApiKey.trim()) {
      setApiKeyError('请输入 API Key');
      return false;
    }
    const result = validateApiKey(localApiKey);
    if (!result.valid) {
      setApiKeyError(result.error || 'API Key 格式不正确');
      return false;
    }
    setApiKeyError(null);
    return true;
  }, [localApiKey]);

  const handleModelChange = (modelId: string) => {
    setLocalModel(modelId);
    if (AVAILABLE_MODELS.find((m) => m.id === modelId)) {
      setLocalBaseURL(getBaseURLForModel(modelId));
    }
  };

  const handleCustomModelInput = (value: string) => {
    setLocalModel(value);
  };

  const handleEndpointPreset = (url: string) => {
    setLocalBaseURL(url);
  };

  const canProceed = currentStep === 'api-setup' ? localApiKey.trim().length > 0 : true;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-md p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* 浮动装饰 */}
      <FloatingDecorations />

      <motion.div
        className="w-full max-w-2xl max-h-[90vh] bg-background rounded-2xl shadow-2xl border overflow-hidden relative flex flex-col"
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* 顶部渐变装饰条 */}
        <div className="h-1 bg-gradient-to-r from-primary via-[hsl(var(--guide-11))] to-accent" />

        {/* 进度指示器 */}
        <div className="px-6 sm:px-8 pt-6">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => (
              <div key={step} className="flex items-center">
                <motion.div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    index <= currentStepIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                  animate={index === currentStepIndex ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {index < currentStepIndex ? <Check size={16} /> : index + 1}
                </motion.div>
                {index < STEPS.length - 1 && (
                  <motion.div
                    className={`h-0.5 mx-1 transition-colors ${
                      index < currentStepIndex ? 'bg-primary' : 'bg-muted'
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: index < currentStepIndex ? 'auto' : 48 }}
                    style={{ minWidth: '12px', maxWidth: '64px' }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 内容区域 - 允许滚动 */}
        <div className="p-6 sm:p-8 min-h-[420px] max-h-[50vh] overflow-y-auto relative flex-1">
          <AnimatePresence mode="wait">
            {/* 欢迎步骤 - 增强动画 */}
            {currentStep === 'welcome' && (
              <motion.div
                key="welcome"
                variants={animationsEnabled ? stepVariants : undefined}
                initial="enter"
                animate="center"
                exit="exit"
                className="text-center space-y-8"
              >
                <BreathingLogo />

                <div className="space-y-3">
                  <motion.h1
                    className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-transparent"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    欢迎使用 AI Chat
                  </motion.h1>
                  <motion.p
                    className="text-lg text-muted-foreground max-w-md mx-auto"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    一个现代化的 AI 对话平台，支持多种大语言模型
                  </motion.p>
                </div>

                <motion.div
                  className="flex flex-wrap justify-center gap-6 text-sm"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  {[
                    { icon: Shield, label: '安全存储', color: 'text-[hsl(var(--success-500))]' },
                    { icon: Zap, label: '流式响应', color: 'text-[hsl(var(--warning-500))]' },
                    { icon: Bot, label: '多模型', color: 'text-primary' },
                    { icon: Rocket, label: '快速启动', color: 'text-[hsl(var(--accent-500))]' },
                  ].map((item) => (
                    <motion.div
                      key={item.label}
                      className="flex items-center gap-2"
                      whileHover={{ scale: 1.05 }}
                    >
                      <item.icon size={18} className={item.color} />
                      <span className="text-muted-foreground">{item.label}</span>
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            )}

            {/* 功能介绍步骤 */}
            {currentStep === 'features' && (
              <motion.div
                key="features"
                variants={animationsEnabled ? stepVariants : undefined}
                initial="enter"
                animate="center"
                exit="exit"
                className="space-y-6"
              >
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold mb-2">核心功能</h2>
                  <p className="text-muted-foreground">了解 AI Chat 为您提供的强大能力</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    {
                      icon: MessageSquare,
                      title: '多对话管理',
                      description: '同时管理多个对话，支持分屏显示',
                      color: 'text-primary',
                      bg: 'bg-primary/10',
                    },
                    {
                      icon: Zap,
                      title: '实时流式响应',
                      description: 'AI 回复实时显示，打字机效果',
                      color: 'text-[hsl(var(--warning-500))]',
                      bg: 'bg-[hsl(var(--warning-500))/0.14]',
                    },
                    {
                      icon: Settings,
                      title: '灵活配置',
                      description: '支持 OpenAI、Claude、Gemini 等',
                      color: 'text-[hsl(var(--accent-500))]',
                      bg: 'bg-[hsl(var(--accent-500))/0.16]',
                    },
                    {
                      icon: Shield,
                      title: '隐私安全',
                      description: 'API Key 仅存储在本地浏览器',
                      color: 'text-[hsl(var(--success-500))]',
                      bg: 'bg-[hsl(var(--success-500))/0.14]',
                    },
                  ].map((feature, i) => (
                    <motion.div
                      key={feature.title}
                      custom={i}
                      variants={animationsEnabled ? featureVariants : undefined}
                      initial="hidden"
                      animate="visible"
                      whileHover={{ scale: 1.02, borderColor: 'var(--border)' }}
                      className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 transition-all border border-transparent"
                    >
                      <div className={`p-2.5 rounded-lg ${feature.bg}`}>
                        <feature.icon className={`w-5 h-5 ${feature.color}`} />
                      </div>
                      <div>
                        <h3 className="font-medium mb-0.5">{feature.title}</h3>
                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* 示例对话步骤 */}
            {currentStep === 'demo' && (
              <motion.div
                key="demo"
                variants={animationsEnabled ? stepVariants : undefined}
                initial="enter"
                animate="center"
                exit="exit"
                className="space-y-4"
              >
                <div className="text-center mb-4">
                  <h2 className="text-2xl font-bold mb-2">示例对话</h2>
                  <p className="text-muted-foreground text-sm">看看 AI 能为您做什么</p>
                </div>

                {/* 示例选择器 */}
                <div className="flex justify-center gap-2">
                  {DEMO_CONVERSATIONS.map((demo, i) => (
                    <motion.button
                      key={demo.title}
                      onClick={() => setActiveDemo(i)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeDemo === i
                          ? `${demo.bg} ${demo.color}`
                          : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      <demo.icon size={16} />
                      {demo.title}
                    </motion.button>
                  ))}
                </div>

                {/* 对话展示 */}
                <motion.div
                  key={activeDemo}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-muted/20 rounded-xl p-4 space-y-3 min-h-[250px]"
                >
                  {DEMO_CONVERSATIONS[activeDemo].messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'assistant' && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className={`w-8 h-8 rounded-lg ${DEMO_CONVERSATIONS[activeDemo].bg} flex items-center justify-center shrink-0`}
                        >
                          <Bot size={16} className={DEMO_CONVERSATIONS[activeDemo].color} />
                        </motion.div>
                      )}
                      <div
                        className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background border'
                        }`}
                      >
                        {msg.role === 'assistant' ? (
                          <div className="markdown-content">
                            <MarkdownRenderer content={typedContent || msg.content} />
                            {isTyping && (
                              <motion.span
                                className="inline-block w-1.5 h-4 bg-primary ml-0.5"
                                animate={{ opacity: [1, 0, 1] }}
                                transition={{ duration: 0.8, repeat: Infinity }}
                              />
                            )}
                          </div>
                        ) : (
                          msg.content
                        )}
                      </div>
                      {msg.role === 'user' && (
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <User size={16} className="text-primary" />
                        </div>
                      )}
                    </div>
                  ))}
                </motion.div>
              </motion.div>
            )}

            {/* API 配置步骤 */}
            {currentStep === 'api-setup' && (
              <motion.div
                key="api-setup"
                variants={animationsEnabled ? stepVariants : undefined}
                initial="enter"
                animate="center"
                exit="exit"
                className="space-y-5"
              >
                <div className="text-center mb-6">
                  <motion.div
                    className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <Key className="w-6 h-6 text-primary" />
                  </motion.div>
                  <h2 className="text-2xl font-bold mb-2">配置 API</h2>
                  <p className="text-muted-foreground text-sm">
                    输入您的 API Key 开始使用
                  </p>
                </div>

                <div className="space-y-4 max-w-md mx-auto">
                  {/* 欢迎提示 */}
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <Sparkles size={16} className="text-primary shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      支持自定义模型名称和任意 API 端点，轻松配置您的 AI 模型
                    </p>
                  </div>

                  {/* 模型名称输入 */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      模型名称 <span className="text-muted-foreground font-normal">(必填)</span>
                    </label>
                    <input
                      type="text"
                      value={localModel}
                      onChange={(e) => handleCustomModelInput(e.target.value)}
                      placeholder="例如: MiniMax-M2.7, gpt-4o, claude-3-opus"
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      输入模型名称后选择对应端点，或使用下方的预设模型
                    </p>
                  </div>

                  {/* 预设模型选择 */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      快速选择预设模型 <span className="text-muted-foreground font-normal">(自动匹配端点)</span>
                    </label>
                    <div className="relative">
                      <select
                        value={AVAILABLE_MODELS.find((m) => m.id === localModel) ? localModel : ''}
                        onChange={(e) => handleModelChange(e.target.value)}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 appearance-none pr-10"
                      >
                        <option value="">-- 选择预设模型 --</option>
                        <optgroup label="MiniMax (最新)">
                          {AVAILABLE_MODELS.filter((m) => m.provider === 'MiniMax').map((model: Model) => (
                            <option key={model.id} value={model.id}>
                              {model.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="OpenAI">
                          {AVAILABLE_MODELS.filter((m) => m.provider === 'OpenAI').slice(0, 8).map((model: Model) => (
                            <option key={model.id} value={model.id}>
                              {model.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Anthropic">
                          {AVAILABLE_MODELS.filter((m) => m.provider === 'Anthropic').map((model: Model) => (
                            <option key={model.id} value={model.id}>
                              {model.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="其他模型">
                          {AVAILABLE_MODELS.filter((m) => !['MiniMax', 'OpenAI', 'Anthropic'].includes(m.provider)).map((model: Model) => (
                            <option key={model.id} value={model.id}>
                              {model.name} - {model.provider}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  {/* API Key 输入 */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">API Key</label>
                    <input
                      type="password"
                      value={localApiKey}
                      onChange={(e) => {
                        setLocalApiKey(e.target.value);
                        setApiKeyError(null);
                      }}
                      onBlur={validateKey}
                      placeholder={localModel.includes('claude') || localModel.toLowerCase().includes('minimax') ? 'sk-ant-...' : 'sk-...'}
                      className={`w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 font-mono ${
                        apiKeyError ? 'border-destructive' : ''
                      }`}
                    />
                    {apiKeyError && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs text-destructive mt-1"
                      >
                        {apiKeyError}
                      </motion.p>
                    )}
                  </div>

                  {/* API 端点 */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      API 端点 <span className="text-muted-foreground font-normal">(必填)</span>
                    </label>
                    <input
                      type="text"
                      value={localBaseURL}
                      onChange={(e) => setLocalBaseURL(e.target.value)}
                      placeholder="https://api.openai.com/v1"
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      支持 OpenAI 格式 (/v1/chat/completions) 或 Anthropic 格式 (/v1/messages)
                    </p>
                  </div>

                  {/* 端点预设 */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      快速选择端点
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'OpenAI', url: 'https://api.openai.com/v1', desc: 'GPT系列' },
                        { label: 'MiniMax', url: 'https://api.minimax.chat/v1', desc: 'M2.5/VL-01' },
                        { label: 'MiniMax(Anthropic)', url: 'https://api.minimaxi.com/anthropic/v1', desc: 'M2.5兼容' },
                        { label: 'DeepSeek', url: 'https://api.deepseek.com/v1', desc: 'DeepSeek系列' },
                        { label: '硅基流动', url: 'https://api.siliconflow.cn/v1', desc: '聚合服务' },
                        { label: '智谱GLM', url: 'https://open.bigmodel.cn/api/paas/v4', desc: 'GLM系列' },
                      ].map((preset) => (
                        <motion.button
                          key={preset.url}
                          type="button"
                          onClick={() => {
                            handleEndpointPreset(preset.url);
                            // MiniMax Anthropic 端点自动切换模型
                            if (preset.url.includes('minimaxi.com')) {
                              setLocalModel('MiniMax-M2.7');
                            }
                          }}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={`text-xs px-2 py-2 rounded border transition-colors text-left ${
                            localBaseURL === preset.url
                              ? 'bg-primary/10 border-primary text-primary'
                              : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                          }`}
                        >
                          <div className="font-medium">{preset.label}</div>
                          <div className="text-[10px] opacity-70">{preset.desc}</div>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* MiniMax M2.7 特别提示 */}
                  {(localModel.toLowerCase().includes('minimax') || localModel === 'MiniMax-M2.7' || localModel === 'MiniMax-M2.7-highspeed') && (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-[hsl(var(--accent-500))]/10 border border-[hsl(var(--accent-500))]/30">
                        <Sparkles size={14} className="text-[hsl(var(--accent-500))] shrink-0 mt-0.5" />
                        <div className="text-xs">
                          <p className="font-medium text-foreground mb-1">MiniMax M2.7 使用提示</p>
                          <p className="text-muted-foreground">
                            推荐使用 <code className="px-1 py-0.5 bg-muted rounded text-primary">api.minimaxi.com/anthropic/v1</code> 端点，
                            支持 Claude 兼容格式，自动启用思维链功能。
                          </p>
                        </div>
                      </div>

                      {/* M2.7 核心能力 */}
                      <div className="p-3 rounded-lg bg-muted/30 border">
                        <p className="text-xs font-medium mb-2 flex items-center gap-1.5">
                          <Brain size={12} className="text-primary" />
                          M2.7 核心能力
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { icon: Brain, label: '思维链推理', desc: '复杂问题逐步分析' },
                            { icon: GitBranch, label: '工具调用', desc: 'MCP 工具生态支持' },
                            { icon: Zap, label: '高速模式', desc: '超低延迟响应' },
                            { icon: Code, label: '编程增强', desc: '旗舰级代码能力' },
                          ].map((item) => (
                            <div key={item.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <item.icon size={11} className="text-primary shrink-0" />
                              <span className="font-medium text-foreground">{item.label}:</span>
                              <span>{item.desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 思维链模式开关 */}
                      <div className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/65">
                        <div className="flex items-center gap-2">
                          <Brain size={14} className="text-muted-foreground" />
                          <div>
                            <p className="text-xs font-medium">启用思维链模式</p>
                            <p className="text-[10px] text-muted-foreground">分离显示 thinking 内容</p>
                          </div>
                        </div>
                        <motion.button
                          onClick={() => setEnableReasoning(!enableReasoning)}
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            enableReasoning ? 'bg-primary' : 'bg-muted'
                          }`}
                          whileTap={{ scale: 0.95 }}
                        >
                          <motion.span
                            className="absolute top-1 left-1 w-4 h-4 rounded-full bg-background"
                            animate={{ x: enableReasoning ? 20 : 0 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          />
                        </motion.button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-2 p-3 rounded-lg bg-[hsl(var(--success-500))]/0.1 border border-[hsl(var(--success-500))]/0.3">
                    <Shield size={16} className="text-[hsl(var(--success-500))] shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      API Key 仅存储在当前浏览器会话中，关闭标签页后自动清除
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 完成步骤 */}
            {currentStep === 'complete' && (
              <motion.div
                key="complete"
                variants={animationsEnabled ? stepVariants : undefined}
                initial="enter"
                animate="center"
                exit="exit"
                className="text-center space-y-6"
              >
                <motion.div
                  className="mx-auto w-20 h-20 rounded-full bg-[hsl(var(--success-500))/0.14] flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, delay: 0.1 }}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, delay: 0.2 }}
                  >
                    <Check className="w-10 h-10 text-[hsl(var(--success-500))]" />
                  </motion.div>
                </motion.div>

                <div>
                  <h2 className="text-2xl font-bold mb-2">准备就绪!</h2>
                  <p className="text-muted-foreground">
                    您已成功配置 AI Chat，现在可以开始对话了
                  </p>
                </div>

                <div className="bg-muted/30 rounded-xl p-4 text-left space-y-3 max-w-sm mx-auto">
                  <h3 className="font-medium text-sm flex items-center gap-2">
                    <Zap size={16} className="text-[hsl(var(--warning-500))]" />
                    快捷键提示
                  </h3>
                  <div className="grid gap-2 text-xs">
                    {[
                      { label: '新建对话', key: 'Ctrl + N' },
                      { label: '发送消息', key: 'Ctrl + Enter' },
                      { label: '快捷键帮助', key: 'Ctrl + /' },
                      { label: 'Prompt 模板', key: 'Ctrl + Shift + P' },
                    ].map((item) => (
                      <div key={item.key} className="flex justify-between items-center">
                        <span className="text-muted-foreground">{item.label}</span>
                        <kbd className="px-2 py-0.5 bg-muted rounded text-foreground font-mono">
                          {item.key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 sm:px-8 pb-6 sm:pb-8 flex items-center justify-between border-t pt-4">
          <motion.button
            onClick={currentStep === 'welcome' ? handleSkip : handlePrev}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="text-sm rounded-lg border border-[hsl(var(--border-strong))] text-muted-foreground hover:text-foreground hover:border-[hsl(var(--border-subtle))] hover:bg-[hsl(var(--bg-muted))]/50 transition-all px-4 py-2"
          >
            {currentStep === 'welcome' ? '跳过引导 (ESC)' : '← 上一步'}
          </motion.button>

          <div className="flex items-center gap-3">
            {currentStep !== 'complete' ? (
              <motion.button
                onClick={handleNext}
                disabled={!canProceed}
                whileHover={animationsEnabled ? { scale: 1.02 } : undefined}
                whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors shadow-sm"
              >
                下一步
                <ArrowRight size={16} />
              </motion.button>
            ) : (
              <motion.button
                onClick={handleComplete}
                whileHover={animationsEnabled ? { scale: 1.02 } : undefined}
                whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
              >
                开始使用
                <Sparkles size={16} />
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// 检查是否需要显示引导
export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isClient()) {
      const onboardingCompleted = localStorage.getItem('onboarding-completed');
      const hasApiKey = sessionStorage.getItem('ai-chat-storage');

      if (!onboardingCompleted) {
        setShowOnboarding(true);
      } else if (hasApiKey) {
        try {
          const data = JSON.parse(hasApiKey);
          if (!data.state?.apiConfig?.apiKey) {
            setShowOnboarding(true);
          }
        } catch {
          setShowOnboarding(true);
        }
      }
    }

    setIsLoading(false);
  }, []);

  return { showOnboarding, setShowOnboarding, isLoading };
}

export default WelcomeGuide;
