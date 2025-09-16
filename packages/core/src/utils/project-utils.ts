/**
 * @deprecated This file is deprecated. All functionality has been moved to ConfigManager static methods.
 * 
 * Migration guide:
 * - findProjectRoot() -> ConfigManager.findProjectRoot()
 * - getGitgovPath() -> ConfigManager.getGitgovPath()
 * - isGitgovProject() -> ConfigManager.isGitgovProject()
 * 
 * Import ConfigManager from '../config_manager' instead.
 */

import { ConfigManager } from '../config_manager';

/**
 * @deprecated Use ConfigManager.findProjectRoot() instead
 */
export function findProjectRoot(startPath?: string): string | null {
  console.warn('DEPRECATED: findProjectRoot() from project-utils is deprecated. Use ConfigManager.findProjectRoot() instead.');
  return ConfigManager.findProjectRoot(startPath);
}

/**
 * @deprecated Use ConfigManager.getGitgovPath() instead
 */
export function getGitgovPath(): string {
  console.warn('DEPRECATED: getGitgovPath() from project-utils is deprecated. Use ConfigManager.getGitgovPath() instead.');
  return ConfigManager.getGitgovPath();
}

/**
 * @deprecated Use ConfigManager.isGitgovProject() instead
 */
export function isGitgovProject(): boolean {
  console.warn('DEPRECATED: isGitgovProject() from project-utils is deprecated. Use ConfigManager.isGitgovProject() instead.');
  return ConfigManager.isGitgovProject();
}
