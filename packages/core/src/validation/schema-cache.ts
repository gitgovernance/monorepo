import Ajv from "ajv";
import type { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import * as fs from "fs";
import * as yaml from "js-yaml";

/**
 * Singleton cache for schema validators to avoid repeated I/O and AJV compilation.
 * Improves performance by caching compiled validators for schema files.
 */
export class SchemaValidationCache {
  private static validators = new Map<string, ValidateFunction>();
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
   * Clears the cache (useful for testing or schema updates).
   */
  static clearCache(): void {
    this.validators.clear();
    this.ajv = null;
  }

  /**
   * Gets cache statistics for monitoring.
   */
  static getCacheStats(): { cachedSchemas: number; schemasLoaded: string[] } {
    return {
      cachedSchemas: this.validators.size,
      schemasLoaded: Array.from(this.validators.keys())
    };
  }
}
