import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.claude/**',
      'backend/src/generated/**',
      'frontend/postcss.config.js',
      '**/*.config.js',
      'mobile/android/**',
      'mobile/assets/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Phase 0 sets the bar: no `any` anywhere. See plan §4.4.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // Floating promises are the most common source of silent async bugs.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },

  // Config files are not covered by the app tsconfigs.
  {
    files: ['**/*.config.ts', 'eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
)
