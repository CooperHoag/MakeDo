const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const testPatterns = [
  /.*\.(test|spec)\.(ts|tsx|js|jsx)$/,
  /.*\/__(tests|mocks)__\/.*/,
];

const existing = config.resolver.blockList;
const existingArray = existing
  ? Array.isArray(existing)
    ? existing
    : [existing]
  : [];

config.resolver.blockList = [...existingArray, ...testPatterns];

module.exports = config;
