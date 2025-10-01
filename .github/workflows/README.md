# CI/CD Workflows

## 🚀 Release Workflow (Production)

### Trigger

- **Push to `main` branch** with changes in `packages/cli/`
- Ignora cambios solo en archivos `.md`

### What it does

1. ✅ **Checkout code** - Fetch completo para semantic versioning
2. ✅ **Setup environment** - Node 20 + pnpm 8
3. ✅ **Install dependencies** - Frozen lockfile
4. ✅ **Build packages** - Core + CLI
5. ✅ **Run tests** - Validación completa
6. ✅ **Semantic Release** - Versionado automático basado en commits
7. ✅ **Build NPM packages** - Tarball para GitHub
8. ✅ **Upload assets** - Tarball + checksum a GitHub release

### Semantic Versioning Rules

Based on [Conventional Commits](https://www.conventionalcommits.org/):

| Commit Type                | Version Bump   | Example       |
| -------------------------- | -------------- | ------------- |
| `feat:`                    | **Minor**      | 1.2.0 → 1.3.0 |
| `fix:`                     | **Patch**      | 1.2.0 → 1.2.1 |
| `perf:`                    | **Patch**      | 1.2.0 → 1.2.1 |
| `refactor:`                | **Patch**      | 1.2.0 → 1.2.1 |
| `BREAKING CHANGE:`         | **Major**      | 1.2.0 → 2.0.0 |
| `docs:`, `chore:`, `test:` | **No release** | -             |

### Required Secrets

Configure in GitHub repository settings:

```
NPM_TOKEN        - NPM publish token (automation token)
GITHUB_TOKEN     - Auto-provided by GitHub Actions
```

### Example Workflow

```bash
# Developer workflow
git checkout -b feature/new-dashboard
# ... make changes ...
git commit -m "feat: add new dashboard UI"
git push origin feature/new-dashboard

# Create PR → Review → Merge to main

# CI/CD automatically:
# 1. Detects "feat:" → Minor bump (1.2.0 → 1.3.0)
# 2. Runs tests
# 3. Publishes to NPM as @gitgov/cli@1.3.0
# 4. Creates GitHub release cli-v1.3.0
# 5. Uploads tarball + checksum
```

## 🏷️ Pre-releases vs Production

### Pre-releases (Manual via @release-agent)

- **Purpose**: Testing, demos, beta versions
- **Trigger**: Manual from feature/release branches
- **Versioning**: `1.3.0-demo.timestamp`
- **NPM Tags**: `demo`, `beta`, `alpha`
- **Commands**:
  ```bash
  pnpm version:bump --minor --prerelease demo
  pnpm release:npm --tag demo
  ```

### Production Releases (Automatic via CI/CD)

- **Purpose**: Stable releases for all users
- **Trigger**: Merge to main
- **Versioning**: `1.3.0` (semantic)
- **NPM Tag**: `latest`
- **Process**: Fully automated via GitHub Actions

## 🔧 Setup Instructions

### 1. Install Semantic Release Dependencies

```bash
cd packages/cli
pnpm add -D semantic-release @semantic-release/changelog @semantic-release/git @semantic-release/github
pnpm add -D conventional-changelog-conventionalcommits
```

### 2. Configure NPM Token

1. Generate NPM automation token: https://www.npmjs.com/settings/~/tokens
2. Add to GitHub Secrets: `Settings → Secrets → Actions → NPM_TOKEN`

### 3. Test Locally (Dry Run)

```bash
cd packages/cli
GITHUB_TOKEN=xxx NPM_TOKEN=xxx npx semantic-release --dry-run
```

## 📋 Release Checklist

### For Developers

- [ ] Use conventional commits (feat:, fix:, etc.)
- [ ] Include BREAKING CHANGE in footer for major bumps
- [ ] Tests pass locally
- [ ] Create PR to main
- [ ] Wait for CI/CD after merge

### For Maintainers

- [ ] NPM_TOKEN configured in GitHub
- [ ] Protected branch rules on main
- [ ] Squash or rebase merge strategy (for clean history)

## 🚨 Troubleshooting

### Release doesn't trigger

- Check if changes are in `packages/cli/`
- Verify commit messages follow conventional format
- Check GitHub Actions logs

### NPM publish fails

- Verify NPM_TOKEN is valid
- Check package.json version not already published
- Verify @gitgov/cli scope permissions

### Tests fail

- Fix tests before merging to main
- CI won't release if tests fail

## 🔗 Related Documentation

- [Semantic Release](https://semantic-release.gitbook.io/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Actions](https://docs.github.com/en/actions)
