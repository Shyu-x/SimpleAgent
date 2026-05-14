/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',  // 使用 .dark class 切换暗色模式，与 globals.css 中 .dark 选择器一致
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
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
