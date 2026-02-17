/**
 * Input types for the 8 cycle management MCP tools.
 */

export interface CycleNewInput {
  title: string;
  tags?: string[];
  notes?: string;
}

export interface CycleTransitionInput {
  cycleId: string;
}

export interface CycleEditInput {
  cycleId: string;
  title?: string;
  tags?: string[];
  notes?: string;
}

export interface CycleTaskLinkInput {
  cycleId: string;
  taskId: string;
}

export interface CycleMoveTaskInput {
  taskId: string;
  fromCycleId: string;
  toCycleId: string;
}

export interface CycleAddChildInput {
  parentCycleId: string;
  childCycleId: string;
}
