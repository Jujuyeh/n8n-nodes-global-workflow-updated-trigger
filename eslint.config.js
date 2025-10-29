// ESLint v9 flat config
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Ignore build artifacts and deps
  { ignores: ['dist/**', 'node_modules/**'] },

  // Base JS + TS recommended configs
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Our project rules
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest'
        // No "project" by default to keep CI fast; flip on if you want type-aware linting.
        // project: './tsconfig.json'
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off'
    }
  }
);