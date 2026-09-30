import { fileURLToPath } from "node:url"
import path from "node:path"

import { defineConfig } from "vitest/config"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
      // server-only 包在非 RSC 的 node 环境导入会抛错；测试中替换为空实现
      "server-only": path.resolve(rootDir, "tests/stubs/server-only.ts"),
    },
  },
})
