#!/bin/bash

# Release GitHub - Creates GitHub release with binaries
# Usage: ./scripts/release-github.sh [version]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🐙 GitGovernance CLI - GitHub Release${NC}"
echo -e "${BLUE}====================================${NC}"

# Get version from package.json if not provided as argument
if [ -z "$1" ]; then
    VERSION=$(node -p "require('./package.json').version")
else
    VERSION="$1"
fi

TAG_NAME="cli-v$VERSION"

echo -e "${YELLOW}🏷️  Tag: $TAG_NAME${NC}"

# Check if tag exists
if ! git tag -l | grep -q "^$TAG_NAME$"; then
    echo -e "${RED}❌ Tag $TAG_NAME does not exist${NC}"
    echo -e "${YELLOW}💡 Run release-npm.sh first to create the tag${NC}"
    exit 1
fi

# Build all artifacts
echo -e "${BLUE}🏗️  Building all artifacts...${NC}"
./scripts/build-all.sh "$VERSION"

# Check if GitHub CLI is available
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ GitHub CLI (gh) is required${NC}"
    echo -e "${YELLOW}💡 Install with: brew install gh${NC}"
    exit 1
fi

# Create GitHub release
echo -e "${BLUE}🚀 Creating GitHub release...${NC}"

RELEASE_NOTES="## GitGovernance CLI v$VERSION

### 🚀 Installation

#### NPM (Recommended)
\`\`\`bash
npm install -g @gitgov/cli
\`\`\`

#### Direct Download
Download the appropriate binary for your platform below.

### 📦 What's Changed
- Bug fixes and improvements
- Enhanced stability and performance

### 🔗 Links
- [NPM Package](https://www.npmjs.com/package/@gitgov/cli)
- [Documentation](https://github.com/gitgovernance/monorepo/tree/main/packages/cli#readme)"

# Create release with all artifacts
gh release create "$TAG_NAME" \
    --title "GitGovernance CLI v$VERSION" \
    --notes "$RELEASE_NOTES" \
    releases/packages/*.tar.gz \
    releases/binaries/*

echo ""
echo -e "${GREEN}✅ GitHub Release completed successfully!${NC}"
echo -e "${GREEN}🐙 Release $TAG_NAME created with all artifacts${NC}"
