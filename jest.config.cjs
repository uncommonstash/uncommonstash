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
    // Automatic JSX runtime to match tsconfig.json ("jsx": "react-jsx")
    // and Vite — components must not need `import React` in scope.
    "^.+\\.(js|jsx|ts|tsx)$": [
      "@swc/jest",
      { jsc: { transform: { react: { runtime: "automatic" } } } },
    ],
  },
  testPathIgnorePatterns: [
    "<rootDir>/e2e/",
    "<rootDir>/node_modules/",
    "<rootDir>/dist/",
  ],
  testMatch: ["**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],
};
