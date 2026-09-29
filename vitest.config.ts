import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Temp projects live in <repo>/.tmp. Without a ceiling, git would walk up from a non-git temp folder
// and report the CodeQuest repository itself as the project root.
const tmpBase = fileURLToPath(new URL('.tmp', import.meta.url)).replaceAll('\\', '/');

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/fixtures/**'],
    testTimeout: 30_000,
    env: { GIT_CEILING_DIRECTORIES: tmpBase },
  },
});
