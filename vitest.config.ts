import { defineConfig } from 'vitest/config'

// Config separada de vite.config.ts a propósito: los tests de src/fisica/ son
// lógica pura en Node, sin DOM y sin el plugin de React.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
