'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Check, X, ChevronUp, ChevronDown } from 'lucide-react';

interface ConfirmationRequest {
  id: string;
  sessionId: string;
  decision: {
    type: string;
    tool: string;
    input: Record<string, any>;
    reason: string;
  };
  status: 'pending' | 'responded';
  createdAt: number;
}

interface HumanLoopConfirmationProps {
  confirmations: ConfirmationRequest[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onModifyAndApprove: (id: string, modifiedInput: any) => void;
}

export function HumanLoopConfirmation({
  confirmations,
  onApprove,
  onReject,
  onModifyAndApprove
}: HumanLoopConfirmationProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [modifiedInput, setModifiedInput] = React.useState<string>('');

  if (confirmations.length === 0) {
    return null;
  }

  const currentConfirmation = confirmations[0];

  const handleModify = () => {
    try {
      const parsed = JSON.parse(modifiedInput);
      onModifyAndApprove(currentConfirmation.id, parsed);
      setEditingId(null);
      setModifiedInput('');
    } catch {
      // Invalid JSON
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] max-w-lg w-full mx-4"
      >
        <div className="bg-background rounded-xl shadow-2xl border border-border overflow-hidden">
          {/* Header */}
          <div className="bg-[hsl(var(--warning-500))/0.14] px-4 py-3 border-b border-[hsl(var(--warning-500))/0.32]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[hsl(var(--warning-500))]" />
              <h3 className="font-medium text-[hsl(var(--warning-500))]">
                需要确认操作
              </h3>
            </div>
          </div>

          {/* Content */}
          <div className="p-4">
            <p className="text-muted-foreground mb-3">
              {currentConfirmation.decision.reason}
            </p>

            <div className="bg-muted rounded-lg p-3 mb-4">
              <div className="text-sm text-muted-foreground mb-1">工具</div>
              <div className="font-mono text-sm text-foreground">
                {currentConfirmation.decision.tool}
              </div>
            </div>

            <div className="bg-muted rounded-lg p-3 mb-4">
              <div className="text-sm text-muted-foreground mb-1">参数</div>
              <pre className="font-mono text-xs text-foreground overflow-x-auto">
                {JSON.stringify(currentConfirmation.decision.input, null, 2)}
              </pre>
            </div>

            {/* Edit Mode */}
            {editingId === currentConfirmation.id && (
              <div className="mb-4">
                <label className="block text-sm text-muted-foreground mb-1">
                  修改参数 (JSON)
                </label>
                <textarea
                  value={modifiedInput}
                  onChange={(e) => setModifiedInput(e.target.value)}
                  className="w-full h-24 px-3 py-2 text-sm font-mono bg-background border border-border rounded-lg focus:ring-2 focus:ring-ring"
                  placeholder={JSON.stringify(currentConfirmation.decision.input, null, 2)}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleModify}
                    className="px-3 py-1 text-sm bg-[hsl(var(--success-500))] text-primary-foreground rounded-lg hover:bg-[hsl(var(--success-600))]"
                  >
                    确认修改
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setModifiedInput('');
                    }}
                    className="px-3 py-1 text-sm bg-muted text-muted-foreground rounded-lg hover:bg-muted/80"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            {editingId !== currentConfirmation.id && (
              <div className="flex gap-2">
                <button
                  onClick={() => onApprove(currentConfirmation.id)}
                  className="flex-1 px-4 py-2 bg-[hsl(var(--success-500))] text-primary-foreground rounded-lg hover:bg-[hsl(var(--success-600))] transition-colors flex items-center justify-center gap-2"
                >
                  <Check size={16} /> 批准
                </button>
                <button
                  onClick={() => {
                    setEditingId(currentConfirmation.id);
                    setModifiedInput(JSON.stringify(currentConfirmation.decision.input, null, 2));
                  }}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  修改
                </button>
                <button
                  onClick={() => onReject(currentConfirmation.id)}
                  className="flex-1 px-4 py-2 bg-destructive text-primary-foreground rounded-lg hover:bg-destructive/90 transition-colors flex items-center justify-center gap-2"
                >
                  <X size={16} /> 拒绝
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-muted border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              Agent 执行已暂停，等待您的确认
            </p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * 紧凑型确认按钮（用于消息中嵌入）
 */
interface InlineConfirmationProps {
  toolName: string;
  input: Record<string, any>;
  onApprove: () => void;
  onReject: () => void;
}

export function InlineConfirmation({
  toolName,
  input,
  onApprove,
  onReject
}: InlineConfirmationProps) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="my-2 rounded-lg border border-[hsl(var(--warning-500))/0.32] bg-[hsl(var(--warning-500))/0.14] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[hsl(var(--warning-500))]" />
          <span className="text-sm font-medium text-[hsl(var(--warning-500))]">
            执行 {toolName}?
          </span>
        </div>
        {expanded ? <ChevronUp size={16} className="text-[hsl(var(--warning-500))]" /> : <ChevronDown size={16} className="text-[hsl(var(--warning-500))]" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2">
              <pre className="text-xs font-mono bg-background rounded p-2 mb-2 overflow-x-auto">
                {JSON.stringify(input, null, 2)}
              </pre>
              <div className="flex gap-2">
                <button
                  onClick={onApprove}
                  className="flex-1 px-3 py-1 text-sm bg-[hsl(var(--success-500))] text-primary-foreground rounded hover:bg-[hsl(var(--success-600))] flex items-center justify-center gap-1"
                >
                  <Check size={14} /> 批准
                </button>
                <button
                  onClick={onReject}
                  className="flex-1 px-3 py-1 text-sm bg-destructive text-primary-foreground rounded hover:bg-destructive/90 flex items-center justify-center gap-1"
                >
                  <X size={14} /> 拒绝
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
