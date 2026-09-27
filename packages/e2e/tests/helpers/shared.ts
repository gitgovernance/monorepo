/**
 * [HLP-A8] What other packages import as `@gitgov/e2e/helpers`: the CLI, FS and GitHub helpers.
 * The prisma helpers stay out — their `PrismaClient` is generated only inside this package, so
 * re-exporting them would break another package's typecheck. `index.ts` keeps them for this
 * package's own tests.
 */
export * from './cli';
export * from './fs';
export * from './github';
