module.exports = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^react$": "<rootDir>/node_modules/react",
    "\\.(css|less|scss|sass)$": "<rootDir>/__mocks__/styleMock.js",
    "^@ffmpeg/ffmpeg$": "<rootDir>/__mocks__/ffmpeg.js",
  },
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": "@swc/jest",
  },
  testPathIgnorePatterns: [
    "<rootDir>/e2e/",
    "<rootDir>/node_modules/",
    "<rootDir>/dist/",
  ],
  testMatch: ["**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],
};
