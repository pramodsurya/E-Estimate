import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

const reactHooksRecommended = reactHooks.configs.flat.recommended

export default [
  {
    name: 'e-estimate/ignores',
    ignores: [
      'dist/**',
      'out/**',
      'node_modules/**',
      'src-tauri/**',
      'vendor/**',
      'scripts/**',
      '**/*.cjs'
    ]
  },
  {
    name: 'e-estimate/react-compiler',
    files: ['src/renderer/src/**/*.{ts,tsx}'],
    linterOptions: {
      reportUnusedDisableDirectives: 'error'
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: {
      ...reactHooksRecommended.plugins,
      '@typescript-eslint': tseslint.plugin
    },
    rules: {
      ...reactHooksRecommended.rules,
      'react-hooks/set-state-in-effect': 'error'
    }
  }
]
