import type { Config } from "jest";

const config: Config = {
  rootDir: ".",
  testEnvironment: "node",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  testRegex: ".*\\.spec\\.ts$",
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: {
    "^@kagu/contracts$": "<rootDir>/../../packages/contracts/src/index.ts"
  }
};

export default config;

