import eslint from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import vue from "eslint-plugin-vue"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      "**/.nuxt/**",
      "**/.output/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "coverage/**",
      "pnpm-lock.yaml"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs["flat/recommended"],
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,vue}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        defineNuxtConfig: "readonly",
        useSeoMeta: "readonly"
      }
    },
    rules: {
      "no-console": "error",
      "no-warning-comments": [
        "error",
        {
          location: "anywhere",
          terms: ["TODO", "FIXME"]
        }
      ],
      "vue/multi-word-component-names": "off"
    }
  },
  eslintConfigPrettier
)
