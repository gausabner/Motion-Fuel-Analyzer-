import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    resolve: {
        // Mirrors the "@/*" -> "./*" path alias in tsconfig.json.
        alias: { "@": path.resolve(__dirname, ".") },
    },
    test: {
        environment: "node",
        setupFiles: ["tests/setup.env.ts"],
        include: ["tests/**/*.test.ts"],
        // The DB-backed suite shares one SQLite file; keep suites off each other.
        fileParallelism: false,
    },
});
