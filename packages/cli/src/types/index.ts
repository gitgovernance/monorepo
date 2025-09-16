// Re-exports for all CLI types
export * from './command-options.js';

// TUI State types
export interface TUIState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
  data?: any;
}

export interface EntityDisplayInfo {
  id: string;
  title: string;
  status: string;
  type: 'cycle' | 'task' | 'epic-task';
  lastUpdated?: string;
}


