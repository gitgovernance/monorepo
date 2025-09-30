#!/bin/bash

# Release NPM - Publishes package to NPM registry
# Usage: ./scripts/release-npm.sh [flags]
# Flags:
#   --skip-build-check    Skip build validation
#   --skip-npm-check      Skip NPM registry version check
#   --skip-publish        Skip NPM publish
#   --skip-all            Skip all steps (dry run)
# Note: Run ./scripts/version.sh first to set the version

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}📦 GitGovernance CLI - NPM Release${NC}"
echo -e "${BLUE}==================================${NC}"

# Parse flags
SKIP_BUILD_CHECK=false
SKIP_NPM_CHECK=false
SKIP_PUBLISH=false
SKIP_ALL=false

for arg in "$@"; do
    case $arg in
        --skip-build-check)
            SKIP_BUILD_CHECK=true
            ;;
        --skip-npm-check)
            SKIP_NPM_CHECK=true
            ;;
        --skip-publish)
            SKIP_PUBLISH=true
            ;;
        --skip-all)
            SKIP_ALL=true
            SKIP_BUILD_CHECK=true
            SKIP_NPM_CHECK=true
            SKIP_PUBLISH=true
            ;;
        --*)
            echo -e "${RED}❌ Unknown flag: $arg${NC}"
            echo -e "${YELLOW}💡 Usage: ./scripts/release-npm.sh [--skip-flags]${NC}"
            exit 1
            ;;
        *)
            # Ignore non-flag arguments
            ;;
    esac
done

# Get current version from package.json
NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}📦 Publishing version: $NEW_VERSION${NC}"

# Show skip flags if any
if [ "$SKIP_ALL" = true ]; then
    echo -e "${YELLOW}⚠️  DRY RUN - Skipping ALL steps${NC}"
elif [ "$SKIP_BUILD_CHECK" = true ] || [ "$SKIP_NPM_CHECK" = true ] || [ "$SKIP_PUBLISH" = true ]; then
    echo -e "${YELLOW}⚠️  Skipping:${NC}"
    [ "$SKIP_BUILD_CHECK" = true ] && echo -e "${YELLOW}   - Build validation${NC}"
    [ "$SKIP_NPM_CHECK" = true ] && echo -e "${YELLOW}   - NPM registry check${NC}"
    [ "$SKIP_PUBLISH" = true ] && echo -e "${YELLOW}   - NPM publish${NC}"
fi

# NPM authentication check
echo -e "${BLUE}🔐 Checking NPM authentication...${NC}"
if ! npm whoami >/dev/null 2>&1; then
    echo -e "${RED}❌ Not logged in to NPM${NC}"
    echo -e "${YELLOW}💡 Run: npm login${NC}"
    exit 1
fi
echo -e "${GREEN}✅ NPM authentication verified${NC}"

# NPM registry validation
if [ "$SKIP_NPM_CHECK" = false ]; then
    echo -e "${BLUE}🔍 Checking NPM registry...${NC}"
    if npm view "@gitgov/cli@$NEW_VERSION" version >/dev/null 2>&1; then
        echo -e "${RED}❌ Version $NEW_VERSION already exists in NPM registry${NC}"
        echo -e "${YELLOW}💡 Run: ./scripts/version.sh --patch to bump version${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Version $NEW_VERSION is available in NPM${NC}"
else
    echo -e "${YELLOW}⏭️  Skipping NPM registry check${NC}"
fi

# Build validation
if [ "$SKIP_BUILD_CHECK" = false ]; then
    if [ ! -d "build/dist" ] || [ ! -f "build/dist/gitgov.mjs" ]; then
        echo -e "${RED}❌ No build found in build/dist/${NC}"
        echo -e "${YELLOW}💡 Run: pnpm build${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Build found, ready to publish${NC}"
else
    echo -e "${YELLOW}⏭️  Skipping build validation${NC}"
fi

# Publish to NPM
if [ "$SKIP_PUBLISH" = false ]; then
    echo -e "${BLUE}🚀 Publishing to NPM...${NC}"
    pnpm publish --no-git-checks
    
    # Verify publication
    echo -e "${BLUE}🔍 Verifying publication...${NC}"
    sleep 2  # Give NPM a moment to update
    if npm view "@gitgov/cli@$NEW_VERSION" version >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Successfully published to NPM${NC}"
    else
        echo -e "${RED}❌ Publication verification failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⏭️  Skipping NPM publish${NC}"
fi

echo ""
echo -e "${GREEN}✅ NPM Release completed successfully!${NC}"
echo -e "${GREEN}📦 Package @gitgov/cli@$NEW_VERSION published${NC}"
echo -e "${BLUE}🔗 NPM Package: https://www.npmjs.com/package/@gitgov/cli/v/$NEW_VERSION${NC}"