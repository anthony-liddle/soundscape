import '@testing-library/jest-dom/vitest'

// Mock crypto.randomUUID for deterministic tests
let mockUuidCounter = 0

export function resetMockUuid() {
  mockUuidCounter = 0
}

vi.stubGlobal('crypto', {
  ...crypto,
  randomUUID: () => `test-uuid-${++mockUuidCounter}`,
})
