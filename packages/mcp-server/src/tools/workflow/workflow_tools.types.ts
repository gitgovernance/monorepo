import type { TaskRecord } from '@gitgov/core';

export type WorkflowTransitionsInput = {
  from: TaskRecord['status'];
};
