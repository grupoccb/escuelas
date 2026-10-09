// @ts-check
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/", "dist/", "playwright-report/", "test-results/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat["recommended-latest"] ?? reactHooks.configs.flat.recommended,
  // Playwright llama `use(...)` en sus fixtures: no son hooks de React.
  { files: ["e2e/**"], rules: { "react-hooks/rules-of-hooks": "off" } },
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Nada de datos (y menos de salud) en la consola del navegador: el cliente no registra.
      "no-console": "error",
    },
  },
);
