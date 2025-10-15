## [1.3.0](https://github.com/gitgovernance/monorepo/compare/core-v1.2.0...core-v1.3.0) (2025-10-15)


### ✨ Features

* **cli/task:** implement long description support with --description-file flag ([#36](https://github.com/gitgovernance/monorepo/issues/36)) ([dd46f82](https://github.com/gitgovernance/monorepo/commit/dd46f82f7918fd93e624fb2363eb44008663330d))
* **cli:** add task delete command with interactive dashboard modal ([#34](https://github.com/gitgovernance/monorepo/issues/34)) ([f43f8a0](https://github.com/gitgovernance/monorepo/commit/f43f8a0e3e28dc63b699bd81f2bab9987cff062a)), closes [#1760017977](https://github.com/gitgovernance/monorepo/issues/1760017977)


### 🐛 Bug Fixes

* **cicd:** run tests before semantic-release to prevent faulty publishes ([f2f04d4](https://github.com/gitgovernance/monorepo/commit/f2f04d46d235d2a8dff6d4d6f1a0c719d90f8866))
* **cli:** translate status command output to English ([#35](https://github.com/gitgovernance/monorepo/issues/35)) ([626884e](https://github.com/gitgovernance/monorepo/commit/626884ef5c2fbb1f4da2419322ff96c7c4b36959)), closes [#1758572792](https://github.com/gitgovernance/monorepo/issues/1758572792)
* **cli:** use compiled CLI instead of tsx in E2E tests ([7259b96](https://github.com/gitgovernance/monorepo/commit/7259b96b6561c931d5e6c43ac59ed6e1632e1f0a))
* **core:** resolve duplicate task display in personal status view ([#37](https://github.com/gitgovernance/monorepo/issues/37)) ([b1bb3b4](https://github.com/gitgovernance/monorepo/commit/b1bb3b430fc8ba074ce174db3ac28c0f759d6047)), closes [#1758573347](https://github.com/gitgovernance/monorepo/issues/1758573347)

## [1.2.0](https://github.com/gitgovernance/monorepo/compare/core-v1.1.0...core-v1.2.0) (2025-10-13)


### ✨ Features

* **cli:** add task pause and resume commands ([#32](https://github.com/gitgovernance/monorepo/issues/32)) ([181485e](https://github.com/gitgovernance/monorepo/commit/181485eadb1b8dcb9f8fb96c62cb98cd227afc92)), closes [#1758587001](https://github.com/gitgovernance/monorepo/issues/1758587001) [#1758587002](https://github.com/gitgovernance/monorepo/issues/1758587002)
* **core:** add deleteTask for draft tasks with educational errors ([#33](https://github.com/gitgovernance/monorepo/issues/33)) ([e70ccd4](https://github.com/gitgovernance/monorepo/commit/e70ccd474d4d876922a26a0ef8b7bf8860246576)), closes [#1760017977](https://github.com/gitgovernance/monorepo/issues/1760017977)

## [1.1.0](https://github.com/gitgovernance/monorepo/compare/core-v1.0.2...core-v1.1.0) (2025-10-09)


### ✨ Features

* **cli,core:** add cycle remove-task and move-task commands ([#29](https://github.com/gitgovernance/monorepo/issues/29)) ([a2f2ba8](https://github.com/gitgovernance/monorepo/commit/a2f2ba8acc69aedef51d4043b4fc69f83859d3f2)), closes [#1758521733](https://github.com/gitgovernance/monorepo/issues/1758521733)
* **cli:** add --show-archived flag to diagram command ([#26](https://github.com/gitgovernance/monorepo/issues/26)) ([0126746](https://github.com/gitgovernance/monorepo/commit/0126746c1e69457d42a46b383d9de1f84f508f21)), closes [#1758517322](https://github.com/gitgovernance/monorepo/issues/1758517322)
* **cli:** add task details modal to Dashboard TUI ([#28](https://github.com/gitgovernance/monorepo/issues/28)) ([e52e129](https://github.com/gitgovernance/monorepo/commit/e52e129b033cbef2e5c9e2df5fef36b2770f8273)), closes [#1759487663](https://github.com/gitgovernance/monorepo/issues/1759487663)
* **core:** add task pause/resume and fix init actor roles ([#31](https://github.com/gitgovernance/monorepo/issues/31)) ([5aab230](https://github.com/gitgovernance/monorepo/commit/5aab2308f374fd513de6ba5a994a0f169a6f93d9)), closes [#1758587001](https://github.com/gitgovernance/monorepo/issues/1758587001) [#1758587002](https://github.com/gitgovernance/monorepo/issues/1758587002) [#1759983132](https://github.com/gitgovernance/monorepo/issues/1759983132)


### 🐛 Bug Fixes

* **cli:** add JSON schema to semantic-release config for better IDE support ([0709dde](https://github.com/gitgovernance/monorepo/commit/0709ddecf92723032ddf9fe01f673a615c078e36))
* **cli:** configure Jest to resolve @gitgov/core from workspace ([#25](https://github.com/gitgovernance/monorepo/issues/25)) ([bf01f58](https://github.com/gitgovernance/monorepo/commit/bf01f588fce67b806637ea86d49ea29e332f4876)), closes [#1759460529](https://github.com/gitgovernance/monorepo/issues/1759460529)
* **cli:** configure tagFormat in semantic-release to prevent version downgrades ([17f719b](https://github.com/gitgovernance/monorepo/commit/17f719b17d80dfd7f0b29abf4431e9c253b444d7))
* **cli:** resolve dashboard TUI dynamic require error ([#30](https://github.com/gitgovernance/monorepo/issues/30)) ([687bb2c](https://github.com/gitgovernance/monorepo/commit/687bb2cf619a16264a954ca130f045bca91460a9)), closes [#1759918556](https://github.com/gitgovernance/monorepo/issues/1759918556)
* **cli:** update core dependency to use fixed v1.0.2 ([#24](https://github.com/gitgovernance/monorepo/issues/24)) ([418a39a](https://github.com/gitgovernance/monorepo/commit/418a39a742152a6ab3c816e2643dafcab898ef24)), closes [#1759460529](https://github.com/gitgovernance/monorepo/issues/1759460529)

## [1.0.2](https://github.com/gitgovernance/monorepo/compare/core-v1.0.1...core-v1.0.2) (2025-10-03)


### 🐛 Bug Fixes

* **core:** normalize repository url format for npm ([452b2c6](https://github.com/gitgovernance/monorepo/commit/452b2c69b785e1e0b737673f0cb8082de618c060))

## [1.0.1](https://github.com/gitgovernance/monorepo/compare/core-v1.0.0...core-v1.0.1) (2025-10-03)


### 🐛 Bug Fixes

* **core:** use tsup for proper ES modules compilation ([#22](https://github.com/gitgovernance/monorepo/issues/22)) ([e3d755f](https://github.com/gitgovernance/monorepo/commit/e3d755f0e01637dda01074f590ef0387a9fce5f2)), closes [#1759460529](https://github.com/gitgovernance/monorepo/issues/1759460529)

## 1.0.0 (2025-10-01)


### ✨ Features

* add core packages and CLI implementation ([5904320](https://github.com/gitgovernance/monorepo/commit/5904320debdb385f8eb56f4dab76aefeffd9dc08))
* add project configuration files ([38dd8b6](https://github.com/gitgovernance/monorepo/commit/38dd8b6f51e8f34dbeb7379cebe1f1c5f2ad1304))
* **cicd:** separate release workflows for cli and core packages ([631046a](https://github.com/gitgovernance/monorepo/commit/631046a017ccfeecefbdeb2f89a221e626d616cf))
* **cli:** enhance task command help with step-by-step workflow guide [task:1758573661-task-enhance-task-command-help-with-step-by-step-workfl] ([#6](https://github.com/gitgovernance/monorepo/issues/6)) ([2c7e1aa](https://github.com/gitgovernance/monorepo/commit/2c7e1aa03ea17387be5210809420252646dfe5cd))
* **cli:** implement GitGovernance CLI installer for Cloudflare Pages ([#17](https://github.com/gitgovernance/monorepo/issues/17)) ([64f5873](https://github.com/gitgovernance/monorepo/commit/64f58736b12cfdb84a43543f9a21872b874eb840))
* **cli:** implement hybrid release architecture ([#20](https://github.com/gitgovernance/monorepo/issues/20)) ([c38dc28](https://github.com/gitgovernance/monorepo/commit/c38dc28e8eaf984bf305f1fdb592befb4fc6e5bf)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096) [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cli:** implement TUI dashboard navigation and diagram watch mode [task:1758544872-task-complete-vim-style-navigation-in-dashboard-tui] ([#8](https://github.com/gitgovernance/monorepo/issues/8)) ([22088b2](https://github.com/gitgovernance/monorepo/commit/22088b27dad6b775cc75b6532c9477164d2b4dbb))
* enhance task cancellation with review rejection support ([#1](https://github.com/gitgovernance/monorepo/issues/1)) ([cf56c0d](https://github.com/gitgovernance/monorepo/commit/cf56c0dab7b9b45256737f5f0df92b88508efe12))


### 🐛 Bug Fixes

* **cicd:** add build:ci script to build core without blueprints ([49d2d35](https://github.com/gitgovernance/monorepo/commit/49d2d3522c722e798b070916415577665f16df61)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** add workflow file to release trigger paths ([137ec45](https://github.com/gitgovernance/monorepo/commit/137ec45e9656846c8b7bc3219eea9d59be472151)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** pass NPM_TOKEN to setup-node step ([83b6316](https://github.com/gitgovernance/monorepo/commit/83b631658f3653d13725f7dcb746d3a83ac871d9)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** remove core build step from CLI release workflow ([937bdce](https://github.com/gitgovernance/monorepo/commit/937bdce18ee9488709ddeb86f317f7c790b2634e)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** run prebuild before tsc for core ([7c7deb9](https://github.com/gitgovernance/monorepo/commit/7c7deb97153cc493862273b835755fb55445796a)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** skip prebuild in CI for core package ([40f2509](https://github.com/gitgovernance/monorepo/commit/40f250907f6bf2c90fda7a6e6a3d3de03057bd90)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** switch from OIDC to NPM_TOKEN for authentication ([f7c4ab1](https://github.com/gitgovernance/monorepo/commit/f7c4ab17be57907c2702d6992b6930c7503e162d)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** temporarily disable tests in release workflow ([f3769dd](https://github.com/gitgovernance/monorepo/commit/f3769dd536e91b68ace352799bd8a7836a24cd9f)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** upgrade pnpm to v9 to enable pre/post scripts by default ([673240e](https://github.com/gitgovernance/monorepo/commit/673240e330bb0fa0a412ab27383966aa7a27eac6))
* **cicd:** use no-frozen-lockfile for pnpm install in CI ([b22d076](https://github.com/gitgovernance/monorepo/commit/b22d076ce35842d446cbcbd9c55a0102259d656e)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cicd:** use standard build for core (prebuild doesn't need blueprints) ([a1760ba](https://github.com/gitgovernance/monorepo/commit/a1760ba789014fae8e7f89e43812f5c184019a16))
* **cicd:** use tsc directly instead of pnpm build for core ([918c424](https://github.com/gitgovernance/monorepo/commit/918c424b0231fa57ea46f0a07d36c29f02080d96)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cli:** add @gitgov/core as external dependency in build ([6058431](https://github.com/gitgovernance/monorepo/commit/6058431f707c2c9d060eaf5946ad6eb5652c116a)), closes [#1759283096](https://github.com/gitgovernance/monorepo/issues/1759283096)
* **cli:** improve build system and release script compatibility (v1.0.4) ([#16](https://github.com/gitgovernance/monorepo/issues/16)) ([708ad4f](https://github.com/gitgovernance/monorepo/commit/708ad4f8aca91827a76021cb27a940a8fe0d3256))
* **core:** commit schemas/index.ts barrel export ([50724da](https://github.com/gitgovernance/monorepo/commit/50724dab1c87a891e0d2d6cac92d08af532cd121))
* **core:** execute prebuild explicitly in build script ([0080536](https://github.com/gitgovernance/monorepo/commit/00805361b12bf4d8e017196d2c807f43bef71d8b))
* **core:** include archived tasks in health calculation to prevent drops ([#3](https://github.com/gitgovernance/monorepo/issues/3)) ([b3c3aed](https://github.com/gitgovernance/monorepo/commit/b3c3aedd94416a30a984ed482ad581ee4ab820e9))
* **core:** remove unnecessary underscore changes, keep only archived tasks fix [task:1758539111-task-fix-health-calculation-to-include-archived-tasks] ([#4](https://github.com/gitgovernance/monorepo/issues/4)) ([4aa4123](https://github.com/gitgovernance/monorepo/commit/4aa41237c9398b204b3b969b38a386af86ebe927))
* **core:** use TaskRecord.title for diagram node labels ([#2](https://github.com/gitgovernance/monorepo/issues/2)) ([8b5cd4a](https://github.com/gitgovernance/monorepo/commit/8b5cd4a3e48519a2bd5dd46e532f74d546ca60a2))


### ♻️ Refactoring

* **cli:** remove binary distribution and focus on npm-only approach ([#19](https://github.com/gitgovernance/monorepo/issues/19)) ([9d17f9b](https://github.com/gitgovernance/monorepo/commit/9d17f9b21f42093db126a5f6603b8d239df8e76b))
* **core:** complete architectural refactor and packaging for v1.0.2 ([#10](https://github.com/gitgovernance/monorepo/issues/10)) ([0353be3](https://github.com/gitgovernance/monorepo/commit/0353be381b3b81a53bbd876ae52aeb2c08e6bb39))
* **core:** rename cancelTask to discardTask for semantic consistency [task:1758586684-task-implement-discardtask-method] ([#7](https://github.com/gitgovernance/monorepo/issues/7)) ([01f1a6a](https://github.com/gitgovernance/monorepo/commit/01f1a6a2792b038411ba577fbaa60fbd39d5b2b7))


### 📝 Documentation

* add project documentation ([4ba5fe6](https://github.com/gitgovernance/monorepo/commit/4ba5fe628b797fcc15afad6142a01466a36d7818))
* **core:** prepare core package for NPM publication ([#11](https://github.com/gitgovernance/monorepo/issues/11)) ([ab58387](https://github.com/gitgovernance/monorepo/commit/ab5838727577b28b3d579a08e444892318475d76))
* **docs:** unified Git/GitHub agent with robust workflow ([#9](https://github.com/gitgovernance/monorepo/issues/9)) ([69053bf](https://github.com/gitgovernance/monorepo/commit/69053bfb88914eb99ddaecd8e68d9fd4e2bd5881))
