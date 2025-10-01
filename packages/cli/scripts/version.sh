#!/bin/bash

# Version Management - Centralized version control with validations
# Usage: ./scripts/version.sh [flags]
# Version flags (required):
#   --patch          Patch version bump (1.0.0 → 1.0.1)
#   --minor          Minor version bump (1.0.0 → 1.1.0)  
#   --major          Major version bump (1.0.0 → 2.0.0)
# Pre-release flags (optional):
#   --prerelease <tag>  Create pre-release version (1.0.0 → 1.1.0-<tag>.timestamp)
#                       Examples: --prerelease demo, --prerelease beta, --prerelease alpha
# Skip flags (optional):
#   --skip-tests     Skip test validation
#   --skip-build     Skip build validation  
#   --skip-git       Skip git validations (branch, clean)
#   --skip-tag       Skip git tag creation
#   --skip-all       Skip all validations
# 
# Examples:
#   ./scripts/version.sh --patch                    # Production: 1.0.0 → 1.0.1
#   ./scripts/version.sh --minor --prerelease demo  # Demo: 1.0.0 → 1.1.0-demo.1234567890
#   ./scripts/version.sh --major --prerelease beta  # Beta: 1.0.0 → 2.0.0-beta.1234567890

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
PRERELEASE_TAG=""
SKIP_TESTS=false
SKIP_BUILD=false
SKIP_GIT=false
SKIP_TAG=false
SKIP_ALL=false
EXPECT_PRERELEASE_VALUE=false

for arg in "$@"; do
    if [ "$EXPECT_PRERELEASE_VALUE" = true ]; then
        PRERELEASE_TAG="$arg"
        EXPECT_PRERELEASE_VALUE=false
        continue
    fi
    
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
        --prerelease)
            EXPECT_PRERELEASE_VALUE=true
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
            echo -e "${YELLOW}💡 Usage: ./scripts/version.sh --patch|--minor|--major [--prerelease <tag>] [--skip-flags]${NC}"
            exit 1
            ;;
    esac
done

# Validate prerelease tag if flag was provided
if [ "$EXPECT_PRERELEASE_VALUE" = true ]; then
    echo -e "${RED}❌ --prerelease requires a tag value${NC}"
    echo -e "${YELLOW}💡 Usage: --prerelease demo|beta|alpha${NC}"
    exit 1
fi

# Validate version type is provided
if [ -z "$VERSION_TYPE" ]; then
    echo -e "${RED}❌ Version type required${NC}"
    echo -e "${YELLOW}💡 Usage: ./scripts/version.sh --patch|--minor|--major [--skip-flags]${NC}"
    exit 1
fi

echo -e "${YELLOW}📈 Version bump type: $VERSION_TYPE${NC}"

# Show pre-release info if applicable
if [ -n "$PRERELEASE_TAG" ]; then
    echo -e "${BLUE}🏷️  Pre-release tag: $PRERELEASE_TAG${NC}"
    echo -e "${YELLOW}⚡ This will create a pre-release version (not production)${NC}"
fi

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
    CURRENT_BRANCH=$(git branch --show-current)
    
    # Smart branch validation: Allow main, release/*, and feature/* with warnings
    if [ "$CURRENT_BRANCH" = "main" ]; then
        echo -e "${GREEN}✅ On main branch - Production release${NC}"
        RELEASE_TYPE="production"
    elif [[ "$CURRENT_BRANCH" =~ ^release/ ]]; then
        echo -e "${YELLOW}⚡ On release branch - Release preparation${NC}"
        RELEASE_TYPE="release-prep"
    elif [[ "$CURRENT_BRANCH" =~ ^feature/ ]]; then
        echo -e "${YELLOW}⚠️  On feature branch - Development release${NC}"
        echo -e "${YELLOW}💡 Recommended: Create PR → merge to main → release${NC}"
        echo -e "${YELLOW}💡 Continue anyway? This is for testing/development only${NC}"
        RELEASE_TYPE="development"
    else
        echo -e "${RED}❌ Unsupported branch for version bump${NC}"
        echo -e "${YELLOW}💡 Current branch: $CURRENT_BRANCH${NC}"
        echo -e "${YELLOW}💡 Allowed: main, release/*, feature/*${NC}"
        exit 1
    fi

    # Check if working directory is clean (only for production releases)
    if [ "$RELEASE_TYPE" = "production" ] && [ -n "$(git status --porcelain)" ]; then
        echo -e "${RED}❌ Working directory must be clean for production release${NC}"
        echo -e "${YELLOW}💡 Commit or stash changes first${NC}"
        exit 1
    elif [ "$RELEASE_TYPE" != "production" ] && [ -n "$(git status --porcelain)" ]; then
        echo -e "${YELLOW}⚠️  Working directory not clean - OK for development release${NC}"
    fi
    
    echo -e "${GREEN}✅ Git validations passed (${RELEASE_TYPE})${NC}"
else
    echo -e "${YELLOW}⏭️  Skipping git validations${NC}"
    RELEASE_TYPE="manual"
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

# Apply pre-release tag if specified
if [ -n "$PRERELEASE_TAG" ]; then
    TIMESTAMP=$(date +%s)
    PRERELEASE_VERSION="${NEW_VERSION}-${PRERELEASE_TAG}.${TIMESTAMP}"
    
    echo -e "${BLUE}🏷️  Applying pre-release tag...${NC}"
    
    # Update package.json with pre-release version
    node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    pkg.version = '${PRERELEASE_VERSION}';
    fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    
    NEW_VERSION="$PRERELEASE_VERSION"
    echo -e "${GREEN}✅ Pre-release version: $NEW_VERSION${NC}"
else
    echo -e "${GREEN}✅ New version: $NEW_VERSION${NC}"
fi

# Commit version change (intelligent based on release type)
if [ "$SKIP_GIT" = false ]; then
    echo -e "${BLUE}💾 Committing version change...${NC}"
    git add package.json
    git commit -m "chore(cli): bump version to $NEW_VERSION"
    
    # Smart push based on release type
    if [ "$RELEASE_TYPE" = "production" ]; then
        echo -e "${BLUE}📤 Pushing to main (production release)...${NC}"
        git push origin main
    elif [ "$RELEASE_TYPE" = "release-prep" ]; then
        echo -e "${YELLOW}📤 Pushing to release branch...${NC}"
        git push origin "$CURRENT_BRANCH"
        echo -e "${YELLOW}💡 Next: Merge release branch to main${NC}"
    elif [ "$RELEASE_TYPE" = "development" ]; then
        echo -e "${YELLOW}📤 Pushing to feature branch (development)...${NC}"
        git push origin "$CURRENT_BRANCH"
        echo -e "${YELLOW}💡 This is a development release - create PR when ready${NC}"
    else
        echo -e "${YELLOW}💡 Manual push required${NC}"
    fi
else
    echo -e "${YELLOW}⏭️  Skipping git commit (--skip-git)${NC}"
fi

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

