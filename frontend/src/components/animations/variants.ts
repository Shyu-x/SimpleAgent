'use client';

import { motion, Variants, Transition } from 'framer-motion';

// 通用动画持续时间
export const ANIMATION_DURATION = {
  instant: 0.05,
  fast: 0.15,
  normal: 0.3,
  slow: 0.5,
} as const;

// 弹簧过渡配置
export const SPRING_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 25,
};

// 缓动过渡配置
export const EASING_TRANSITION: Transition = {
  duration: ANIMATION_DURATION.normal,
  ease: [0.25, 0.46, 0.45, 0.94],
};

// 淡入变体
export const fadeInVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: EASING_TRANSITION,
  },
  exit: {
    opacity: 0,
    transition: { duration: ANIMATION_DURATION.fast },
  },
};

// 淡入淡出变体（带缩放）
export const fadeScaleVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: SPRING_TRANSITION,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: ANIMATION_DURATION.fast },
  },
};

// 从下方滑入变体
export const slideUpVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: EASING_TRANSITION,
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: ANIMATION_DURATION.fast },
  },
};

// 从左侧滑入变体
export const slideInLeftVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: EASING_TRANSITION,
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: { duration: ANIMATION_DURATION.fast },
  },
};

// 从右侧滑入变体
export const slideInRightVariants: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: EASING_TRANSITION,
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: { duration: ANIMATION_DURATION.fast },
  },
};

// 模态框变体
export const modalVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
    y: 20,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: SPRING_TRANSITION,
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    y: 20,
    transition: { duration: ANIMATION_DURATION.fast },
  },
};

// 按钮悬停动画
export const buttonHoverVariants: Variants = {
  rest: { scale: 1 },
  hover: { scale: 1.02 },
  tap: { scale: 0.98 },
};

// 列表项变体（支持交错动画）
export const listItemVariants = {
  container: {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  },
  item: (index: number) => ({
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        delay: index * 0.05,
        duration: ANIMATION_DURATION.normal,
        ease: 'easeOut',
      },
    },
    exit: {
      opacity: 0,
      x: -10,
      transition: { duration: ANIMATION_DURATION.fast },
    },
  }),
};

// 加载指示器动画
export const loadingDotVariants: Variants = {
  initial: { y: 0 },
  animate: (index: number) => ({
    y: [-4, 4, -4],
    transition: {
      duration: 0.6,
      repeat: Infinity,
      delay: index * 0.15,
      ease: 'easeInOut',
    },
  }),
};

// 脉冲动画（用于骨架屏等）
export const pulseVariants: Variants = {
  initial: { opacity: 0.5 },
  animate: {
    opacity: [0.5, 1, 0.5],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// 卡片翻转动画（用于3D效果）
export const cardFlipVariants: Variants = {
  hidden: {
    opacity: 0,
    rotateY: 90,
  },
  visible: {
    opacity: 1,
    rotateY: 0,
    transition: {
      duration: ANIMATION_DURATION.normal,
      ease: 'easeInOut',
    },
  },
};

// 工具函数：根据索引创建交错延迟
export function createStaggerDelay(index: number, baseDelay = 0.05): number {
  return index * baseDelay;
}

// 工具函数：创建带索引的变体
export function createIndexedVariants(
  baseVariants: Variants,
  delayMultiplier = 0.05
): (index: number) => Variants {
  return (index: number) => {
    const visible = baseVariants.visible;
    const baseTransition = typeof visible === 'function'
      ? undefined
      : (visible as { transition?: object }).transition;

    return {
      ...baseVariants,
      visible: typeof visible === 'function' ? visible : {
        ...visible,
        transition: baseTransition ? {
          ...baseTransition,
          delay: index * delayMultiplier,
        } : { delay: index * delayMultiplier },
      },
    };
  };
}

// 导出 motion 组件以供直接使用
export { motion };
