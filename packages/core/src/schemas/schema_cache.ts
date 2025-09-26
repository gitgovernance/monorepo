import Ajv from "ajv";
import type { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import * as fs from "fs";
import * as yaml from "js-yaml";

// Direct import from generated schemas
import { Schemas } from "./generated";

/**
 * Singleton cache for schema validators to avoid repeated I/O and AJV compilation.
 * Improves performance by caching compiled validators for schema files.
 */
export class SchemaValidationCache {
  private static validators = new Map<string, ValidateFunction>();
  private static schemaValidators = new Map<string, ValidateFunction>();
  private static ajv: Ajv | null = null;

  /**
   * Gets or creates a cached validator for the specified schema path.
   * @param schemaPath Absolute path to the YAML schema file
   * @returns Compiled AJV validator function
   */
  static getValidator(schemaPath: string): ValidateFunction {
    if (!this.validators.has(schemaPath)) {
      // Initialize AJV instance if not already done
      if (!this.ajv) {
        this.ajv = new Ajv({ allErrors: true });
        addFormats(this.ajv);
      }

      // Load and compile schema
      const schemaContent = fs.readFileSync(schemaPath, "utf8");
      const schema = yaml.load(schemaContent);
      const validator = this.ajv.compile(schema as object);

      this.validators.set(schemaPath, validator);
    }

    return this.validators.get(schemaPath)!;
  }

  /**
   * Gets or creates a cached validator for a schema object.
   * @param schema The schema object (already parsed YAML/JSON)
   * @returns Compiled AJV validator function
   */
  static getValidatorFromSchema<T = unknown>(schema: object): ValidateFunction<T> {
    // Create a stable key from the schema object
    const schemaKey = JSON.stringify(schema);

    if (!this.schemaValidators.has(schemaKey)) {
      // Initialize AJV instance if not already done
      if (!this.ajv) {
        this.ajv = new Ajv({ allErrors: true });
        addFormats(this.ajv);

        // Pre-load all schemas for reference resolution
        this.preloadSchemas();
      }

      // Remove $id temporarily to avoid conflicts with preloaded schemas
      // (This doesn't modify the original schema object)
      const { $id, ...schemaWithoutId } = schema as any;

      // Compile schema directly - AJV will resolve $ref using preloaded aliases
      const validator = this.ajv.compile(schemaWithoutId);
      this.schemaValidators.set(schemaKey, validator);
    }

    return this.schemaValidators.get(schemaKey)! as ValidateFunction<T>;
  }

  /**
   * Pre-loads referenced schema files for $ref resolution.
   * Uses direct imports and dynamic iteration.
   */
  private static preloadSchemas(): void {
    if (!this.ajv) return;

    try {
      // Map schema names to their expected ref aliases
      const schemaRefMap: Record<string, string> = {
        'ActorRecord': 'ref:actor_record_schema',
        'AgentRecord': 'ref:agent_record_schema',
        'ChangelogRecord': 'ref:changelog_record_schema',
        'CycleRecord': 'ref:cycle_record_schema',
        'ExecutionRecord': 'ref:execution_record_schema',
        'FeedbackRecord': 'ref:feedback_record_schema',
        'TaskRecord': 'ref:task_record_schema',
        'WorkflowMethodologyRecord': 'ref:workflow_methodology_record_schema'
      };

      // Register schemas with correct aliases
      Object.entries(Schemas).forEach(([name, schema]) => {
        if (name !== 'EmbeddedMetadata' && schemaRefMap[name]) {
          const refName = schemaRefMap[name];
          this.ajv!.addSchema(schema, refName);
        }
      });
    } catch {
      // If preloading fails, continue without it
    }
  }

  /**
   * Clears the cache (useful for testing or schema updates).
   */
  static clearCache(): void {
    this.validators.clear();
    this.schemaValidators.clear();
    this.ajv = null;
  }

  /**
   * Gets cache statistics for monitoring.
   */
  static getCacheStats(): { cachedSchemas: number; schemasLoaded: string[] } {
    return {
      cachedSchemas: this.validators.size + this.schemaValidators.size,
      schemasLoaded: Array.from(this.validators.keys())
    };
  }
}
