# Semantic Commit Guidelines

## Purpose

We use a standardized commit format to achieve two primary goals:

1.  **Automatic Traceability:** Directly link every code change to a `task`.
2.  **Semantic Clarity:** Understand the purpose of a commit at a glance.

## Commit Format

Every commit message must follow this format:

**`type(scope): subject [task:task-id]`**

1.  **`type`**: The purpose of the change (required).
2.  **`scope`**: The part of the system being affected (required).
3.  **`subject`**: A short description in the imperative mood (required).
4.  **`task-id`**: The ID of the related task (required).

### **Type**

Must be one of the following:

- **`feat`**: A new feature.
- **`fix`**: A bug fix.
- **`docs`**: Documentation only changes.
- **`style`**: Changes that do not affect the meaning of the code (white-space, formatting, etc).
- **`refactor`**: A code change that neither fixes a bug nor adds a feature.
- **`test`**: Adding missing tests or correcting existing tests.
- **`chore`**: Changes to the build process, auxiliary tools, or dependencies.

### **Scope**

The scope must be one of the following key project components:

- **`core`**: Changes to the `@gitgov/core` package.
- **`cli`**: Changes to the `@gitgov/cli` package.
- **`docs`**: Changes to general documentation or blueprints.
- **`repo`**: Changes to root-level project files (e.g., `.gitignore`, `package.json`).
- **`cicd`**: Changes to CI/CD workflows.

### **Practical Examples**

```bash
# Add a new feature to the SDK
git commit -m "feat(core): Implement SchemaValidationCache [task:1757982961-add-schema-caching]"

# Correct the main README documentation
git commit -m "docs(repo): Update dashboard examples in README_eng [task:1757982961-update-readme-docs]"

# Fix a bug in a CLI command
git commit -m "fix(cli): Correct flag parsing for 'status' command [task:1757982961-fix-status-flag-bug]"

# Upgrade a project dependency
git commit -m "chore(repo): Upgrade Jest to v29 [task:1757982961-upgrade-dependencies]"
```
