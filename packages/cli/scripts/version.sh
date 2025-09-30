#!/bin/bash

# Version Management - Centralized version control with validations
# Usage: ./scripts/version.sh [flags]
# Version flags (required):
#   --patch          Patch version bump (1.0.0 → 1.0.1)
#   --minor          Minor version bump (1.0.0 → 1.1.0)  
#   --major          Major version bump (1.0.0 → 2.0.0)
# Skip flags (optional):
#   --skip-tests     Skip test validation
#   --skip-build     Skip build validation  
#   --skip-git       Skip git validations (branch, clean)
#   --skip-tag       Skip git tag creation
#   --skip-all       Skip all validations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔢 GitGovernance CLI - Version Management${NC}"
echo -e "${BLUE}=========================================${NC}"

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}📋 Current version: $CURRENT_VERSION${NC}"

# Parse flags
VERSION_TYPE=""
SKIP_TESTS=false
SKIP_BUILD=false
SKIP_GIT=false
SKIP_TAG=false
SKIP_ALL=false

for arg in "$@"; do
    case $arg in
        --patch)
            VERSION_TYPE="patch"
            ;;
        --minor)
            VERSION_TYPE="minor"
            ;;
        --major)
            VERSION_TYPE="major"
            ;;
        --skip-tests)
            SKIP_TESTS=true
            ;;
        --skip-build)
            SKIP_BUILD=true
            ;;
        --skip-git)
            SKIP_GIT=true
            ;;
        --skip-tag)
            SKIP_TAG=true
            ;;
        --skip-all)
            SKIP_ALL=true
            SKIP_TESTS=true
            SKIP_BUILD=true
            SKIP_GIT=true
            SKIP_TAG=true
            ;;
        *)
            echo -e "${RED}❌ Unknown flag: $arg${NC}"
            echo -e "${YELLOW}💡 Usage: ./scripts/version.sh --patch|--minor|--major [--skip-flags]${NC}"
            exit 1
            ;;
    esac
done

# Validate version type is provided
if [ -z "$VERSION_TYPE" ]; then
    echo -e "${RED}❌ Version type required${NC}"
    echo -e "${YELLOW}💡 Usage: ./scripts/version.sh --patch|--minor|--major [--skip-flags]${NC}"
    exit 1
fi

echo -e "${YELLOW}📈 Version bump type: $VERSION_TYPE${NC}"

# Show skip flags if any
if [ "$SKIP_ALL" = true ]; then
    echo -e "${YELLOW}⚠️  Skipping ALL validations${NC}"
elif [ "$SKIP_TESTS" = true ] || [ "$SKIP_BUILD" = true ] || [ "$SKIP_GIT" = true ]; then
    echo -e "${YELLOW}⚠️  Skipping:${NC}"
    [ "$SKIP_TESTS" = true ] && echo -e "${YELLOW}   - Tests${NC}"
    [ "$SKIP_BUILD" = true ] && echo -e "${YELLOW}   - Build${NC}"
    [ "$SKIP_GIT" = true ] && echo -e "${YELLOW}   - Git validations${NC}"
fi

# Pre-version validations
echo -e "${BLUE}🔍 Pre-version validations...${NC}"

# Git validations
if [ "$SKIP_GIT" = false ]; then
    # Check if we're on main branch
    CURRENT_BRANCH=$(git branch --show-current)
    if [ "$CURRENT_BRANCH" != "main" ]; then
        echo -e "${RED}❌ Must be on main branch for version bump${NC}"
        echo -e "${YELLOW}💡 Current branch: $CURRENT_BRANCH${NC}"
        exit 1
    fi

    # Check if working directory is clean
    if [ -n "$(git status --porcelain)" ]; then
        echo -e "${RED}❌ Working directory must be clean${NC}"
        echo -e "${YELLOW}💡 Commit or stash changes first${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Git validations passed${NC}"
else
    echo -e "${YELLOW}⏭️  Skipping git validations${NC}"
fi

# Build validation
if [ "$SKIP_BUILD" = false ]; then
    echo -e "${BLUE}🏗️  Validating build...${NC}"
    if ! pnpm build >/dev/null 2>&1; then
        echo -e "${RED}❌ Build failed${NC}"
        echo -e "${YELLOW}💡 Fix build errors before version bump${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Build validation passed${NC}"
else
    echo -e "${YELLOW}⏭️  Skipping build validation${NC}"
fi

# Test validation
if [ "$SKIP_TESTS" = false ]; then
    echo -e "${BLUE}🧪 Validating tests...${NC}"
    if ! pnpm test >/dev/null 2>&1; then
        echo -e "${RED}❌ Tests failed${NC}"
        echo -e "${YELLOW}💡 Fix failing tests before version bump${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Test validation passed${NC}"
else
    echo -e "${YELLOW}⏭️  Skipping test validation${NC}"
fi

echo -e "${GREEN}✅ All validations completed${NC}"

# Version bump
echo -e "${BLUE}📈 Bumping version...${NC}"
npm version $VERSION_TYPE --no-git-tag-version

NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}✅ New version: $NEW_VERSION${NC}"

# Commit version change
echo -e "${BLUE}💾 Committing version change...${NC}"
git add package.json
git commit -m "chore(cli): bump version to $NEW_VERSION"
git push origin main

# Create git tag
if [ "$SKIP_TAG" = false ]; then
    echo -e "${BLUE}🏷️  Creating git tag...${NC}"
    TAG_NAME="cli-v$NEW_VERSION"
    git tag "$TAG_NAME"
    echo -e "${GREEN}✅ Tag created: $TAG_NAME${NC}"
    
    echo -e "${BLUE}📤 Pushing tag to remote...${NC}"
    git push origin "$TAG_NAME"
    echo -e "${GREEN}✅ Tag pushed to remote${NC}"
else
    echo -e "${YELLOW}⏭️  Skipping git tag creation${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Version bump completed successfully!${NC}"
echo -e "${GREEN}📦 Version: $CURRENT_VERSION → $NEW_VERSION${NC}"
if [ "$SKIP_TAG" = false ]; then
    echo -e "${GREEN}🏷️  Tag: cli-v$NEW_VERSION${NC}"
fi
echo -e "${BLUE}🚀 Ready for release!${NC}"

