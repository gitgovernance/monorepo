import type { TaskRecord } from '../../types/task_record';
import type { CycleRecord } from '../../types/cycle_record';
import { DetailedValidationError } from '../../validation/common';

/**
 * Specialized module for validating graph input data
 * Follows the Module pattern for technical capabilities
 */
export class GraphValidator {
  /**
   * Validates record integrity before processing
   */
  static validateRecordIntegrity(cycles: CycleRecord[], tasks: TaskRecord[]): void {
    if (!Array.isArray(cycles) || !Array.isArray(tasks)) {
      throw new DetailedValidationError('RelationshipAnalyzer', [
        { field: 'cycles', message: 'must be an array', value: cycles },
        { field: 'tasks', message: 'must be an array', value: tasks }
      ]);
    }

    this.validateCycles(cycles);
    this.validateTasks(tasks);
  }

  private static validateCycles(cycles: CycleRecord[]): void {
    for (let i = 0; i < cycles.length; i++) {
      const cycle = cycles[i];
      if (!cycle) {
        throw new DetailedValidationError('CycleRecord', [
          { field: `index_${i}`, message: 'cycle is undefined', value: cycle }
        ]);
      }

      try {
        if (!cycle.id || typeof cycle.id !== 'string') {
          throw new DetailedValidationError('CycleRecord', [
            { field: 'id', message: 'must be a non-empty string', value: cycle.id }
          ]);
        }

        if (!cycle.title || typeof cycle.title !== 'string') {
          throw new DetailedValidationError('CycleRecord', [
            { field: 'title', message: 'must be a non-empty string', value: cycle.title }
          ]);
        }
      } catch (error) {
        if (error instanceof DetailedValidationError) {
          throw error;
        }
        throw new DetailedValidationError('CycleRecord', [
          { field: `index_${i}`, message: error instanceof Error ? error.message : String(error), value: cycle }
        ]);
      }
    }
  }

  private static validateTasks(tasks: TaskRecord[]): void {
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (!task) {
        throw new DetailedValidationError('TaskRecord', [
          { field: `index_${i}`, message: 'task is undefined', value: task }
        ]);
      }

      const sourceFile = this.getSourceFile(task);

      try {
        if (!task.id || typeof task.id !== 'string') {
          throw new DetailedValidationError('TaskRecord', [
            { field: 'id', message: 'must be a non-empty string', value: task.id }
          ]);
        }

        if (!task.title || typeof task.title !== 'string') {
          throw new DetailedValidationError('TaskRecord', [
            { field: 'title', message: 'must be a non-empty string', value: task.title }
          ]);
        }

        if (!task.description || typeof task.description !== 'string') {
          throw new DetailedValidationError('TaskRecord', [
            { field: 'description', message: 'must be a non-empty string', value: task.description }
          ]);
        }
      } catch (error) {
        if (error instanceof DetailedValidationError) {
          throw error;
        }
        const fileInfo = sourceFile !== 'unknown' ? `\n📁 File: .gitgov/tasks/${sourceFile}` : '';
        throw new DetailedValidationError('TaskRecord', [
          { field: `index_${i}`, message: `${error instanceof Error ? error.message : String(error)}${fileInfo}\n💡 Check this file for missing or invalid fields in payload.`, value: task }
        ]);
      }
    }
  }

  /**
   * Safely extracts source file information from task record
   */
  private static getSourceFile(task: TaskRecord): string {
    if (task && typeof task === 'object' && '_sourceFile' in task) {
      const sourceFile = (task as TaskRecord & { _sourceFile?: unknown })._sourceFile;
      return typeof sourceFile === 'string' ? sourceFile : 'unknown';
    }
    return 'unknown';
  }
}