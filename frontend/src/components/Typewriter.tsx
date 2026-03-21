'use client';

import { useEffect, useState, useRef, memo } from 'react';
import { useChatStore } from '@/store/chatStore';
import MarkdownRenderer from './MarkdownRenderer';

interface TypewriterProps {
  text: string;
  isComplete?: boolean;
  onComplete?: () => void;
  onPreviewLink?: (url: string, title?: string) => void;
}

// 智能打字速度计算
const getSmartTypingSpeed = (text: string, currentIndex: number, baseSpeed: number): number => {
  // 句尾停顿
  if (/[.!?。！？;；]/.test(text[currentIndex - 1])) {
    return baseSpeed * 2.5;
  }
  // 换行停顿
  if (text[currentIndex] === '\n') {
    return baseSpeed * 1.8;
  }
  // 代码块快速闪过
  if (text.slice(Math.max(0, currentIndex - 3), currentIndex + 3).includes('```')) {
    return baseSpeed * 0.3;
  }
  // 数字和英文稍快
  if (/[0-9a-zA-Z]/.test(text[currentIndex])) {
    return baseSpeed * 0.7;
  }
  // 中文正常速度
  return baseSpeed;
};

const Typewriter = memo(function Typewriter({ text, isComplete, onComplete, onPreviewLink }: TypewriterProps) {
  const speed = useChatStore((state) => state.settings.typingSpeed);
  const animationsEnabled = useChatStore((state) => state.settings.animationsEnabled);
  const [displayText, setDisplayText] = useState(isComplete ? text : '');
  const [isCompleteState, setIsCompleteState] = useState(isComplete || false);
  const [showCursor, setShowCursor] = useState(!isComplete);
  const indexRef = useRef(isComplete ? text.length : 0);
  const cursorIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 光标闪烁动画
  useEffect(() => {
    if (!isComplete && animationsEnabled) {
      cursorIntervalRef.current = setInterval(() => {
        setShowCursor(prev => !prev);
      }, 530);
      return () => {
        if (cursorIntervalRef.current) {
          clearInterval(cursorIntervalRef.current);
        }
      };
    } else {
      setShowCursor(false);
    }
  }, [isComplete, animationsEnabled]);

  useEffect(() => {
    if (isComplete) {
      setDisplayText(text);
      setIsCompleteState(true);
      indexRef.current = text.length;
      setShowCursor(false);
      return;
    }

    if (text === '') {
      setDisplayText('');
      setIsCompleteState(false);
      indexRef.current = 0;
      return;
    }

    if (text.length < displayText.length) {
      setDisplayText(text);
      indexRef.current = text.length;
      if (text.length === 0) {
        setIsCompleteState(false);
      }
      return;
    }

    if (indexRef.current < text.length) {
      const smartSpeed = getSmartTypingSpeed(text, indexRef.current + 1, speed);
      const timeout = setTimeout(() => {
        setDisplayText(text.slice(0, indexRef.current + 1));
        indexRef.current += 1;
      }, smartSpeed);

      return () => clearTimeout(timeout);
    } else if (!isCompleteState) {
      setIsCompleteState(true);
      setShowCursor(false);
      onComplete?.();
    }
  }, [text, speed, displayText.length, isCompleteState, isComplete, onComplete]);

  return (
    <div className="typewriter-wrapper relative">
      <MarkdownRenderer
        content={displayText}
        onPreviewLink={onPreviewLink}
      />
      {/* 智能光标 */}
      {!isCompleteState && animationsEnabled && (
        <span
          className={`typewriter-cursor inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle transition-opacity duration-150 ${
            showCursor ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
});

export default Typewriter;
