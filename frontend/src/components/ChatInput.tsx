'use client';

import { useState, useRef, useEffect, KeyboardEvent, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Send, Loader2, Mic, Image, X, Play, Square, Trash2, Check, ChevronDown, Sparkles, Settings, MessageSquare, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from './Toast';
import type { Attachment } from '@/types';
import { useChatStore } from '@/store/chatStore';
import { AVAILABLE_MODELS, Model, ConfiguredModel, getModelMaxTokens, DEFAULT_MAX_TOKENS } from '@/types';
import { DEFAULT_PROMPTS } from '@/types/prompts';
import { getBaseURLForModel, getProviderFromModel, getProviderFromBaseURL } from '@/lib/modelConfig';
import { detectIntent, type IntentResult } from '@/hooks/useIntentDetection';
import IntentSuggestionBanner from './IntentSuggestionBanner';

interface ChatInputProps {
  onSend: (message: string, attachments?: Attachment[]) => void;
  disabled?: boolean;
  compact?: boolean;
}

export interface ChatInputRef {
  setInputValue: (value: string) => void;
  focus: () => void;
}

const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(({ onSend, disabled, compact = false }, ref) => {
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const controlsRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const { apiConfig, setApiConfig, configuredModels, addConfiguredModel, settings, setSettings, customPrompts } = useChatStore();

  // Get current model name
  const currentModel = AVAILABLE_MODELS.find(m => m.id === apiConfig.model) || {
    id: apiConfig.model,
    name: apiConfig.model,
    provider: 'Custom'
  };

  // 获取当前模型支持的最大Token
  const currentModelMaxTokens = getModelMaxTokens(apiConfig.model);

  // Quick settings state - initialized after apiConfig
  const [localTemperature, setLocalTemperature] = useState(apiConfig.temperature ?? 0.7);
  const [localMaxTokens, setLocalMaxTokens] = useState(() => {
    // 优先使用已保存的值，否则使用模型最大值
    if (apiConfig.maxTokens) return Math.min(apiConfig.maxTokens, currentModelMaxTokens);
    return currentModelMaxTokens;
  });
  const [showQuickPhrases, setShowQuickPhrases] = useState(false);
  const [localTypingSpeed, setLocalTypingSpeed] = useState(settings.typingSpeed);
  const [customModelInput, setCustomModelInput] = useState('');

  // 意图检测状态
  const [detectedIntent, setDetectedIntent] = useState<IntentResult | null>(null);
  const [showIntentBanner, setShowIntentBanner] = useState(false);

  const quickPhrasePrompts = [...customPrompts, ...DEFAULT_PROMPTS].slice(0, 8);

  // Check if current model is a custom model (not in AVAILABLE_MODELS)
  const isCustomModel = !AVAILABLE_MODELS.find(m => m.id === apiConfig.model);

  // 检查API是否已配置 (有apiKey和有效的baseURL)
  const isApiConfigured = !!apiConfig.apiKey && !!apiConfig.baseURL;

  // 获取所有可用模型：已配置的模型列表 + 当前使用的模型
  const getAllAvailableModels = useCallback(() => {
    const result: Array<{ id: string; name: string; provider: string; isCustom?: boolean; config?: ConfiguredModel }> = [];

    // 添加所有已配置的模型
    configuredModels.forEach(config => {
      const exists = result.find(m => m.id === config.model && m.config?.baseURL === config.baseURL);
      if (!exists) {
        result.push({
          id: config.model,
          name: config.name || config.model,
          provider: config.provider || getProviderFromBaseURL(config.baseURL) || 'Custom',
          isCustom: true,
          config
        });
      }
    });

    // 确保当前使用的模型也在列表中
    const currentInList = result.find(m => m.id === apiConfig.model && m.config?.baseURL === apiConfig.baseURL);
    if (!currentInList && apiConfig.model) {
      result.push({
        id: apiConfig.model,
        name: apiConfig.model,
        provider: getProviderFromBaseURL(apiConfig.baseURL || '') || getProviderFromModel(apiConfig.model) || 'Custom',
        isCustom: true,
        config: {
          id: 'current',
          apiKey: apiConfig.apiKey,
          baseURL: apiConfig.baseURL,
          model: apiConfig.model,
          createdAt: Date.now()
        }
      });
    }

    return result;
  }, [configuredModels, apiConfig]);

  const allModels = getAllAvailableModels();

  // Handle model change from dropdown
  const handleModelChange = useCallback((model: { id: string; name: string; provider?: string; config?: ConfiguredModel }) => {
    if (model.config) {
      // 从已配置列表选择，使用其完整配置
      setApiConfig({
        model: model.config.model,
        baseURL: model.config.baseURL,
        apiKey: model.config.apiKey,
      });
    } else {
      // 从预设列表选择
      setApiConfig({
        model: model.id,
        baseURL: getBaseURLForModel(model.id),
      });
    }
    setShowModelSelector(false);
    showToast(`已切换到 ${model.name}`, 'success');
  }, [setApiConfig, showToast]);

  // Handle custom model input
  const handleCustomModelSubmit = useCallback(() => {
    if (!customModelInput.trim()) return;

    // 添加到已配置模型列表
    addConfiguredModel({
      apiKey: apiConfig.apiKey || '',
      baseURL: apiConfig.baseURL || '',
      model: customModelInput.trim(),
    });

    setApiConfig({
      model: customModelInput.trim(),
    });
    setShowModelSelector(false);
    setCustomModelInput('');
    showToast(`已添加并切换到: ${customModelInput.trim()}`, 'success');
  }, [customModelInput, apiConfig, addConfiguredModel, setApiConfig, showToast]);

  // Handle quick settings save
  const handleSaveQuickSettings = useCallback(() => {
    setApiConfig({
      temperature: localTemperature,
      maxTokens: localMaxTokens
    });
    setSettings({ typingSpeed: localTypingSpeed });
    setShowQuickSettings(false);
    showToast('设置已保存', 'success');
  }, [localTemperature, localMaxTokens, localTypingSpeed, setApiConfig, setSettings, showToast]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    setInputValue: (value: string) => {
      setInput(value);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    },
    focus: () => {
      textareaRef.current?.focus();
    },
  }), []);

  // Load draft from sessionStorage (more secure, cleared when tab closes)
  useEffect(() => {
    try {
      const draft = sessionStorage.getItem('chat-draft');
      if (draft && typeof draft === 'string') {
        setInput(draft);
      }
    } catch (e) {
      console.warn('Failed to load draft from sessionStorage:', e);
    }
  }, []);

  // Save draft to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('chat-draft', input);
  }, [input]);

  // Keyboard visibility detection for mobile
  useEffect(() => {
    const handleResize = () => {
      const visualViewport = window.visualViewport;
      if (visualViewport) {
        const isOpen = window.innerHeight - visualViewport.height > 100;
        setIsKeyboardOpen(isOpen);
      }
    };

    window.visualViewport?.addEventListener('resize', handleResize);
    return () => window.visualViewport?.removeEventListener('resize', handleResize);
  }, []);

  // 意图检测
  useEffect(() => {
    const timer = setTimeout(() => {
      if (input.trim().length >= 3) {
        const intent = detectIntent(input);
        // 仅在高置信度时显示提示
        if (intent.confidence >= 0.6 && intent.type !== 'conversation') {
          setDetectedIntent(intent);
          setShowIntentBanner(true);
        } else {
          setShowIntentBanner(false);
        }
      } else {
        setShowIntentBanner(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [input]);

  // Close floating menus when clicking outside ChatInput controls
  useEffect(() => {
    const handleDocumentPointerDown = (event: Event) => {
      if (!controlsRef.current) return;
      const eventPath = typeof (event as Event & { composedPath?: () => EventTarget[] }).composedPath === 'function'
        ? (event as Event & { composedPath: () => EventTarget[] }).composedPath()
        : [];
      const clickedInside = eventPath.length > 0
        ? eventPath.includes(controlsRef.current)
        : controlsRef.current.contains(event.target as Node);

      if (!clickedInside) {
        setShowModelSelector(false);
        setShowQuickPhrases(false);
        setShowQuickSettings(false);
      }
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    };
  }, []);

  // Get message history from store
  const getMessageHistory = useCallback((): string[] => {
    try {
      const stored = window.sessionStorage.getItem('ai-chat-storage');
      if (stored && typeof stored === 'string') {
        const data = JSON.parse(stored);
        const history: string[] = [];
        if (data.state?.conversations) {
          for (const conv of data.state.conversations) {
            for (const msg of conv.messages || []) {
              if (msg.role === 'user' && msg.content) {
                history.push(msg.content);
              }
            }
          }
        }
        return history.reverse();
      }
    } catch (e) {
      console.warn('Failed to parse message history:', e);
    }
    return [];
  }, []);

  const handleSend = useCallback(() => {
    if ((input.trim() || attachments.length > 0) && !disabled) {
      onSend(input.trim(), attachments.length > 0 ? attachments : undefined);
      setInput('');
      setAttachments([]);
      setHistoryIndex(-1);
      sessionStorage.removeItem('chat-draft');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [input, disabled, onSend, attachments]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    setHistoryIndex(-1);
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    const history = getMessageHistory();
    const currentIndex = history.findIndex((item) => item === input);

    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // Ctrl/Cmd + Enter - Send message
      e.preventDefault();
      handleSend();
    } else if (e.key === 'ArrowUp') {
      // Arrow Up - Previous history
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, history.length - 1);
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      // Arrow Down - Next history / exit history mode
      e.preventDefault();
      if (currentIndex > 0) {
        const newIndex = currentIndex - 1;
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      } else {
        setHistoryIndex(-1);
        setInput('');
      }
    } else if (e.key === 'Escape') {
      setShowModelSelector(false);
      setShowQuickPhrases(false);
      setShowQuickSettings(false);
    }
  }, [input, getMessageHistory, handleSend]);

  // 图片上传处理
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) {
        showToast('请上传图片文件', 'error');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        showToast('图片大小不能超过 10MB', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = e.target?.result as string;
        const newFile: Attachment = {
          id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          type: 'image',
          url: preview,
          size: file.size,
          preview,
        };
        setAttachments(prev => [...prev, newFile]);
        showToast('图片上传成功', 'success');
      };
      reader.readAsDataURL(file);
    });

    // 重置 input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [showToast]);

  // 移除附件
  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  // 语音录制处理
  const stopRecording = useCallback(() => {
    // 停止 MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    // 清理计时器
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingTime(0);
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioPreview(audioUrl);

        const newFile: Attachment = {
          id: `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: `语音_${new Date().toLocaleTimeString('zh-CN')}.webm`,
          type: 'audio',
          url: audioUrl,
          size: audioBlob.size,
          duration: recordingTime,
        };
        setAttachments(prev => [...prev, newFile]);
        showToast('语音录制完成', 'success');

        // 停止所有音轨
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // 计时器
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 60) {
            // 最多录制60秒
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      console.error('录音权限被拒绝:', err);
      showToast('请允许麦克风权限以使用语音输入', 'error');
    }
  }, [isRecording, recordingTime, showToast, stopRecording]);

  // 播放语音预览
  const togglePlayAudio = useCallback(() => {
    if (!audioPreview) return;
    const audio = new Audio(audioPreview);
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
      audio.onended = () => setIsPlaying(false);
    }
  }, [audioPreview, isPlaying]);

  // 取消语音录制
  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    setIsRecording(false);
    setRecordingTime(0);
    setAudioPreview(null);
  }, []);

  // 格式化录制时间
  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`chat-input-container transition-all duration-300 ease-out ${
        compact
          ? 'rounded-2xl bg-transparent p-0 pb-[calc(env(safe-area-inset-bottom,0px)+2px)]'
          : 'border-t bg-background/90 backdrop-blur-md px-2.5 py-2 sm:px-3 sm:py-2.5 pb-[var(--chat-input-bottom,0.9rem)] md:pb-2.5'
      } ${
        isKeyboardOpen ? 'keyboard-open' : ''
      }`}
      style={
        isKeyboardOpen
          ? { paddingBottom: compact ? 'max(0.5rem, env(safe-area-inset-bottom, 0.5rem))' : 'max(0.9rem, env(safe-area-inset-bottom, 0.9rem))' }
          : undefined
      }
    >
      <div ref={controlsRef} className={`mx-auto ${compact ? 'max-w-none' : 'max-w-3xl'}`}>
        {/* 意图检测提示 */}
        {showIntentBanner && detectedIntent && (
          <IntentSuggestionBanner
            intent={detectedIntent}
            onAccept={() => {
              // 接受意图切换（可扩展为实际切换Agent模式）
              setShowIntentBanner(false);
            }}
            onDismiss={() => {
              setShowIntentBanner(false);
            }}
          />
        )}

        {/* 附件预览区域 */}
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-2 overflow-hidden"
            >
              <div className="flex flex-wrap gap-2 p-2 rounded-lg bg-muted/30">
                {attachments.map((file) => (
                  <motion.div
                    key={file.id}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="relative group"
                  >
                    {file.type === 'image' ? (
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                        <img
                          src={file.preview}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => removeAttachment(file.id)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border">
                        <div className="flex items-center gap-1 text-sm">
                          <Mic size={14} className="text-primary" />
                          <span className="text-xs">{file.duration ? formatRecordingTime(file.duration) : '00:00'}</span>
                        </div>
                        <button
                          onClick={() => removeAttachment(file.id)}
                          className="w-5 h-5 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive flex items-center justify-center transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 录音状态指示 */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-2 overflow-hidden"
            >
              <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                    <div className="absolute inset-0 w-3 h-3 rounded-full bg-destructive animate-ping" />
                  </div>
                  <span className="text-sm font-medium text-destructive">
                    录音中 {formatRecordingTime(recordingTime)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={cancelRecording}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors"
                  >
                    <Trash2 size={14} />
                    取消
                  </button>
                  <button
                    onClick={toggleRecording}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-destructive text-primary-foreground text-sm hover:bg-destructive/90 transition-colors"
                  >
                    <Check size={14} />
                    完成
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 模型选择器 */}
        {!compact && (
        <div className="mb-2 flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowModelSelector(!showModelSelector)}
              className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/82 px-3 py-1.5 text-sm backdrop-blur transition-all hover:border-[hsl(var(--border-strong))] hover:bg-[hsl(var(--bg-surface))]/96 active:scale-[0.99]"
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-md"
                style={{ backgroundColor: 'hsl(var(--guide-6) / 0.18)', color: 'hsl(var(--guide-6))' }}
              >
                <Sparkles size={12} />
              </span>
              <span className="font-medium">{isCustomModel ? apiConfig.model : currentModel.name}</span>
              <ChevronDown size={14} className={`text-muted-foreground transition-transform ${showModelSelector ? 'rotate-180' : ''}`} />
            </button>

            {/* 模型下拉菜单 */}
            <AnimatePresence>
              {showModelSelector && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute bottom-full left-0 z-50 mb-2 max-h-80 w-72 overflow-y-auto rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/99 shadow-2xl backdrop-blur-xl"
                >
                  {/* 自定义模型输入 */}
                  <div className="p-2 border-b border-[hsl(var(--border-subtle))]">
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={customModelInput}
                        onChange={(e) => setCustomModelInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCustomModelSubmit();
                          }
                        }}
                        placeholder="输入自定义模型名称"
                        className="flex-1 text-sm px-2 py-1.5 rounded border bg-background outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <button
                        onClick={handleCustomModelSubmit}
                        className="px-2 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
                      >
                        添加
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 px-1">
                      输入任意模型名称，如 ark-code-latest
                    </p>
                  </div>

                  {/* 当前自定义模型指示器 */}
                  {isCustomModel && (
                    <div className="px-3 py-2 bg-accent/50 text-sm border-b border-[hsl(var(--border-subtle))]">
                      <span className="text-muted-foreground">当前: </span>
                      <span className="font-medium">{apiConfig.model}</span>
                    </div>
                  )}

                  {/* 已配置的模型列表 */}
                  {allModels.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                      {!isApiConfigured ? (
                        <>请先在设置中配置 API Key</>
                      ) : (
                        <>无可用模型，请使用自定义模型</>
                      )}
                    </div>
                  ) : (
                    allModels.map((model) => (
                      <button
                        key={`${model.id}-${model.config?.baseURL || 'default'}`}
                        onClick={() => handleModelChange(model)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors hover:bg-[hsl(var(--bg-muted))]/80 ${
                          model.id === apiConfig.model ? 'bg-primary/10 text-primary ring-1 ring-primary/20' : ''
                        }`}
                      >
                        <div>
                          <div className="text-sm font-medium">{model.name}</div>
                          <div className="text-xs text-muted-foreground">{model.provider}</div>
                        </div>
                        {model.id === apiConfig.model && <Check size={16} className="text-primary" />}
                      </button>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 快捷短语按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowQuickPhrases(!showQuickPhrases)}
              className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/82 px-3 py-1.5 text-sm backdrop-blur transition-all hover:border-[hsl(var(--border-strong))] hover:bg-[hsl(var(--bg-surface))]/96 active:scale-[0.99]"
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-md"
                style={{ backgroundColor: 'hsl(var(--guide-8) / 0.18)', color: 'hsl(var(--guide-8))' }}
              >
                <MessageSquare size={12} />
              </span>
              <span className="text-muted-foreground">短语</span>
            </button>

            {/* 快捷短语下拉菜单 */}
            <AnimatePresence>
              {showQuickPhrases && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute bottom-full left-0 z-50 mb-2 max-h-80 w-64 overflow-y-auto rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/99 shadow-2xl backdrop-blur-xl"
                >
                  {quickPhrasePrompts.map((prompt) => (
                    <button
                      key={prompt.id}
                      onClick={() => {
                        setInput((prev) => prev + (prev ? '\n' : '') + prompt.content);
                        setShowQuickPhrases(false);
                        textareaRef.current?.focus();
                      }}
                      className="w-full flex items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-[hsl(var(--bg-muted))]/80"
                    >
                      <div
                        className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${prompt.color}20`, color: prompt.color }}
                      >
                        <Sparkles size={12} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{prompt.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{prompt.description}</div>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 快捷设置按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowQuickSettings(!showQuickSettings)}
              className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/82 px-3 py-1.5 text-sm backdrop-blur transition-all hover:border-[hsl(var(--border-strong))] hover:bg-[hsl(var(--bg-surface))]/96 active:scale-[0.99]"
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-md"
                style={{ backgroundColor: 'hsl(var(--guide-10) / 0.18)', color: 'hsl(var(--guide-10))' }}
              >
                <Settings size={12} />
              </span>
              <span className="text-muted-foreground">设置</span>
            </button>

            {/* 快捷设置面板 */}
            <AnimatePresence>
              {showQuickSettings && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/99 p-4 shadow-2xl backdrop-blur-xl"
                >
                  <div className="space-y-4">
                    {/* 温度设置 */}
                    <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/55 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium">Temperature</label>
                        <span className="text-xs text-muted-foreground">{localTemperature}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={localTemperature}
                        onChange={(e) => setLocalTemperature(parseFloat(e.target.value))}
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>精确</span>
                        <span>平衡</span>
                        <span>创意</span>
                      </div>
                    </div>

                    {/* 最大Token设置 */}
                    <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/55 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium">Max Tokens</label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{localMaxTokens.toLocaleString()}</span>
                          <button
                            onClick={() => setLocalMaxTokens(currentModelMaxTokens)}
                            className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            title={`设为模型最大值 (${currentModelMaxTokens.toLocaleString()})`}
                          >
                            最大
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="256"
                        max={currentModelMaxTokens}
                        step={currentModelMaxTokens > 32768 ? 4096 : 256}
                        value={localMaxTokens}
                        onChange={(e) => setLocalMaxTokens(parseInt(e.target.value))}
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>256</span>
                        <span>{(currentModelMaxTokens / 2).toLocaleString()}</span>
                        <span>{currentModelMaxTokens.toLocaleString()}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        {currentModel.name} 支持最大 {currentModelMaxTokens.toLocaleString()} tokens
                      </p>
                    </div>

                    {/* 打字速度设置 */}
                    <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/55 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium flex items-center gap-1">
                          <Zap size={14} />
                          打字速度
                        </label>
                        <span className="text-xs text-muted-foreground">{localTypingSpeed}ms/字</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        step="10"
                        value={localTypingSpeed}
                        onChange={(e) => setLocalTypingSpeed(parseInt(e.target.value))}
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>快</span>
                        <span>慢</span>
                      </div>
                    </div>

                    {/* 保存按钮 */}
                    <button
                      onClick={handleSaveQuickSettings}
                      className="w-full py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
                    >
                      保存设置
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        )}

        <div className={`relative flex items-end gap-2 rounded-xl border p-2 shadow-sm transition-all duration-200 ${
          compact
            ? 'border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/98 shadow-md backdrop-blur-xl'
            : 'border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/96 backdrop-blur-xl shadow-md input-glow'
        }`}>
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            className="hidden"
          />

          {/* 语音输入按钮 */}
          <motion.button
            onClick={toggleRecording}
            className={`flex items-center justify-center rounded-md transition-all duration-150 touch-manipulation w-9 h-9 ${
              isRecording
                ? 'text-destructive bg-destructive/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 active:scale-95'
            }`}
            aria-label="语音输入"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isRecording ? <Square size={18} /> : <Mic size={18} />}
          </motion.button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="发送消息..."
            disabled={disabled}
            rows={1}
            // Prevent iOS zoom
            style={{ fontSize: '16px' }}
            className="flex-1 resize-none border-none bg-transparent px-2 sm:px-3 py-2 text-sm outline-none disabled:opacity-50 min-h-[44px] placeholder:text-muted-foreground/60 self-center"
          />

          {/* 字符计数 */}
          {input.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute -top-6 right-2 text-[10px] text-muted-foreground/60"
            >
              {input.length}
            </motion.div>
          )}

          {/* 图片上传按钮 */}
          <motion.button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 active:scale-95 transition-all duration-150 touch-manipulation w-9 h-9"
            aria-label="上传图片"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Image size={18} />
          </motion.button>

          {/* 发送按钮 */}
          <motion.button
            onClick={handleSend}
            disabled={(!input.trim() && attachments.length === 0) || disabled}
            className={`
              relative flex items-center justify-center rounded-lg
              transition-all duration-200 touch-manipulation w-11 h-11 sm:w-9 sm:h-9
              ${(input.trim() || attachments.length > 0) && !disabled
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 active:scale-95'
                : 'bg-muted text-muted-foreground/40 cursor-not-allowed'
              }
            `}
            whileHover={((input.trim() || attachments.length > 0) && !disabled) ? { scale: 1.05 } : {}}
            whileTap={((input.trim() || attachments.length > 0) && !disabled) ? { scale: 0.95 } : {}}
          >
            {disabled ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2 size={18} />
              </motion.div>
            ) : (
              <motion.div
                initial={false}
                animate={{
                  scale: input.trim() || attachments.length > 0 ? 1 : 0.8,
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              >
                <Send size={18} />
              </motion.div>
            )}

            {/* 发送时的脉冲效果 */}
            {((input.trim() || attachments.length > 0) && !disabled) && (
              <motion.div
                className="absolute inset-0 rounded-lg bg-primary"
                initial={{ opacity: 0, scale: 1 }}
                whileTap={{ opacity: [0, 0.5, 0], scale: [1, 1.5, 1] }}
                transition={{ duration: 0.3 }}
              />
            )}
          </motion.button>
        </div>

      </div>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';

export default ChatInput;

