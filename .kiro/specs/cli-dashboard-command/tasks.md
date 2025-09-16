# Implementation Plan

This plan reflects the completed and future implementation phases for the `gitgov dashboard` command, aligned with the canonical blueprint.

---

### Phase 1: Multi-Adapter Convergence & UI (COMPLETED)

- [x] **1. Implement 6-Adapter Orchestration**
  - Integrate all 6 core adapters (`Backlog`, `Metrics`, `Indexer`, `Feedback`, `WorkflowMethodology`, `Identity`) to gather the complete project state.
  - _Requirements: 1.1_

- [x] **2. Implement TUI and View Management**
  - Build the main `Dashboard` TUI component using `Ink`.
  - Implement the logic to switch between the 3 core views (Row-based, Kanban, Scrum) based on user input (`v`, `1`, `2`, `3`) and methodology settings.
  - _Requirements: 2.1, 2.2_

- [x] **3. Implement Data Display & Intelligence Panels**
  - Render tasks and cycles according to the selected `view_config`.
  - Display real-time intelligence panels (System Health, Metrics, Activity Stream) using data from the `IndexerAdapter` and `MetricsAdapter`.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

### Phase 2: Interactivity & Real-Time Updates (PARTIALLY IMPLEMENTED)

- [x] **4. Implement Live Mode & Educational Shortcuts**
  - Implement the 5-second auto-refresh loop for live data updates.
  - Implement the keyboard shortcuts (`n`, `s`, `a`, etc.) to show educational messages.
  - _Requirements: 2.3, 2.4_

- [x] **5. Implement Full EventBus Integration (Future)**
  - Subscribe the TUI to the `EventBus` to receive real-time events and update the view without a full refresh.
  - This will replace the polling-based auto-refresh.

### Phase 3: Quality & Testing (PENDING)

- [x] **6. Implement Full Test Coverage**
  - Write a comprehensive suite of E2E tests covering all 18 EARS requirements.
  - Test multi-adapter coordination, view switching, and data rendering.
  - Validate performance targets (<500ms cold start).
