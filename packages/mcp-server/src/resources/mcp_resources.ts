import type { McpResourceHandler, McpResourceEntry, McpResourceContent } from '../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../di/mcp_di.js';
import type { ParsedResourceUri, ResourceCategory } from './mcp_resources.types.js';

const GITGOV_URI_PREFIX = 'gitgov://';
const VALID_CATEGORIES: ResourceCategory[] = ['tasks', 'cycles', 'actors'];

/** Parse a gitgov:// URI into category and id */
export function parseResourceUri(uri: string): ParsedResourceUri | null {
  if (!uri.startsWith(GITGOV_URI_PREFIX)) return null;
  const path = uri.slice(GITGOV_URI_PREFIX.length);
  const [category, id] = path.split('/');
  if (!category || !VALID_CATEGORIES.includes(category as ResourceCategory)) return null;
  if (!id) return null;
  return { category: category as ResourceCategory, id };
}

/** Create the resource handler that lists and reads gitgov records as MCP resources */
export function createResourceHandler(): McpResourceHandler {
  return { list: listResources, read: readResource };
}

async function listResources(di: McpDependencyInjectionService): Promise<{ resources: McpResourceEntry[] }> {
  const { stores } = await di.getContainer();
  const resources: McpResourceEntry[] = [];

  // Tasks
  const taskIds = await stores.tasks.list();
  for (const id of taskIds) {
    const record = await stores.tasks.get(id);
    if (!record) continue;
    const payload = record.payload as unknown as Record<string, unknown>;
    resources.push({
      uri: `gitgov://tasks/${id}`,
      name: `Task: ${payload.title ?? id}`,
      description: 'GitGovernance task record',
      mimeType: 'application/json',
    });
  }

  // Cycles
  const cycleIds = await stores.cycles.list();
  for (const id of cycleIds) {
    const record = await stores.cycles.get(id);
    if (!record) continue;
    const payload = record.payload as unknown as Record<string, unknown>;
    resources.push({
      uri: `gitgov://cycles/${id}`,
      name: `Cycle: ${payload.title ?? id}`,
      description: 'GitGovernance cycle record',
      mimeType: 'application/json',
    });
  }

  // Actors
  const actorIds = await stores.actors.list();
  for (const id of actorIds) {
    const record = await stores.actors.get(id);
    if (!record) continue;
    const payload = record.payload as unknown as Record<string, unknown>;
    resources.push({
      uri: `gitgov://actors/${id}`,
      name: `Actor: ${payload.displayName ?? id}`,
      description: 'GitGovernance actor record',
      mimeType: 'application/json',
    });
  }

  return { resources };
}

async function readResource(uri: string, di: McpDependencyInjectionService): Promise<{ contents: McpResourceContent[] }> {
  const parsed = parseResourceUri(uri);
  if (!parsed) {
    throw new Error(`Invalid resource URI: ${uri}. Expected format: gitgov://{tasks|cycles|actors}/{id}`);
  }

  const { stores } = await di.getContainer();
  const storeMap: Record<ResourceCategory, { get: (id: string) => Promise<unknown> }> = {
    tasks: stores.tasks,
    cycles: stores.cycles,
    actors: stores.actors,
  };

  const store = storeMap[parsed.category];
  const record = await store.get(parsed.id);
  if (!record) {
    throw new Error(`Resource not found: ${uri}`);
  }

  return {
    contents: [{
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(record, null, 2),
    }],
  };
}
