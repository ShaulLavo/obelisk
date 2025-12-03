import solid from "eslint-plugin-solid/configs/typescript";
import globals from "globals";
import { config as baseConfig } from "./base.js";

/**
 * A custom ESLint configuration for Solid projects.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx,jsx,js}"],
    ...solid,
    languageOptions: {
      ...(solid.languageOptions ?? {}),
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        ...(solid.languageOptions?.globals ?? {}),
      },
    },
  },
  {
    rules: {
      "prefer-const": "off",
    },
  },
];
