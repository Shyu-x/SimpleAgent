'use client';

import { useState } from 'react';
import { PromptTemplate, DEFAULT_PROMPTS, getCategoryColor, getCategoryName } from '@/types/prompts';
import { useChatStore } from '@/store/chatStore';
import { useToast } from './Toast';
import {
  MessageSquare,
  X,
  Search,
  Plus,
  Trash2,
  Sparkles,
  Check,
  Bot,
  Code,
  FileText,
  BarChart3,
  Globe,
  Edit,
  Package,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Icon mapping for prompt templates
const iconMap: Record<string, LucideIcon> = {
  'bot': Bot,
  'code': Code,
  'file-text': FileText,
  'bar-chart': BarChart3,
  'globe': Globe,
  'edit': Edit,
  'package': Package,
  'target': Target,
  'sparkles': Sparkles,
};

// Get icon component from icon name
function getIconComponent(iconName: string | undefined): LucideIcon {
  if (!iconName) return MessageSquare;
  return iconMap[iconName] || MessageSquare;
}

interface PromptSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

// 模态框动画变体
const modalVariants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
    y: 20,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    y: 20,
    transition: {
      duration: 0.2,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: index * 0.05,
      duration: 0.2,
      ease: 'easeOut' as const,
    },
  }),
} as const;

export default function PromptSelector({ isOpen, onClose }: PromptSelectorProps) {
  const {
    settings,
    customPrompts,
    addCustomPrompt,
    deleteCustomPrompt,
  } = useChatStore();
  const animationsEnabled = settings.animationsEnabled;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PromptTemplate['category'] | 'all'>('all');
  const [isCreating, setIsCreating] = useState(false);
  const [newPromptName, setNewPromptName] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');
  const [newPromptCategory, setNewPromptCategory] = useState<PromptTemplate['category']>('custom');

  const { showToast } = useToast();

  // 合并内置和自定义prompts
  const allPrompts = [...DEFAULT_PROMPTS, ...customPrompts];

  // 过滤prompts
  const filteredPrompts = allPrompts.filter((prompt) => {
    const matchesSearch =
      prompt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prompt.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prompt.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || prompt.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories: Array<PromptTemplate['category'] | 'all'> = [
    'all',
    'general',
    'coding',
    'writing',
    'analysis',
    'custom',
  ];

  const handleSelectPrompt = (prompt: PromptTemplate) => {
    // 将prompt作为系统消息添加到当前对话
    const { activeConversationId, addMessage } = useChatStore.getState();
    if (activeConversationId) {
      addMessage(activeConversationId, {
        id: `sys_${Date.now()}`,
        role: 'system',
        content: prompt.content,
        createdAt: Date.now(),
      });
      showToast(`已应用: ${prompt.name}`, 'success');
      onClose();
    }
  };

  const handleCreatePrompt = () => {
    if (!newPromptName.trim() || !newPromptContent.trim()) {
      showToast('请填写名称和内容', 'error');
      return;
    }

    addCustomPrompt({
      name: newPromptName.trim(),
      description: '自定义Prompt',
      content: newPromptContent.trim(),
      category: newPromptCategory,
      icon: 'sparkles',
      color: getCategoryColor(newPromptCategory),
    });
    setNewPromptName('');
    setNewPromptContent('');
    setIsCreating(false);
    showToast('Prompt已创建', 'success');
  };

  const handleDeletePrompt = (id: string) => {
    deleteCustomPrompt(id);
    showToast('Prompt已删除', 'success');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
          initial={animationsEnabled ? { opacity: 0 } : undefined}
          animate={animationsEnabled ? { opacity: 1 } : undefined}
          exit={animationsEnabled ? { opacity: 0 } : undefined}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-2xl max-h-[80vh] rounded-2xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/98 p-4 sm:p-6 shadow-2xl backdrop-blur-xl"
            variants={animationsEnabled ? modalVariants : undefined}
            initial={animationsEnabled ? 'hidden' : undefined}
            animate={animationsEnabled ? 'visible' : undefined}
            exit={animationsEnabled ? 'exit' : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <motion.div
                className="flex items-center gap gap-2"
                initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                animate={animationsEnabled ? { opacity: 1, x: 0 } : undefined}
                transition={{ delay: 0.1 }}
              >
                <Sparkles className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">选择Prompt模板</h2>
              </motion.div>
              <motion.button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                whileHover={animationsEnabled ? { scale: 1.1, rotate: 90 } : undefined}
                whileTap={animationsEnabled ? { scale: 0.9 } : undefined}
              >
                <X size={18} />
              </motion.button>
            </div>

            {/* Search */}
            <motion.div
              className="relative mb-4"
              initial={animationsEnabled ? { opacity: 0, y: -10 } : undefined}
              animate={animationsEnabled ? { opacity: 1, y: 0 } : undefined}
              transition={{ delay: 0.15 }}
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索Prompt..."
                className="w-full rounded-md border bg-background pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </motion.div>

            {/* Category tabs */}
            <motion.div
              className="flex gap-2 mb-4 overflow-x-auto pb-2"
              initial={animationsEnabled ? { opacity: 0 } : undefined}
              animate={animationsEnabled ? { opacity: 1 } : undefined}
              transition={{ delay: 0.2 }}
            >
              {categories.map((category, index) => (
                <motion.button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === category
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                  whileHover={animationsEnabled ? { y: -2 } : undefined}
                  whileTap={animationsEnabled ? { scale: 0.95 } : undefined}
                  initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
                  animate={animationsEnabled ? { opacity: 1, y: 0 } : undefined}
                  transition={{ delay: 0.2 + index * 0.03 }}
                >
                  {category === 'all' ? '全部' : getCategoryName(category)}
                </motion.button>
              ))}
            </motion.div>

            {/* Create new prompt */}
            <AnimatePresence mode="wait">
              {isCreating ? (
                <motion.div
                  key="create"
                  className="mb-4 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/75 p-4"
                  initial={animationsEnabled ? { opacity: 0, height: 0 } : undefined}
                  animate={animationsEnabled ? { opacity: 1, height: 'auto' } : undefined}
                  exit={animationsEnabled ? { opacity: 0, height: 0 } : undefined}
                  transition={{ duration: 0.2 }}
                >
                  <h3 className="font-medium mb-3">创建新Prompt</h3>
                  <input
                    type="text"
                    value={newPromptName}
                    onChange={(e) => setNewPromptName(e.target.value)}
                    placeholder="Prompt名称"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm mb-2 outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <textarea
                    value={newPromptContent}
                    onChange={(e) => setNewPromptContent(e.target.value)}
                    placeholder="Prompt内容..."
                    rows={3}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm mb-2 outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  />
                  <select
                    value={newPromptCategory}
                    onChange={(e) => setNewPromptCategory(e.target.value as PromptTemplate['category'])}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm mb-3 outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="general">通用</option>
                    <option value="coding">编程</option>
                    <option value="writing">写作</option>
                    <option value="analysis">分析</option>
                    <option value="custom">自定义</option>
                  </select>
                  <div className="flex gap-2">
                    <motion.button
                      onClick={handleCreatePrompt}
                      className="flex-1 flex items-center justify-center gap-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
                      whileHover={animationsEnabled ? { scale: 1.02 } : undefined}
                      whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
                    >
                      <Check size={16} />
                      创建
                    </motion.button>
                    <motion.button
                      onClick={() => setIsCreating(false)}
                      className="px-4 py-2 bg-muted rounded-md text-sm hover:bg-muted/80"
                      whileHover={animationsEnabled ? { scale: 1.02 } : undefined}
                      whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
                    >
                      取消
                    </motion.button>
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  key="create-button"
                  onClick={() => setIsCreating(true)}
                  className="w-full mb-4 flex items-center justify-center gap-2 px-4 py-2 border border-dashed rounded-lg text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                  initial={animationsEnabled ? { opacity: 0, y: -10 } : undefined}
                  animate={animationsEnabled ? { opacity: 1, y: 0 } : undefined}
                  whileHover={animationsEnabled ? { y: -2 } : undefined}
                  whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
                >
                  <Plus size={16} />
                  创建新Prompt
                </motion.button>
              )}
            </AnimatePresence>

            {/* Prompt list */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {filteredPrompts.map((prompt, index) => (
                <motion.div
                  key={prompt.id}
                  variants={animationsEnabled ? itemVariants : undefined}
                  initial={animationsEnabled ? 'hidden' : undefined}
                  animate={animationsEnabled ? 'visible' : undefined}
                  custom={index}
                  className="group cursor-pointer flex items-start gap-3 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/92 p-3 transition-all hover:border-primary/20 hover:bg-[hsl(var(--bg-surface))]"
                  onClick={() => handleSelectPrompt(prompt)}
                  whileHover={animationsEnabled ? { x: 4 } : undefined}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${prompt.color}20`, color: prompt.color }}
                  >
                    {(() => {
                      const IconComponent = getIconComponent(prompt.icon);
                      return <IconComponent size={20} />;
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm">{prompt.name}</h3>
                      <span
                        className="px-2 py-0.5 rounded-full text-xs"
                        style={{
                          backgroundColor: `${getCategoryColor(prompt.category)}20`,
                          color: getCategoryColor(prompt.category),
                        }}
                      >
                        {getCategoryName(prompt.category)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {prompt.description}
                    </p>
                  </div>
                  {prompt.id.startsWith('custom_') && (
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePrompt(prompt.id);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                      whileHover={animationsEnabled ? { scale: 1.1 } : undefined}
                      whileTap={animationsEnabled ? { scale: 0.9 } : undefined}
                    >
                      <Trash2 size={14} />
                    </motion.button>
                  )}
                </motion.div>
              ))}

              {filteredPrompts.length === 0 && (
                <motion.div
                  className="text-center py-8 text-muted-foreground"
                  initial={animationsEnabled ? { opacity: 0 } : undefined}
                  animate={animationsEnabled ? { opacity: 1 } : undefined}
                >
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">没有找到匹配的Prompt</p>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
