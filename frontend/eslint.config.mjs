import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';
import fs from 'fs';
import path from 'path';

export default [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      // App Router 项目不需要 pages 目录
      'src/pages/**/*',
      // Coverage 目录 (测试覆盖率输出)
      'coverage/**',
      '**/coverage/**'
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/use-memo': 'off',
      'react/no-unescaped-entities': 'off',
      '@next/next/no-img-element': 'off',
      'jsx-a11y/alt-text': 'off',
      'import/no-anonymous-default-export': 'off'
    }
  }
];
