// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config({
  files: ["src/**/*.ts"],
  ignores: ["**/*.test.ts"],
  extends: [tseslint.configs.recommended],
  rules: {
    // Downgrade to warn — fixable over time
    "@typescript-eslint/no-explicit-any": "warn",
    // Honour the TypeScript convention of prefixing intentionally-unused
    // params/vars with an underscore (e.g. _args, _event).
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
  },
});
