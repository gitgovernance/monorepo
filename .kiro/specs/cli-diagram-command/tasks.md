# Implementation Plan

This plan reflects the completed and future implementation phases for the `gitgov diagram` command, aligned with the canonical blueprint.

---

### Phase 1: Core Command & TUI (COMPLETED)

- [x] **1. Implement `diagram` Command Structure**
  - Set up the `DiagramCommand` class, ensuring all generation logic is delegated to the `DiagramGenerator` module.
  - _Requirements: 1.1, 7.1, 7.2_

- [x] **2. Implement Interactive TUI Dashboard**
  - Build the `DiagramDashboard.tsx` component using `Ink`.
  - Implement key bindings for generating ('g'), watching ('w'), and quitting ('q').
  - _Requirements: 1.1, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] **3. Implement Core Generation & Filtering**
  - Integrate the `DiagramGenerator` to produce Mermaid syntax from `.gitgov/` records.
  - Implement the basic filter flags available in the MVP: `--cycle`, `--task`, `--package`.
  - _Requirements: 1.5, 1.6, 2.2, 2.3, 2.4_

### Phase 2: Advanced Features (PENDING)

- [x] **4. Implement Advanced Filtering**
  - Add support for `--status` and `--depth` flags.
  - _Requirements: 2.1, 2.5, 2.6_

- [x] **5. Implement Multiple Output Formats**
  - Add support for `--format` (svg, png, pdf) and `--json`.
  - _Requirements: 3.2, 3.5_

- [x] **6. Implement Full `watch` Mode**
  - Enhance the watch functionality with debouncing and more robust file monitoring.
  - _Requirements: 4.1, 4.2, 4.4, 4.5_

- [x] **7. Implement `validate` and `config` Subcommands**
  - Build out the `validate` subcommand for diagram integrity checks.
  - Build out the `config` subcommand for managing local diagram settings.
  - _Corresponds to future blueprint phases._
