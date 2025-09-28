#!/bin/bash

# Release All - Complete release workflow (NPM + GitHub)
# Usage: ./scripts/release-all.sh [version-type]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 GitGovernance CLI - Complete Release${NC}"
echo -e "${BLUE}======================================${NC}"

# Version type (patch, minor, major)
VERSION_TYPE=${1:-patch}

echo -e "${YELLOW}🔢 Release type: $VERSION_TYPE${NC}"
echo ""

# Step 1: NPM Release
echo -e "${BLUE}📦 Step 1: NPM Release${NC}"
./scripts/release-npm.sh "$VERSION_TYPE"

# Get the new version
NEW_VERSION=$(node -p "require('./package.json').version")

echo ""

# Step 2: GitHub Release
echo -e "${BLUE}🐙 Step 2: GitHub Release${NC}"
./scripts/release-github.sh "$NEW_VERSION"

echo ""
echo -e "${GREEN}🎉 Complete Release finished successfully!${NC}"
echo -e "${GREEN}📦 NPM: @gitgov/cli@$NEW_VERSION${NC}"
echo -e "${GREEN}🐙 GitHub: cli-v$NEW_VERSION${NC}"
echo -e "${GREEN}🔗 https://github.com/gitgovernance/monorepo/releases/tag/cli-v$NEW_VERSION${NC}"
