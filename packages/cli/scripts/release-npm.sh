#!/bin/bash

# Release NPM - Publishes package to NPM registry
# Usage: ./scripts/release-npm.sh [version-type]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}📦 GitGovernance CLI - NPM Release${NC}"
echo -e "${BLUE}==================================${NC}"

# Version type (patch, minor, major)
VERSION_TYPE=${1:-patch}

echo -e "${YELLOW}🔢 Version bump: $VERSION_TYPE${NC}"

# Pre-release validation
echo -e "${BLUE}🔍 Pre-release validation...${NC}"

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "${RED}❌ Must be on main branch for release${NC}"
    exit 1
fi

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}❌ Working directory must be clean${NC}"
    exit 1
fi

# Run tests
echo -e "${BLUE}🧪 Running tests...${NC}"
pnpm test

# Build package
echo -e "${BLUE}🏗️  Building package...${NC}"
pnpm build

# Version bump
echo -e "${BLUE}📈 Bumping version...${NC}"
npm version $VERSION_TYPE --no-git-tag-version

NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}✅ New version: $NEW_VERSION${NC}"

# Publish to NPM
echo -e "${BLUE}🚀 Publishing to NPM...${NC}"
pnpm publish

# Create git tag
echo -e "${BLUE}🏷️  Creating git tag...${NC}"
git add package.json
git commit -m "chore(cli): bump version to $NEW_VERSION"
git tag "cli-v$NEW_VERSION"
git push origin main
git push origin "cli-v$NEW_VERSION"

echo ""
echo -e "${GREEN}✅ NPM Release completed successfully!${NC}"
echo -e "${GREEN}📦 Package @gitgov/cli@$NEW_VERSION published${NC}"
echo -e "${GREEN}🏷️  Tag cli-v$NEW_VERSION created${NC}"