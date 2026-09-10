module.exports = {
  extends: ["./.eslintrc.shared.cjs"],
  plugins: ["react-hooks"],
  rules: {
    "constructor-super": "error",
    "for-direction": "error",
    "getter-return": "error",
    "no-async-promise-executor": "error",
    "no-const-assign": "error",
    "no-debugger": "error",
    "no-dupe-args": "error",
    "no-dupe-class-members": "error",
    "no-dupe-keys": "error",
    "no-duplicate-case": "error",
    "no-ex-assign": "error",
    "no-func-assign": "error",
    "no-import-assign": "error",
    "no-loss-of-precision": "error",
    "no-sparse-arrays": "error",
    "no-this-before-super": "error",
    "no-unreachable": "error",
    "no-unsafe-finally": "error",
    "no-unsafe-optional-chaining": "error",
    "use-isnan": "error",
    "valid-typeof": "error",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn"
  },
  overrides: [
    {
      files: ["**/*.{ts,tsx}"],
      rules: {
        // TS overload signatures can trip this core rule; the richer
        // @typescript-eslint stack remains enabled in CI.
        "no-dupe-class-members": "off"
      }
    }
  ]
};
