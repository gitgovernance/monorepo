## [1.1.0](https://github.com/gitgovernance/monorepo/compare/v1.0.0...v1.1.0) (2025-10-03)


### 🚀 Features

* **cicd:** separate release workflows for cli and core packages ([631046a](https://github.com/gitgovernance/monorepo/commit/631046a017ccfeecefbdeb2f89a221e626d616cf))


### 🐛 Bug Fixes

* **cicd:** add build:ci script to build core without blueprints ([49d2d35](https://github.com/gitgovernance/monorepo/commit/49d2d3522c722e798b070916415577665f16df61)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** upgrade pnpm to v9 to enable pre/post scripts by default ([673240e](https://github.com/gitgovernance/monorepo/commit/673240e330bb0fa0a412ab27383966aa7a27eac6))
* **cicd:** use standard build for core (prebuild doesn't need blueprints) ([a1760ba](https://github.com/gitgovernance/monorepo/commit/a1760ba789014fae8e7f89e43812f5c184019a16))
* **cli:** update core dependency to use fixed v1.0.2 ([#24](https://github.com/gitgovernance/monorepo/issues/24)) ([418a39a](https://github.com/gitgovernance/monorepo/commit/418a39a742152a6ab3c816e2643dafcab898ef24)), closes [#1759460529](https://github.com/gitgovernance/monorepo/issues/1759460529)
* **core:** commit schemas/index.ts barrel export ([50724da](https://github.com/gitgovernance/monorepo/commit/50724dab1c87a891e0d2d6cac92d08af532cd121))
* **core:** execute prebuild explicitly in build script ([0080536](https://github.com/gitgovernance/monorepo/commit/00805361b12bf4d8e017196d2c807f43bef71d8b))
* **core:** normalize repository url format for npm ([452b2c6](https://github.com/gitgovernance/monorepo/commit/452b2c69b785e1e0b737673f0cb8082de618c060))
* **core:** use tsup for proper ES modules compilation ([#22](https://github.com/gitgovernance/monorepo/issues/22)) ([e3d755f](https://github.com/gitgovernance/monorepo/commit/e3d755f0e01637dda01074f590ef0387a9fce5f2)), closes [#1759460529](https://github.com/gitgovernance/monorepo/issues/1759460529)

## 1.0.0 (2025-10-01)


### 🚀 Features

* add core packages and CLI implementation ([5904320](https://github.com/gitgovernance/monorepo/commit/5904320debdb385f8eb56f4dab76aefeffd9dc08))
* add project configuration files ([38dd8b6](https://github.com/gitgovernance/monorepo/commit/38dd8b6f51e8f34dbeb7379cebe1f1c5f2ad1304))
* **cli:** enhance task command help with step-by-step workflow guide [task:1758573661-task-enhance-task-command-help-with-step-by-step-workfl] ([#6](https://github.com/gitgovernance/monorepo/issues/6)) ([2c7e1aa](https://github.com/gitgovernance/monorepo/commit/2c7e1aa03ea17387be5210809420252646dfe5cd))
* **cli:** implement GitGovernance CLI installer for Cloudflare Pages ([#17](https://github.com/gitgovernance/monorepo/issues/17)) ([64f5873](https://github.com/gitgovernance/monorepo/commit/64f58736b12cfdb84a43543f9a21872b874eb840))
* **cli:** implement hybrid release architecture ([#20](https://github.com/gitgovernance/monorepo/issues/20)) ([c38dc28](https://github.com/gitgovernance/monorepo/commit/c38dc28e8eaf984bf305f1fdb592befb4fc6e5bf)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096) [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cli:** implement TUI dashboard navigation and diagram watch mode [task:1758544872-task-complete-vim-style-navigation-in-dashboard-tui] ([#8](https://github.com/gitgovernance/monorepo/issues/8)) ([22088b2](https://github.com/gitgovernance/monorepo/commit/22088b27dad6b775cc75b6532c9477164d2b4dbb))
* enhance task cancellation with review rejection support ([#1](https://github.com/gitgovernance/monorepo/issues/1)) ([cf56c0d](https://github.com/gitgovernance/monorepo/commit/cf56c0dab7b9b45256737f5f0df92b88508efe12))


### 🐛 Bug Fixes

* **cicd:** add workflow file to release trigger paths ([137ec45](https://github.com/gitgovernance/monorepo/commit/137ec45e9656846c8b7bc3219eea9d59be472151)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** pass NPM_TOKEN to setup-node step ([83b6316](https://github.com/gitgovernance/monorepo/commit/83b631658f3653d13725f7dcb746d3a83ac871d9)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** remove core build step from CLI release workflow ([937bdce](https://github.com/gitgovernance/monorepo/commit/937bdce18ee9488709ddeb86f317f7c790b2634e)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** run prebuild before tsc for core ([7c7deb9](https://github.com/gitgovernance/monorepo/commit/7c7deb97153cc493862273b835755fb55445796a)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** skip prebuild in CI for core package ([40f2509](https://github.com/gitgovernance/monorepo/commit/40f250907f6bf2c90fda7a6e6a3d3de03057bd90)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** switch from OIDC to NPM_TOKEN for authentication ([f7c4ab1](https://github.com/gitgovernance/monorepo/commit/f7c4ab17be57907c2702d6992b6930c7503e162d)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** temporarily disable tests in release workflow ([f3769dd](https://github.com/gitgovernance/monorepo/commit/f3769dd536e91b68ace352799bd8a7836a24cd9f)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** use no-frozen-lockfile for pnpm install in CI ([b22d076](https://github.com/gitgovernance/monorepo/commit/b22d076ce35842d446cbcbd9c55a0102259d656e)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** use tsc directly instead of pnpm build for core ([918c424](https://github.com/gitgovernance/monorepo/commit/918c424b0231fa57ea46f0a07d36c29f02080d96)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cli:** add @gitgov/core as external dependency in build ([6058431](https://github.com/gitgovernance/monorepo/commit/6058431f707c2c9d060eaf5946ad6eb5652c116a)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cli:** improve build system and release script compatibility (v1.0.4) ([#16](https://github.com/gitgovernance/monorepo/issues/16)) ([708ad4f](https://github.com/gitgovernance/monorepo/commit/708ad4f8aca91827a76021cb27a940a8fe0d3256))
* **core:** include archived tasks in health calculation to prevent drops ([#3](https://github.com/gitgovernance/monorepo/issues/3)) ([b3c3aed](https://github.com/gitgovernance/monorepo/commit/b3c3aedd94416a30a984ed482ad581ee4ab820e9))
* **core:** remove unnecessary underscore changes, keep only archived tasks fix [task:1758539111-task-fix-health-calculation-to-include-archived-tasks] ([#4](https://github.com/gitgovernance/monorepo/issues/4)) ([4aa4123](https://github.com/gitgovernance/monorepo/commit/4aa41237c9398b204b3b969b38a386af86ebe927))
* **core:** use TaskRecord.title for diagram node labels ([#2](https://github.com/gitgovernance/monorepo/issues/2)) ([8b5cd4a](https://github.com/gitgovernance/monorepo/commit/8b5cd4a3e48519a2bd5dd46e532f74d546ca60a2))


### ♻️ Refactoring

* **cli:** remove binary distribution and focus on npm-only approach ([#19](https://github.com/gitgovernance/monorepo/issues/19)) ([9d17f9b](https://github.com/gitgovernance/monorepo/commit/9d17f9b21f42093db126a5f6603b8d239df8e76b))
* **core:** complete architectural refactor and packaging for v1.0.2 ([#10](https://github.com/gitgovernance/monorepo/issues/10)) ([0353be3](https://github.com/gitgovernance/monorepo/commit/0353be381b3b81a53bbd876ae52aeb2c08e6bb39))
* **core:** rename cancelTask to discardTask for semantic consistency [task:1758586684-task-implement-discardtask-method] ([#7](https://github.com/gitgovernance/monorepo/issues/7)) ([01f1a6a](https://github.com/gitgovernance/monorepo/commit/01f1a6a2792b038411ba577fbaa60fbd39d5b2b7))


### 📚 Documentation

* add project documentation ([4ba5fe6](https://github.com/gitgovernance/monorepo/commit/4ba5fe628b797fcc15afad6142a01466a36d7818))
* **core:** prepare core package for NPM publication ([#11](https://github.com/gitgovernance/monorepo/issues/11)) ([ab58387](https://github.com/gitgovernance/monorepo/commit/ab5838727577b28b3d579a08e444892318475d76))
* **docs:** unified Git/GitHub agent with robust workflow ([#9](https://github.com/gitgovernance/monorepo/issues/9)) ([69053bf](https://github.com/gitgovernance/monorepo/commit/69053bfb88914eb99ddaecd8e68d9fd4e2bd5881))
