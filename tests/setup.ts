import fs from "node:fs";
import path from "node:path";

const testDbPath = path.join("/tmp", `agentic-mvp-test-${process.pid}.db`);
process.env.APP_DB_PATH = testDbPath;

beforeEach(() => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  vi.resetModules();
});

afterAll(() => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});
