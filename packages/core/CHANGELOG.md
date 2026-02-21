## [2.6.0](https://github.com/gitgovernance/monorepo/compare/core-v2.5.0...core-v2.6.0) (2026-02-21)


### ✨ Features

* **cli:** add exec, feedback, actor commands and init --type extension ([16badb9](https://github.com/gitgovernance/monorepo/commit/16badb9af5ccb768b7c6f65dd7119f4dcdedde4a))
* **core:** extend ProjectAdapter type support and export TransitionRule ([787a32a](https://github.com/gitgovernance/monorepo/commit/787a32a54fe945e82dc71ecfa94160a7e1b53240))
* **mcp-server:** add execution, agent, identity, workflow tools ([414bf5d](https://github.com/gitgovernance/monorepo/commit/414bf5d51fc02745eea62cc772dac9e3890e12c4))


### ♻️ Refactoring

* **cli:** align init E2E test EARS naming with blueprint ([6138ad6](https://github.com/gitgovernance/monorepo/commit/6138ad6c607f19ce620fc93dad57449983fcfdbe))

## [2.5.0](https://github.com/gitgovernance/monorepo/compare/core-v2.4.0...core-v2.5.0) (2026-02-19)


### ✨ Features

* **mcp-server:** add @gitgov/mcp-server package with 36 tools ([f350130](https://github.com/gitgovernance/monorepo/commit/f350130a1656aa067b0326113ef81f5042373960))
* **mcp-server:** add 3-level test pyramid (175 tests) + coherence fixes ([2bd92f6](https://github.com/gitgovernance/monorepo/commit/2bd92f68c911a2de430de04a70e7fd4b8dfe7211))


### 🐛 Bug Fixes

* **ci:** add git user config and fix tsc exec syntax ([a4a5023](https://github.com/gitgovernance/monorepo/commit/a4a5023da447332b7b6add05e889e7e6b74e68d7))
* **ci:** align Node.js version to 24 per .nvmrc ([d6e7eee](https://github.com/gitgovernance/monorepo/commit/d6e7eeef914ff17784485cdfb4d46dd572379fc2))
* **ci:** build core before typecheck for type resolution ([388f8cf](https://github.com/gitgovernance/monorepo/commit/388f8cfe1e5b79fc8977afa3facc9cdc5fea1a7b))
* **ci:** resolve 3 CI failures — typecheck, git defaults, build order ([54278f3](https://github.com/gitgovernance/monorepo/commit/54278f3f1093ee9c12a2e7348208e74c5fae6e87))
* **mcp-server:** align FsKeyProvider with core v2.4.0 API ([d26bdba](https://github.com/gitgovernance/monorepo/commit/d26bdba3ecffcb6ebd55efd5563e4c774d914faa))
* **mcp-server:** remove all `any` types, fix type mismatches, EARS coherence ([5472926](https://github.com/gitgovernance/monorepo/commit/5472926b4d193e49e8d651d373ca2c3e7ec73761))
* **mcp-server:** resolve MSRV-E naming collision, update test counts ([a73fe2d](https://github.com/gitgovernance/monorepo/commit/a73fe2de76593da614bda8ccf81100c0fa48bbec))


### 📝 Documentation

* **mcp-server:** improve README coherence with implementation ([f94fc4f](https://github.com/gitgovernance/monorepo/commit/f94fc4f48c89f8c3b85bf47b1d16557d9ca29d5f))

## [2.4.0](https://github.com/gitgovernance/monorepo/compare/core-v2.3.0...core-v2.4.0) (2026-02-16)


### ✨ Features

* **cli:** add actor commands + move key storage to .gitgov/keys/ ([cd7f035](https://github.com/gitgovernance/monorepo/commit/cd7f035fa26aef7e0b051ce689599867a29cc874))
* **cli:** add sync status intelligence to dashboard + update pull messaging ([ee27a34](https://github.com/gitgovernance/monorepo/commit/ee27a346fb269936ae11ed181e52c227ed2716e8))
* **cli:** integrate worktree-based sync into DI, init, and sync commands ([0dcf92d](https://github.com/gitgovernance/monorepo/commit/0dcf92d5e2bc751e2ce7c555a96b10c57345244f))
* **core:** add FsWorktreeSyncStateModule — worktree-based ISyncStateModule ([b487902](https://github.com/gitgovernance/monorepo/commit/b48790232693f30d65c50d43245658a4a4c728e9))
* **core:** auto-commit before pull + preserve LOCAL_ONLY on force pull ([8e0cea6](https://github.com/gitgovernance/monorepo/commit/8e0cea6c9e997ac41bac547a3993011d8ea2dc20))

## [2.3.0](https://github.com/gitgovernance/monorepo/compare/core-v2.2.0...core-v2.3.0) (2026-02-14)


### ✨ Features

* **core:** add PrismaRecordProjection driver via @gitgov/core/prisma ([814dd3a](https://github.com/gitgovernance/monorepo/commit/814dd3a7fb10cacd01e02d38220b44bebbc7b2bc))
* **core:** rename indexer_adapter → record_projector + metrics_adapter → record_metrics ([e30e86b](https://github.com/gitgovernance/monorepo/commit/e30e86b5d3df9ce9cd74c33d7bfc0c546bc1cd9b))
* **core:** rename record_projector → record_projection + ProjectionSink → RecordProjection ([ffc0ea3](https://github.com/gitgovernance/monorepo/commit/ffc0ea34b416f4e1970184fa149b23b6e1e30790))


### 🐛 Bug Fixes

* **core:** align record_projection docs and test name with implementation ([b63cc38](https://github.com/gitgovernance/monorepo/commit/b63cc38640e802d4995a73e8f7a1f2f6beab93a7))

## [2.2.0](https://github.com/gitgovernance/monorepo/compare/core-v2.1.2...core-v2.2.0) (2026-02-13)


### ✨ Features

* **core:** GitHub API backends with Octokit DI ([#91](https://github.com/gitgovernance/monorepo/issues/91)) ([b2cc265](https://github.com/gitgovernance/monorepo/commit/b2cc2651b3a5ff9ae13f321f1838b83c09e9effb))

## [2.1.2](https://github.com/gitgovernance/monorepo/compare/core-v2.1.1...core-v2.1.2) (2026-02-04)


### 🐛 Bug Fixes

* **core:** update sync-prompts.ts path to private/packages/blueprints ([f0ea727](https://github.com/gitgovernance/monorepo/commit/f0ea7271ff1ca6b9e0b6a9aa059ca35df77dc6e9))

## [2.1.1](https://github.com/gitgovernance/monorepo/compare/core-v2.1.0...core-v2.1.1) (2026-02-04)


### ♻️ Refactoring

* **workflow:** remove view_configs, fix sync script paths, update private submodule ([63d15ee](https://github.com/gitgovernance/monorepo/commit/63d15ee7e0cbd4bc532c3b33f2f14421651acb86))

## [2.1.0](https://github.com/gitgovernance/monorepo/compare/core-v2.0.0...core-v2.1.0) (2026-02-04)


### ✨ Features

* consolidate private packages into single submodule ([b1f032b](https://github.com/gitgovernance/monorepo/commit/b1f032b59d0a4963e72f4115114b5fa2308b10a6))


### 🐛 Bug Fixes

* **cli:** pin @gitgov/core dependency to ^2.0.0 ([1d7a662](https://github.com/gitgovernance/monorepo/commit/1d7a6629f1d1a69514f68af143b90b5eca3c9b85))

## [2.0.0](https://github.com/gitgovernance/monorepo/compare/core-v1.13.0...core-v2.0.0) (2026-02-02)


### ⚠ BREAKING CHANGES

* **epic:** IndexerAdapter now requires cacheStore: Store<IndexData>
instead of deprecated cacheStrategy/cachePath/cacheSize options.

Core (Triad 1 - indexer_adapter):
- Remove FileIndexerAdapter, use IndexerAdapter with Store<T>
- Make cacheStore REQUIRED dependency (no backward compatibility)
- Remove backup mechanism (EARS-14) - cache is regenerable data
- Simplify cache operations via Store.put/get/delete/exists
- Update all 77 tests to use mock cacheStore

CLI (Triad 2 - indexer-command):
- Remove cacheSize/cacheStrategy handling from output formatting
- Update tests to match simplified report structure (34 tests)

Store:
- Export IndexData type for external usage

Audit: Both triads verified coherent (Blueprint ↔ Code ↔ Tests)

* feat(cli): add dependency_injection_module blueprint and update tests

Triad 3 - DependencyInjectionService:
- New blueprint following module_designer_v2 template
- Update test EARS naming to block format (A1-A2, B1-B4, etc.)
- Add EARS-F1 test for validation when .gitgov exists
- 10 tests passing, 19 EARS total in blueprint

EARS coverage:
- Singleton (A1-A2): ✅ Complete
- Store Init (B1-B4): 🟡 2/4
- Adapter Factories (C1-C8): 🟡 2/8
- Bootstrap Reindex (D1-D2): ✅ Complete
- Error Handling (E1-E4): 🟡 2/4
- Validation (F1-F2): ✅ Complete

* test(cli): remove deprecated cache fields from test mocks

Remove cacheStrategy and cacheSize from IndexGenerationReport mocks
in dashboard and task command tests. These fields were removed as
part of the Store abstraction migration.

* refactor: migrate agent prompts to blueprints submodule

- Move docs/gitgov_agent_prompt.md → blueprints/02_agents/design/gitgov_agent.md
- Rename packages/core/prompts/gitgov_agent_prompt.md → gitgov_agent.md
- Update sync-prompts.ts to use new location in blueprints

This consolidates all agent definitions in the blueprints submodule.

* docs(core,cli): standardize README sections

- Add Contributing, Security, Community, License, Links sections to both
- Remove redundant implementation status sections from CLI README
- Align footer format across packages

* chore: update blueprints submodule

* refactor(core): normalize EARS IDs in ConfigManager triada

Normalized all EARS IDs from numeric to letter-block format across
Blueprint, Code, and Tests for better section association.

Changes:
- Blueprint: EARS-1..26, EARS-53 → EARS-A1..D3
- Tests: Updated all 44 test EARS references
- Code: EARS-53 → EARS-B9 (actor auto-detection)

Triada coherence verified: Blueprint ↔ Code ↔ Tests aligned.

* refactor(core,cli): migrate to createConfigManager factory function

Updated all ConfigManager instantiation from constructor to factory
function as part of ConfigStore abstraction migration.

Changes:
- IdentityAdapter: new ConfigManager() → createConfigManager()
- ContextCommand: new Config.ConfigManager() → Config.createConfigManager()
- SyncModule tests: new ConfigManager(path) → createConfigManager(path)
- DependencyInjection: new Config.ConfigManager() → Config.createConfigManager()
- Store exports: Added ConfigStore, FsConfigStore, MemoryConfigStore

Tests verified: 2349 passed.

* docs(epic): update Cycle 3 progress - ConfigManager completed

* docs(sync_module): sync triada código ↔ tests

Triada auditada y coherente:
- 58/62 EARS implementados y testeados
- 4 EARS skipped (requieren setup E2E complejo)

* docs(id): sync triadas id_generator + id_parser

id_generator:
- EARS 1-6 coherentes (generacion de IDs)

id_parser (nuevo):
- EARS A1-E2 coherentes (parsing, validacion, inferencia)
- Tests con prefijos [EARS-X]

* chore: update blueprints submodule - Progressive Disclosure epic

* refactor(lint): sync triada código ↔ tests - 37/37 EARS

- Habilitado test EARS-F2 (registros legacy sin header/payload)
- Arquitectura Store Backends: LintModule (puro) + FsLintModule (I/O)
- Todos los tests pasando (58 tests)

* chore(utils): update index exports

* feat(core): add type_guards and array_utils modules

* chore: update blueprints submodule - design docs improvements

* refactor(cli): migrate to FsLintModule architecture

- DependencyInjectionService uses FsLintModule (wrapper I/O)
- LintCommand updated for FsLintOptions/FsFixOptions types
- Tests updated for new API

* docs(epic): Cycle 3 COMPLETADO - Store Backends

* chore: add .gitmodules for blueprints submodule

Adds proper submodule configuration for packages/blueprints.

### ✨ Features

* **epic:** Store Backends - Cycles 1-3 Complete ([#81](https://github.com/gitgovernance/monorepo/issues/81)) ([acedbe1](https://github.com/gitgovernance/monorepo/commit/acedbe1e5cb2b5cba4e4437ecc363169b2937c52))


### 🐛 Bug Fixes

* **core:** separate sync from prebuild and consolidate agent prompt ([5e9c9e1](https://github.com/gitgovernance/monorepo/commit/5e9c9e19828c139a5db32038d183a0750826c42b))


### ♻️ Refactoring

* **core:** remove legacy pre-rename directories and fix MockFileListerOptions ([3d0907b](https://github.com/gitgovernance/monorepo/commit/3d0907b24e7f9c51a9f7e39dd5b06c14a59fb910))
* **core:** store backends epic — module renames, DI, triada sync ([317a764](https://github.com/gitgovernance/monorepo/commit/317a764855dafe4870a775368d3115410d315e1d))


### 📝 Documentation

* **core,cli:** rewrite package READMEs ([c63e73c](https://github.com/gitgovernance/monorepo/commit/c63e73c37c54ca4042bd2d50d3e1f83b96f39836))
* **core,cli:** update closing line in READMEs ([0e7d24e](https://github.com/gitgovernance/monorepo/commit/0e7d24e133ad6724b23a3ff8593bfa2854477a7a))
* rewrite monorepo README with updated test badges and conversational examples ([1fe14df](https://github.com/gitgovernance/monorepo/commit/1fe14df03c039d06d5c64e18576341d5a324d6f6))

## [1.13.0](https://github.com/gitgovernance/monorepo/compare/core-v1.12.0...core-v1.13.0) (2025-12-30)


### ✨ Features

* **agents:** add GDPR audit agent with formatted output ([#80](https://github.com/gitgovernance/monorepo/issues/80)) ([6fe884c](https://github.com/gitgovernance/monorepo/commit/6fe884ca803e41892db95d1d452d87d47fc3bf43))

## [1.12.0](https://github.com/gitgovernance/monorepo/compare/core-v1.11.0...core-v1.12.0) (2025-12-21)


### ✨ Features

* gitgov agent command - run, list, show ([#79](https://github.com/gitgovernance/monorepo/issues/79)) ([e59ec64](https://github.com/gitgovernance/monorepo/commit/e59ec64bca414f5fa94a6a14eae93b17d884cd56))

## [1.11.0](https://github.com/gitgovernance/monorepo/compare/core-v1.10.0...core-v1.11.0) (2025-12-20)


### ✨ Features

* gitgov audit - PII/secrets detection CLI ([#78](https://github.com/gitgovernance/monorepo/issues/78)) ([f47fbb5](https://github.com/gitgovernance/monorepo/commit/f47fbb554bb00c029c4ce649935033ab76c3eb99))


### ♻️ Refactoring

* **git:** update readme file ([e784a63](https://github.com/gitgovernance/monorepo/commit/e784a632b2bb31f395037fab994c9606dff23f20))
* **git:** update readme file ([4060922](https://github.com/gitgovernance/monorepo/commit/406092232156ca4c7e12aae7b343747e48f5e59d))

## [1.10.0](https://github.com/gitgovernance/monorepo/compare/core-v1.9.0...core-v1.10.0) (2025-12-16)


### ✨ Features

* **core:** add generic metadata support to FeedbackRecord ([#77](https://github.com/gitgovernance/monorepo/issues/77)) ([fc657c1](https://github.com/gitgovernance/monorepo/commit/fc657c109432e394042d90f6d443916e85171ddd))

## [1.9.0](https://github.com/gitgovernance/monorepo/compare/core-v1.8.3...core-v1.9.0) (2025-12-15)


### ✨ Features

* **cli:** restore original CLI description ([#75](https://github.com/gitgovernance/monorepo/issues/75)) ([323dbfd](https://github.com/gitgovernance/monorepo/commit/323dbfde376b13e6c7ea9f25966451048bf713b8))
* **cli:** simplify description ([#74](https://github.com/gitgovernance/monorepo/issues/74)) ([3deb4e7](https://github.com/gitgovernance/monorepo/commit/3deb4e7f9546d1f25ab0062e4db71e4e2754b19e))
* **cli:** update @gitgov/core dependency to ^1.8.3 ([#70](https://github.com/gitgovernance/monorepo/issues/70)) ([5161583](https://github.com/gitgovernance/monorepo/commit/5161583bd20b742be6d4843ffc1bb11add04f18c))
* **cli:** update CLI description ([#72](https://github.com/gitgovernance/monorepo/issues/72)) ([b658391](https://github.com/gitgovernance/monorepo/commit/b658391514b03cface9906c2ff5c0690fc6c5794))
* **cli:** update description wording ([#73](https://github.com/gitgovernance/monorepo/issues/73)) ([5ec571b](https://github.com/gitgovernance/monorepo/commit/5ec571bc390e2d14d69f3ca43844be01052e6bd4))
* **core:** add generic metadata support to ExecutionRecord ([#76](https://github.com/gitgovernance/monorepo/issues/76)) ([97e1421](https://github.com/gitgovernance/monorepo/commit/97e1421ce87727daea144959359eee5b3d19c34a))


### 🐛 Bug Fixes

* **cli:** use --initial-branch=main in sync e2e tests ([#71](https://github.com/gitgovernance/monorepo/issues/71)) ([59aab5c](https://github.com/gitgovernance/monorepo/commit/59aab5c713de4816dc40746b268c3187f2b99155))

## [1.8.3](https://github.com/gitgovernance/monorepo/compare/core-v1.8.2...core-v1.8.3) (2025-12-12)


### 🐛 Bug Fixes

* **core:** update type exports comment ([#69](https://github.com/gitgovernance/monorepo/issues/69)) ([5970dce](https://github.com/gitgovernance/monorepo/commit/5970dce03eadd76e697778b2f0c95c55444b03f5))

## [1.8.2](https://github.com/gitgovernance/monorepo/compare/core-v1.8.1...core-v1.8.2) (2025-12-12)


### 🐛 Bug Fixes

* **core:** update export comment ([#68](https://github.com/gitgovernance/monorepo/issues/68)) ([e5fded9](https://github.com/gitgovernance/monorepo/commit/e5fded9e794aff85a3999fbb6e3a8039b8356f0d))

## [1.8.1](https://github.com/gitgovernance/monorepo/compare/core-v1.8.0...core-v1.8.1) (2025-12-12)


### 🐛 Bug Fixes

* **core:** add tasks to SDK description in README ([#66](https://github.com/gitgovernance/monorepo/issues/66)) ([85762d3](https://github.com/gitgovernance/monorepo/commit/85762d3d331407fcb0d55af07b8e470a426b7ac5))
* **core:** update comment in index.ts ([#67](https://github.com/gitgovernance/monorepo/issues/67)) ([b20132e](https://github.com/gitgovernance/monorepo/commit/b20132e36948b5bce227ab58c1f51c58a311a4d4))

## [1.8.0](https://github.com/gitgovernance/monorepo/compare/core-v1.7.0...core-v1.8.0) (2025-12-12)


### ✨ Features

* **cli/core:** EARS-27/28/43/61 sync improvements and UX fixes ([#65](https://github.com/gitgovernance/monorepo/issues/65)) ([0d44c85](https://github.com/gitgovernance/monorepo/commit/0d44c85901959c3e95bfd7a70d8f008f767fb4df)), closes [#1763344405](https://github.com/gitgovernance/monorepo/issues/1763344405) [#1763344405](https://github.com/gitgovernance/monorepo/issues/1763344405) [#1763344405](https://github.com/gitgovernance/monorepo/issues/1763344405) [#1763344405](https://github.com/gitgovernance/monorepo/issues/1763344405) [#1763344405](https://github.com/gitgovernance/monorepo/issues/1763344405)
* **cli:** implement lint command and update core dependency ([7497d0b](https://github.com/gitgovernance/monorepo/commit/7497d0bc1eab20b8d2167bd19d992caf95c04dbb)), closes [#1762488681](https://github.com/gitgovernance/monorepo/issues/1762488681)
* **core:** implement EARS-43 and ignore .gitgov/ in work branches ([#58](https://github.com/gitgovernance/monorepo/issues/58)) ([b22b90f](https://github.com/gitgovernance/monorepo/commit/b22b90f851cd33e3ef9b2768397b49905f23acd7)), closes [#1763344405](https://github.com/gitgovernance/monorepo/issues/1763344405) [#1763344405](https://github.com/gitgovernance/monorepo/issues/1763344405) [#1763344405](https://github.com/gitgovernance/monorepo/issues/1763344405) [#1763344405](https://github.com/gitgovernance/monorepo/issues/1763344405) [#1763344405](https://github.com/gitgovernance/monorepo/issues/1763344405)


### 🐛 Bug Fixes

* **cli:** add loader functions to RecordStore initialization ([dcd0b38](https://github.com/gitgovernance/monorepo/commit/dcd0b380a6e74aade972dcc93505c63fc77905c4))
* **cli:** update priority color high to orange ([#57](https://github.com/gitgovernance/monorepo/issues/57)) ([cc30d8f](https://github.com/gitgovernance/monorepo/commit/cc30d8f612f6357ba01f640709b60b989d1b50d9)), closes [#1762699192](https://github.com/gitgovernance/monorepo/issues/1762699192)


### ♻️ Refactoring

* **cli:** restore factory-based record loading and dashboard enhancements ([ef00365](https://github.com/gitgovernance/monorepo/commit/ef00365a8aaa2871e79ed82874b06a768777ee27))

## [1.7.0](https://github.com/gitgovernance/monorepo/compare/core-v1.6.4...core-v1.7.0) (2025-11-09)


### ✨ Features

* **core:** implement author/lastModifier enrichment, validation methods, and lint module ([#54](https://github.com/gitgovernance/monorepo/issues/54)) ([e3b8160](https://github.com/gitgovernance/monorepo/commit/e3b8160f907e56db416ca84b47020b5e7544e05d)), closes [#1758522352](https://github.com/gitgovernance/monorepo/issues/1758522352) [#1762449462](https://github.com/gitgovernance/monorepo/issues/1762449462) [#1762488681](https://github.com/gitgovernance/monorepo/issues/1762488681) [#1762449462](https://github.com/gitgovernance/monorepo/issues/1762449462)

## [1.6.4](https://github.com/gitgovernance/monorepo/compare/core-v1.6.3...core-v1.6.4) (2025-11-05)


### 🐛 Bug Fixes

* **core:** resolve agent prompt copy with ESM helper ([#51](https://github.com/gitgovernance/monorepo/issues/51)) ([7b4fb87](https://github.com/gitgovernance/monorepo/commit/7b4fb87a27cacd404d6a7fe7b861fb20e5a99219))

## [1.6.3](https://github.com/gitgovernance/monorepo/compare/core-v1.6.2...core-v1.6.3) (2025-11-04)


### 🐛 Bug Fixes

* **core:** use require.resolve for agent prompt copy ([#50](https://github.com/gitgovernance/monorepo/issues/50)) ([935a1ab](https://github.com/gitgovernance/monorepo/commit/935a1ab601bedf3f53fa68c7e2fec11d4bd60b31))

## [1.6.2](https://github.com/gitgovernance/monorepo/compare/core-v1.6.1...core-v1.6.2) (2025-11-04)


### 🐛 Bug Fixes

* **core:** use __dirname instead of import.meta.url for Jest compatibility ([4d520aa](https://github.com/gitgovernance/monorepo/commit/4d520aa1ac6b821c1c748d38e6cbaf0b455f674d)), closes [#47](https://github.com/gitgovernance/monorepo/issues/47)

## [1.6.1](https://github.com/gitgovernance/monorepo/compare/core-v1.6.0...core-v1.6.1) (2025-11-04)


### 🐛 Bug Fixes

* **core:** add ESM __dirname compatibility for project adapter ([#47](https://github.com/gitgovernance/monorepo/issues/47)) ([7795e05](https://github.com/gitgovernance/monorepo/commit/7795e05e5441f4310e1c74522fafcc114f4202d3)), closes [#45](https://github.com/gitgovernance/monorepo/issues/45)

## [1.6.0](https://github.com/gitgovernance/monorepo/compare/core-v1.5.1...core-v1.6.0) (2025-11-04)


### ✨ Features

* **core:** add agent prompt sync for npm package ([#45](https://github.com/gitgovernance/monorepo/issues/45)) ([7eb7ea9](https://github.com/gitgovernance/monorepo/commit/7eb7ea9bdd7c64690b2fe171a9c525fa0d7b0b85)), closes [#1762268208](https://github.com/gitgovernance/monorepo/issues/1762268208)

## [1.5.1](https://github.com/gitgovernance/monorepo/compare/core-v1.5.0...core-v1.5.1) (2025-11-04)


### 🐛 Bug Fixes

* **core:** include docs/ folder in npm package ([4ac246d](https://github.com/gitgovernance/monorepo/commit/4ac246d038df809e119abd59471c7d7ca8d3f10f))

## [1.5.0](https://github.com/gitgovernance/monorepo/compare/core-v1.4.0...core-v1.5.0) (2025-11-04)


### ✨ Features

* **core:** add [@gitgov](https://github.com/gitgov) agent prompt copy during initialization ([62de70f](https://github.com/gitgovernance/monorepo/commit/62de70fac3d0f56d9076ac7c1a70ba65cf213d69))


### 🐛 Bug Fixes

* **core:** generate 44-char Ed25519 public keys for schema compliance ([8a9ef24](https://github.com/gitgovernance/monorepo/commit/8a9ef24416d3d5137c20a796d86b001c61f8dd0e))


### ♻️ Refactoring

* **core:** remove Kiro IDE integration from ProjectAdapter ([6d23c24](https://github.com/gitgovernance/monorepo/commit/6d23c24913d8c21c7fb8f4ecd11b184465256e3f))

## [1.4.0](https://github.com/gitgovernance/monorepo/compare/core-v1.3.0...core-v1.4.0) (2025-11-04)


### ✨ Features

* **cli:** add sorting and argument parsing for task list ([#41](https://github.com/gitgovernance/monorepo/issues/41)) ([1fb812d](https://github.com/gitgovernance/monorepo/commit/1fb812d6af4bd49ae9f8f5bd9c18ded328aefda1)), closes [#1759487394](https://github.com/gitgovernance/monorepo/issues/1759487394)
* **cli:** filter completed tasks in priority view ([#40](https://github.com/gitgovernance/monorepo/issues/40)) ([d5fa301](https://github.com/gitgovernance/monorepo/commit/d5fa301375da3bd552e22644444a4b80a79ea554))
* **core:** add EmbeddedMetadata factory with validation ([5d0236d](https://github.com/gitgovernance/monorepo/commit/5d0236d7000ad5dea01fe68e3b32a1489754541b)), closes [#1761736263](https://github.com/gitgovernance/monorepo/issues/1761736263)


### 🐛 Bug Fixes

* **cli:** handle --help flag with pnpm start -- separator ([#39](https://github.com/gitgovernance/monorepo/issues/39)) ([16b1670](https://github.com/gitgovernance/monorepo/commit/16b16703a3cc9b0605c629942f391e3210f3e077)), closes [#1759984817](https://github.com/gitgovernance/monorepo/issues/1759984817)


### ♻️ Refactoring

* **core:** enhance validators and schema module ([d56ab24](https://github.com/gitgovernance/monorepo/commit/d56ab248facd97690a05805198160fc37c0979cd)), closes [#1761736263](https://github.com/gitgovernance/monorepo/issues/1761736263)
* **core:** update adapters and factories for schema compliance ([b7cecc9](https://github.com/gitgovernance/monorepo/commit/b7cecc9530e46d2c5b2c1ca30255fb54cdf26610)), closes [#1761736263](https://github.com/gitgovernance/monorepo/issues/1761736263)
* **core:** update generated schemas and types from YAML sources ([ed4981b](https://github.com/gitgovernance/monorepo/commit/ed4981b938813755529dbbd06086a61fa87c3ecd)), closes [#1761736263](https://github.com/gitgovernance/monorepo/issues/1761736263)
* **core:** update supporting modules and documentation ([574c334](https://github.com/gitgovernance/monorepo/commit/574c334f39986bf5866fa5ac9e86ecbcbdd9f94c)), closes [#1761736263](https://github.com/gitgovernance/monorepo/issues/1761736263)

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
