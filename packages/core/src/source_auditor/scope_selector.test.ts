// Blueprint: packages/blueprints/03_products/core/specs/modules/source_auditor/source_auditor_module.md
// Sections: §4.1 (EARS-A1 to EARS-A5)
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ScopeSelector } from "./scope_selector";
import { FsFileLister } from "../file_lister";

describe("ScopeSelector", () => {
  let tempDir: string;
  let selector: ScopeSelector;

  beforeEach(async () => {
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

    // Create ScopeSelector with FsFileLister pointing to tempDir
    const fileLister = new FsFileLister({ cwd: tempDir });
    selector = new ScopeSelector({ fileLister });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("4.1. Scope Selection (EARS-A1 to EARS-A5)", () => {
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

    it("[EARS-A4] should only scan changed files when changedSince is set", async () => {
      // Create mock GitModule
      const mockGitModule = {
        exec: jest.fn()
          .mockResolvedValueOnce({
            // git diff --name-only
            exitCode: 0,
            stdout: "src/app.ts\n",
            stderr: ""
          })
          .mockResolvedValueOnce({
            // git status --porcelain
            exitCode: 0,
            stdout: "",
            stderr: ""
          })
          .mockResolvedValueOnce({
            // git ls-files --others
            exitCode: 0,
            stdout: "",
            stderr: ""
          })
      };

      // Create ScopeSelector with GitModule
      const fileLister = new FsFileLister({ cwd: tempDir });
      const selectorWithGit = new ScopeSelector({
        fileLister,
        gitModule: mockGitModule as any
      });

      const files = await selectorWithGit.selectFiles(
        { include: ["**/*.ts"], exclude: ["node_modules/**"], changedSince: "abc123" },
        tempDir
      );

      // Should only return files that are both changed AND match patterns
      expect(files).toContain("src/app.ts");
      expect(files).not.toContain("src/utils.ts"); // Not in git diff output
      expect(mockGitModule.exec).toHaveBeenCalledWith('git', ['diff', '--name-only', 'abc123..HEAD']);
    });

    it("[EARS-A5] should automatically respect .gitignore patterns", async () => {
      // Create .gitignore file
      fs.writeFileSync(path.join(tempDir, ".gitignore"), "dist/\nnode_modules/\n*.log");

      // Create files that should be ignored
      fs.writeFileSync(path.join(tempDir, "src", "debug.log"), "log content");

      // Create new selector to pick up .gitignore
      const fileLister = new FsFileLister({ cwd: tempDir });
      const selectorWithGitignore = new ScopeSelector({ fileLister });

      const files = await selectorWithGitignore.selectFiles(
        { include: ["**/*"], exclude: [] },
        tempDir
      );

      // Should exclude files matching .gitignore patterns
      expect(files).not.toContain("dist/bundle.js");
      expect(files).not.toContain("node_modules/lib/pkg.ts");
      expect(files).not.toContain("src/debug.log");

      // Should include files not in .gitignore
      expect(files).toContain("src/app.ts");
      expect(files).toContain("src/utils.ts");
    });
  });
});
