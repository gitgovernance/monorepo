/** Resource type categories supported by the MCP server */
export type ResourceCategory = 'tasks' | 'cycles' | 'actors';

/** Parsed gitgov:// URI */
export interface ParsedResourceUri {
  category: ResourceCategory;
  id: string;
}
