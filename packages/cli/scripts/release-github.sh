#!/bin/bash

# Release GitHub - Creates GitHub release with NPM packages
# Usage: ./scripts/release-github.sh [flags]
# Note: Run this AFTER release-npm.sh to ensure packages are built and NPM is published
# Version is automatically read from package.json (set by version.sh)
# Flags:
#   --skip-packages-check    Skip packages validation
#   --skip-tag               Skip git tag validation
#   --skip-npm-check         Skip NPM publication validation
#   --skip-release           Skip creating GitHub release (dry run)
#   --skip-all               Skip all validations
#   --notes-file <file>      Use custom release notes from file

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse flags
SKIP_PACKAGES_CHECK=false
SKIP_TAG=false
SKIP_NPM_CHECK=false
SKIP_RELEASE=false
SKIP_ALL=false
NOTES_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-packages-check)
            SKIP_PACKAGES_CHECK=true
            shift
            ;;
        --skip-tag)
            SKIP_TAG=true
            shift
            ;;
        --skip-npm-check)
            SKIP_NPM_CHECK=true
            shift
            ;;
        --skip-release)
            SKIP_RELEASE=true
            shift
            ;;
        --skip-all)
            SKIP_ALL=true
            SKIP_PACKAGES_CHECK=true
            SKIP_TAG=true
            SKIP_NPM_CHECK=true
            SKIP_RELEASE=true
            shift
            ;;
        --notes-file)
            shift
            NOTES_FILE="$1"
            shift
            ;;
        --*)
            echo -e "${RED}❌ Unknown flag: $1${NC}"
            echo -e "${YELLOW}💡 Usage: ./scripts/release-github.sh [--skip-flags] [--notes-file <file>]${NC}"
            exit 1
            ;;
        *)
            echo -e "${RED}❌ Unknown argument: $1${NC}"
            echo -e "${YELLOW}💡 Version is automatically read from package.json${NC}"
            echo -e "${YELLOW}💡 Usage: ./scripts/release-github.sh [--skip-flags] [--notes-file <file>]${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}🐙 GitGovernance CLI - GitHub Release${NC}"
echo -e "${BLUE}====================================${NC}"

# Get version from package.json (set by version.sh)
VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}📦 Version from package.json: ${VERSION}${NC}"

# Show skip flags if any
if [ "$SKIP_ALL" = true ]; then
    echo -e "${YELLOW}⚠️  Skipping ALL validations${NC}"
elif [ "$SKIP_PACKAGES_CHECK" = true ] || [ "$SKIP_TAG" = true ] || [ "$SKIP_NPM_CHECK" = true ] || [ "$SKIP_RELEASE" = true ]; then
    echo -e "${YELLOW}⚠️  Skipping:${NC}"
    [ "$SKIP_PACKAGES_CHECK" = true ] && echo -e "${YELLOW}   - Packages validation${NC}"
    [ "$SKIP_TAG" = true ] && echo -e "${YELLOW}   - Git tag validation${NC}"
    [ "$SKIP_NPM_CHECK" = true ] && echo -e "${YELLOW}   - NPM publication validation${NC}"
    [ "$SKIP_RELEASE" = true ] && echo -e "${YELLOW}   - GitHub release creation${NC}"
fi

TAG_NAME="cli-v$VERSION"

echo -e "${YELLOW}🏷️  Tag: $TAG_NAME${NC}"

# Check if tag exists
if [ "$SKIP_TAG" = false ]; then
    if ! git tag -l | grep -q "^$TAG_NAME$"; then
        echo -e "${RED}❌ Tag $TAG_NAME does not exist${NC}"
        echo -e "${YELLOW}💡 Run: pnpm version:bump --patch|--minor|--major to create the tag${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Tag $TAG_NAME exists${NC}"
else
    echo -e "${YELLOW}⏭️  Skipping tag validation${NC}"
fi

# Check if NPM package is published
if [ "$SKIP_NPM_CHECK" = false ]; then
    echo -e "${BLUE}🔍 Checking NPM publication...${NC}"
    
    # Check if version exists on NPM
    if npm view "@gitgov/cli@$VERSION" version >/dev/null 2>&1; then
        echo -e "${GREEN}✅ NPM package @gitgov/cli@$VERSION is published${NC}"
    else
        echo -e "${RED}❌ NPM package @gitgov/cli@$VERSION not found${NC}"
        echo -e "${YELLOW}💡 Run: pnpm release:npm first to publish to NPM${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⏭️  Skipping NPM publication validation${NC}"
fi

# Check if packages exist
if [ "$SKIP_PACKAGES_CHECK" = false ]; then
    echo -e "${BLUE}🔍 Checking release packages...${NC}"
    
    if [ ! -d "build/packages" ]; then
        echo -e "${RED}❌ No packages directory found${NC}"
        echo -e "${YELLOW}💡 Run: pnpm build:npm${NC}"
        exit 1
    fi
    
    # Check for package
    PACKAGE_FILE="gitgov-cli-${VERSION}.tar.gz"
    if [ ! -f "build/packages/$PACKAGE_FILE" ]; then
        echo -e "${RED}❌ Missing package: $PACKAGE_FILE${NC}"
        echo -e "${YELLOW}💡 Run: pnpm build:npm${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Release package found${NC}"
    
    # Show package size
    echo -e "${BLUE}📦 Package size:${NC}"
    size=$(stat -f%z "build/packages/$PACKAGE_FILE" 2>/dev/null || stat -c%s "build/packages/$PACKAGE_FILE")
    size_mb=$(echo "scale=2; $size / 1024 / 1024" | bc)
    echo -e "  ${GREEN}✅${NC} $PACKAGE_FILE (${size_mb}MB)"
else
    echo -e "${YELLOW}⏭️  Skipping packages validation${NC}"
fi

# Check if GitHub CLI is available
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ GitHub CLI (gh) is required${NC}"
    echo -e "${YELLOW}💡 Install with: brew install gh${NC}"
    exit 1
fi

# Check GitHub authentication
echo -e "${BLUE}🔐 Checking GitHub authentication...${NC}"
if ! gh auth status >/dev/null 2>&1; then
    echo -e "${RED}❌ Not authenticated with GitHub${NC}"
    echo -e "${YELLOW}💡 Run: gh auth login${NC}"
    exit 1
fi
echo -e "${GREEN}✅ GitHub authentication verified${NC}"

# Create GitHub release
if [ "$SKIP_RELEASE" = false ]; then
    echo -e "${BLUE}🚀 Creating GitHub release...${NC}"
else
    echo -e "${YELLOW}⏭️  Skipping GitHub release creation (dry run)${NC}"
    echo -e "${GREEN}✅ All validations passed - ready for release!${NC}"
    exit 0
fi

# Generate release notes
if [ -n "$NOTES_FILE" ] && [ -f "$NOTES_FILE" ]; then
    echo -e "${BLUE}📝 Using custom release notes from: $NOTES_FILE${NC}"
    RELEASE_NOTES=$(cat "$NOTES_FILE")
else
    echo -e "${BLUE}📝 Using default release notes${NC}"
    RELEASE_NOTES="## GitGovernance CLI v$VERSION

### 🚀 Installation

#### NPM (Recommended)
\`\`\`bash
npm install -g @gitgov/cli
\`\`\`

#### Direct Download
Download and install the tarball package:

\`\`\`bash
# Download and install globally
curl -L https://github.com/gitgovernance/monorepo/releases/download/cli-v$VERSION/gitgov-cli-${VERSION}.tar.gz -o gitgov-cli.tar.gz
npm install -g ./gitgov-cli.tar.gz

# Or extract and run locally
tar -xzf gitgov-cli.tar.gz
cd gitgov-cli
npm install  # Install dependencies
./bin/gitgov --version
\`\`\`

### 📦 What's Changed
- Bug fixes and improvements
- Enhanced stability and performance
- Updated dependencies

### 🔗 Links
- [NPM Package](https://www.npmjs.com/package/@gitgov/cli)
- [Documentation](https://github.com/gitgovernance/monorepo/tree/main/packages/cli#readme)
- [Checksum](https://github.com/gitgovernance/monorepo/releases/download/cli-v$VERSION/gitgov-cli-${VERSION}.tar.gz.sha256)"
fi

# Create release with all package artifacts
echo -e "${BLUE}📤 Uploading release artifacts...${NC}"
gh release create "$TAG_NAME" \
    --title "GitGovernance CLI v$VERSION" \
    --notes "$RELEASE_NOTES" \
    build/packages/*.tar.gz \
    build/packages/*.sha256

# Verify release was created
echo -e "${BLUE}🔍 Verifying release...${NC}"
if gh release view "$TAG_NAME" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Release verified successfully${NC}"
else
    echo -e "${RED}❌ Release verification failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ GitHub Release completed successfully!${NC}"
echo -e "${GREEN}🐙 Release $TAG_NAME created with all package artifacts${NC}"
echo -e "${BLUE}🔗 View release: https://github.com/gitgovernance/monorepo/releases/tag/$TAG_NAME${NC}"