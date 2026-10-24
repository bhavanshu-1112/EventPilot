import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    plugins: {
      'jsx-a11y': jsxA11y,
    },
    rules: {
      // TypeScript strict
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // Complexity
      complexity: ['error', 10],

      // JSX Accessibility (recommended rules)
      ...jsxA11y.configs.recommended.rules,

      // General
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'scripts/**',
      '*.config.*',
      'apps/web/postcss.config.js',
      'apps/web/tailwind.config.js',
    ],
  },
);
