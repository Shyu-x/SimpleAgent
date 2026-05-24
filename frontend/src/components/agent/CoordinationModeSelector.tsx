'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Link2, Zap, ChevronDown, Check } from 'lucide-react';

// ==================== Types ====================

export type CoordinationMode = 'TEAM_LEADER' | 'COLLABORATIVE' | 'AUTONOMOUS';

/**
 * 前后端枚举映射
 * 前端使用大写格式，后端使用小写下划线格式
 */
export const BACKEND_MODE_MAP: Record<CoordinationMode, string> = {
  'TEAM_LEADER': 'team_leader',
  'COLLABORATIVE': 'collaborative',
  'AUTONOMOUS': 'autonomous'
};

export const FRONTEND_MODE_MAP: Record<string, CoordinationMode> = {
  'team_leader': 'TEAM_LEADER',
  'collaborative': 'COLLABORATIVE',
  'autonomous': 'AUTONOMOUS'
};

export interface CoordinationModeOption {
  value: CoordinationMode;
  label: string;
  description: string;
  icon: React.ReactNode;
 适用场景: string;
}

interface CoordinationModeSelectorProps {
  value?: CoordinationMode;
  onModeChange: (mode: CoordinationMode) => void;
  compact?: boolean;
  disabled?: boolean;
}

// ==================== Mode Options ====================

const MODE_OPTIONS: CoordinationModeOption[] = [
  {
    value: 'TEAM_LEADER',
    label: '团队领导模式',
    description: '主 Agent 主导，其他执行',
    icon: <Users size={18} />,
    适用场景: '复杂分层任务',
  },
  {
    value: 'COLLABORATIVE',
    label: '协作模式',
    description: '对等协作，共享职责',
    icon: <Link2 size={18} />,
    适用场景: '并行专业工作',
  },
  {
    value: 'AUTONOMOUS',
    label: '自主模式',
    description: '独立执行，最小协调',
    icon: <Zap size={18} />,
    适用场景: '独立并行任务',
  },
];

// ==================== Component ====================

export default function CoordinationModeSelector({
  value,
  onModeChange,
  compact = false,
  disabled = false,
}: CoordinationModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = MODE_OPTIONS.find((opt) => opt.value === value);

  const handleSelect = (mode: CoordinationMode) => {
    onModeChange(mode);
    setIsOpen(false);
  };

  // 紧凑模式：单选按钮风格
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => !disabled && onModeChange(option.value)}
            disabled={disabled}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
              transition-all duration-200 border
              ${
                value === option.value
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-[hsl(var(--bg-muted))]/50 border-[hsl(var(--border-subtle))] text-[hsl(var(--text-muted))] hover:border-[hsl(var(--border))] hover:text-[hsl(var(--text-secondary))]'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <span className={value === option.value ? 'text-primary' : 'text-[hsl(var(--text-muted))]'}>
              {option.icon}
            </span>
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  // 完整模式：下拉选择器
  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl
          border transition-all duration-200
          ${
            disabled
              ? 'bg-[hsl(var(--bg-muted))]/30 cursor-not-allowed opacity-50'
              : 'bg-[hsl(var(--bg-surface))] hover:bg-[hsl(var(--bg-muted))]/50 cursor-pointer'
          }
          ${isOpen ? 'border-primary/30 ring-2 ring-primary/20' : 'border-[hsl(var(--border-subtle))]'}
        `}
      >
        {selectedOption ? (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-primary">{selectedOption.icon}</span>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-medium text-[hsl(var(--text-main))]">
                {selectedOption.label}
              </div>
              <div className="text-xs text-[hsl(var(--text-muted))]">
                {selectedOption.description}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-1">
            <Users size={18} className="text-[hsl(var(--text-muted))]" />
            <span className="text-sm text-[hsl(var(--text-muted))]">
              选择协调模式
            </span>
          </div>
        )}
        <ChevronDown
          size={18}
          className={`text-[hsl(var(--text-muted))] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 right-0 mt-2 z-50 bg-[hsl(var(--bg-surface))] border border-[hsl(var(--border-subtle))] rounded-xl shadow-xl overflow-hidden"
            >
              {/* Header */}
              <div className="px-4 py-3 border-b border-[hsl(var(--border-subtle))]">
                <div className="text-xs font-medium text-[hsl(var(--text-muted))] uppercase tracking-wider">
                  A2A 协调模式
                </div>
                <div className="text-xs text-[hsl(var(--text-muted))] mt-1">
                  选择 Multi-Agent 协作策略
                </div>
              </div>

              {/* Mode Options */}
              <div className="p-2 space-y-1">
                {MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    className={`
                      w-full flex items-start gap-3 p-3 rounded-lg text-left
                      transition-all duration-150
                      ${
                        value === option.value
                          ? 'bg-primary/10 ring-1 ring-primary/30'
                          : 'hover:bg-[hsl(var(--bg-muted))]/50'
                      }
                    `}
                  >
                    <span
                      className={`
                      p-2 rounded-lg mt-0.5
                      ${
                        value === option.value
                          ? 'bg-primary/20 text-primary'
                          : 'bg-[hsl(var(--bg-muted))] text-[hsl(var(--text-muted))]'
                      }
                    `}
                    >
                      {option.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-[hsl(var(--text-main))]">
                          {option.label}
                        </span>
                        {value === option.value && (
                          <span className="p-0.5 rounded bg-primary/20 text-primary">
                            <Check size={12} />
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">
                        {option.description}
                      </div>
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--bg-muted))] text-[hsl(var(--text-muted))]">
                          适用
                        </span>
                        <span className="text-[10px] text-[hsl(var(--text-muted))]">
                          {option.适用场景}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Footer Hint */}
              <div className="px-4 py-2 border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/30">
                <div className="text-[10px] text-[hsl(var(--text-muted))]">
                  模式将影响 Agent 间的通信方式和任务分配策略
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==================== Radio Group Variant ====================

interface CoordinationModeRadioGroupProps {
  value?: CoordinationMode;
  onModeChange: (mode: CoordinationMode) => void;
  disabled?: boolean;
}

export function CoordinationModeRadioGroup({
  value,
  onModeChange,
  disabled = false,
}: CoordinationModeRadioGroupProps) {
  return (
    <div className="space-y-2">
      {/* Label */}
      <div className="flex items-center gap-2">
        <Users size={14} className="text-[hsl(var(--text-muted))]" />
        <span className="text-xs font-medium text-[hsl(var(--text-secondary))]">
          协调模式
        </span>
      </div>

      {/* Radio Options */}
      <div className="space-y-1.5">
        {MODE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`
              flex items-center gap-3 p-2.5 rounded-lg cursor-pointer
              transition-all duration-150 border
              ${
                value === option.value
                  ? 'bg-primary/5 border-primary/30'
                  : 'bg-transparent border-transparent hover:bg-[hsl(var(--bg-muted))]/30 hover:border-[hsl(var(--border-subtle))]'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {/* Radio Circle */}
            <div
              className={`
                w-4 h-4 rounded-full border-2 flex items-center justify-center
                transition-all duration-150
                ${
                  value === option.value
                    ? 'border-primary bg-primary'
                    : 'border-[hsl(var(--border))]'
                }
              `}
            >
              {value === option.value && (
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[hsl(var(--text-main))]">
                  {option.label}
                </span>
                <span className="text-xs text-[hsl(var(--text-muted))]">
                  {option.description}
                </span>
              </div>
            </div>

            {/* Icon */}
            <span
              className={`
                transition-colors duration-150
                ${value === option.value ? 'text-primary' : 'text-[hsl(var(--text-muted))]'}
              `}
            >
              {option.icon}
            </span>

            {/* Hidden Radio Input */}
            <input
              type="radio"
              name="coordination-mode"
              value={option.value}
              checked={value === option.value}
              onChange={() => onModeChange(option.value)}
              disabled={disabled}
              className="sr-only"
            />
          </label>
        ))}
      </div>
    </div>
  );
}