import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  define: {
    __DEV__: true,
  },
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, '__mocks__/react-native.ts'),
    },
  },
})
