const nextParser = require.resolve("eslint-config-next/parser");

module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  parser: nextParser,
  parserOptions: {
    requireConfigFile: false,
    sourceType: "module",
    allowImportExportEverywhere: true,
    babelOptions: {
      presets: ["next/babel"],
      caller: {
        supportsTopLevelAwait: true
      }
    }
  }
};
