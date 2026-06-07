/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors');

module.exports = {
  darkMode: 'class',  // 使用 .dark class 切换暗色模式，与 globals.css 中 .dark 选择器一致
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    // A11Y 修复: 浅色 token 调暗 1 档以提升对比度 (WCAG AA 4.5:1)
    // 注意: 仅调暗, 不影响 dark mode 视觉
    colors: {
      ...colors,
      // slate-400/500 不再硬覆盖 - 保留 Tailwind 原色 (#94a3b8, #64748b)
      // 原覆盖 #475569/#334155 会在 MissionControl 等深色背景上对比度不足 (2.35/1.72)
      // 浅底色文本已通过 globals.css 的 --text-muted 加深处理
      yellow: {
        ...colors.yellow,
        600: '#a16207',  // 原 #ca8a04 - 浅底对比度从 3.4 提升到 4.7
        500: '#854d0e',
        400: '#713f12',
      },
      green: {
        ...colors.green,
        600: '#15803d',  // 原 #16a34a - 浅底对比度从 3.4 提升到 4.7
        500: '#166534',
      },
      transparent: colors.transparent,
      current: colors.current,
      border: 'hsl(var(--border))',
      background: 'hsl(var(--background))',
      foreground: 'hsl(var(--foreground))',
      primary: {
        DEFAULT: 'hsl(var(--primary))',
        foreground: 'hsl(var(--primary-foreground))',
      },
      muted: {
        DEFAULT: 'hsl(var(--muted))',
        foreground: 'hsl(var(--muted-foreground))',
      },
      accent: {
        DEFAULT: 'hsl(var(--accent))',
        foreground: 'hsl(var(--accent-foreground))',
      },
    },
    extend: {
      screens: {
        // Custom breakpoints as requested
        // Mobile: < 640px
        // Tablet: 640px - 1023px
        // Desktop: 1024px+
        'mobile': {'max': '639px'},
        'tablet': {'min': '640px', 'max': '1023px'},
        'desktop': {'min': '1024px'},
        'xs': '480px',    // Extra small (large phones)
        'sm': '640px',    // Small (mobile landscape) = tablet min
        'md': '768px',    // Medium (tablet portrait)
        'lg': '1024px',   // Large (tablet landscape / small desktop) = desktop min
        'xl': '1280px',   // Extra large (desktop)
        '2xl': '1440px',  // 2X large (large desktop)
        '3xl': '1920px',  // 3X large (extra large desktop)
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      maxWidth: {
        'message': '900px',
        'message-lg': '1000px',
        'message-xl': '1200px',
      },
    },
  },
  plugins: [],
}
