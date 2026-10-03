const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

/**
 * NativeWind resolves the Tailwind config with path.resolve, which
 * is relative to the working directory rather than this file. Run a
 * build from anywhere but the project root and it looks for the
 * config beside that directory instead. Absolute paths here, so
 * where the command was run from stops mattering.
 */
module.exports = withNativeWind(config, {
  input: path.resolve(__dirname, "global.css"),
  configPath: path.resolve(__dirname, "tailwind.config.js"),
});
