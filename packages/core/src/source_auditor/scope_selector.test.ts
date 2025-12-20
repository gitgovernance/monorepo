import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ScopeSelector } from "./scope_selector";

describe("ScopeSelector", () => {
  let tempDir: string;
  let selector: ScopeSelector;

  beforeEach(async () => {
    selector = new ScopeSelector();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scope-selector-test-"));

    // Create test file structure
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "node_modules", "lib"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "dist"), { recursive: true });

    fs.writeFileSync(path.join(tempDir, "src", "app.ts"), "// app");
    fs.writeFileSync(path.join(tempDir, "src", "utils.ts"), "// utils");
    fs.writeFileSync(path.join(tempDir, "src", "index.js"), "// index");
    fs.writeFileSync(path.join(tempDir, "node_modules", "lib", "pkg.ts"), "// pkg");
    fs.writeFileSync(path.join(tempDir, "dist", "bundle.js"), "// bundle");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("4.1. Scope Selection (EARS-A1 to EARS-A3)", () => {
    it("[EARS-A1] should select files matching include globs", async () => {
      const files = await selector.selectFiles(
        { include: ["**/*.ts"], exclude: [] },
        tempDir
      );

      expect(files).toContain("src/app.ts");
      expect(files).toContain("src/utils.ts");
      expect(files).not.toContain("src/index.js");
    });

    it("[EARS-A2] should exclude files matching exclude globs", async () => {
      const files = await selector.selectFiles(
        { include: ["**/*.ts"], exclude: ["node_modules/**"] },
        tempDir
      );

      expect(files).toContain("src/app.ts");
      expect(files).toContain("src/utils.ts");
      expect(files).not.toContain("node_modules/lib/pkg.ts");
    });

    it("[EARS-A3] should return empty result when include is empty", async () => {
      const files = await selector.selectFiles(
        { include: [], exclude: [] },
        tempDir
      );

      expect(files).toHaveLength(0);
    });

    it("should support multiple include patterns", async () => {
      const files = await selector.selectFiles(
        { include: ["**/*.ts", "**/*.js"], exclude: ["node_modules/**", "dist/**"] },
        tempDir
      );

      expect(files).toContain("src/app.ts");
      expect(files).toContain("src/utils.ts");
      expect(files).toContain("src/index.js");
      expect(files).not.toContain("dist/bundle.js");
    });

    it("should return sorted file paths", async () => {
      const files = await selector.selectFiles(
        { include: ["**/*.ts"], exclude: ["node_modules/**"] },
        tempDir
      );

      const sorted = [...files].sort();
      expect(files).toEqual(sorted);
    });
  });
});
