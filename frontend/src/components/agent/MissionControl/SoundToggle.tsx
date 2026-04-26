'use client';

import { memo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';

interface SoundToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

// 提示音音调定义 (Hz)
const TONES = {
  success: [523.25, 659.25], // C5, E5 - 成功
  error: [392, 329.63], // G4, E4 - 错误
  warning: [440, 349.23], // A4, F4 - 警告
};

const SoundToggle = memo(function SoundToggle({ enabled, onToggle }: SoundToggleProps) {
  const audioCtxRef = useRef<AudioContext | null>(null);

  // 播放提示音
  const playTone = (type: 'success' | 'error' | 'warning') => {
    if (!enabled) return;

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const frequencies = TONES[type];

      frequencies.forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.value = freq;

        const startTime = ctx.currentTime + i * 0.1;
        gainNode.gain.setValueAtTime(0.1, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

        oscillator.start(startTime);
        oscillator.stop(startTime + 0.3);
      });
    } catch (e) {
      console.warn('Failed to play sound:', e);
    }
  };

  // 导出播放方法到 window
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).missionControlPlayTone = playTone;
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).missionControlPlayTone;
    };
  }, [enabled]);

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onToggle}
      className={`p-1.5 rounded transition-colors ${
        enabled
          ? 'text-cyan-400 hover:bg-cyan-500/20'
          : 'text-slate-500 hover:bg-white/10'
      }`}
      title={enabled ? '声音已开启' : '声音已关闭'}
    >
      {enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
    </motion.button>
  );
});

export default SoundToggle;
