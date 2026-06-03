import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "check-prisma.ts",
    "clearFolders.js",
    "fix-lookups.js",
    "fix_auth_imports.js",
    "test_db_save.js",
    "tmp/**",
    "prisma/activate-vector.ts",
    "prisma/seed.ts",
  ]),
]);

export default eslintConfig;
