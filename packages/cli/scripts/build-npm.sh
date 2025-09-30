#!/bin/bash
# GitGovernance CLI - NPM Package Builder
# Creates tarball package for direct installation
# Usage: ./scripts/build-npm.sh [flags]
# Flags:
#   --skip-core-check     Skip core build validation
#   --skip-cli-check      Skip CLI build validation
#   --skip-clean          Skip cleaning existing packages
#   --skip-tests          Skip test validation
#   --skip-all            Skip all validations

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments and flags
VERSION=""
SKIP_CORE_CHECK=false
SKIP_CLI_CHECK=false
SKIP_CLEAN=false
SKIP_TESTS=false
SKIP_ALL=false

for arg in "$@"; do
    case $arg in
        --skip-core-check)
            SKIP_CORE_CHECK=true
            ;;
        --skip-cli-check)
            SKIP_CLI_CHECK=true
            ;;
        --skip-clean)
            SKIP_CLEAN=true
            ;;
        --skip-tests)
            SKIP_TESTS=true
            ;;
        --skip-all)
            SKIP_ALL=true
            SKIP_CORE_CHECK=true
            SKIP_CLI_CHECK=true
            SKIP_CLEAN=true
            SKIP_TESTS=true
            ;;
        --*)
            # Ignore other flags
            ;;
        *)
            # First non-flag argument is version
            if [ -z "$VERSION" ]; then
                VERSION="$arg"
            fi
            ;;
    esac
done

# Get version from package.json if not provided
if [ -z "$VERSION" ]; then
    VERSION=$(node -p "require('./package.json').version")
fi

RELEASE_DIR="build/packages"

echo -e "${BLUE}🚀 Building GitGovernance CLI Release v$VERSION${NC}"
echo -e "${BLUE}================================================${NC}"

# Show skip flags if any
if [ "$SKIP_ALL" = true ]; then
    echo -e "${YELLOW}⚠️  Skipping ALL validations${NC}"
elif [ "$SKIP_CORE_CHECK" = true ] || [ "$SKIP_CLI_CHECK" = true ] || [ "$SKIP_CLEAN" = true ] || [ "$SKIP_TESTS" = true ]; then
    echo -e "${YELLOW}⚠️  Skipping:${NC}"
    [ "$SKIP_CORE_CHECK" = true ] && echo -e "${YELLOW}   - Core validation${NC}"
    [ "$SKIP_CLI_CHECK" = true ] && echo -e "${YELLOW}   - CLI validation${NC}"
    [ "$SKIP_CLEAN" = true ] && echo -e "${YELLOW}   - Clean packages${NC}"
    [ "$SKIP_TESTS" = true ] && echo -e "${YELLOW}   - Tests validation${NC}"
fi

# Clean and create release directory
if [ "$SKIP_CLEAN" = false ]; then
    echo -e "${BLUE}🧹 Cleaning and rebuilding...${NC}"
    pnpm clean
    pnpm build
    mkdir -p "$RELEASE_DIR"
    echo -e "${GREEN}✅ Build directory cleaned and rebuilt${NC}"
else
    mkdir -p "$RELEASE_DIR"
    echo -e "${YELLOW}⏭️  Skipping clean, using existing packages${NC}"
fi

# Core validation
if [ "$SKIP_CORE_CHECK" = false ]; then
    echo -e "${BLUE}🔍 Checking core dependencies...${NC}"
    if [ ! -d "../core/dist" ]; then
        echo -e "${RED}❌ Core not built${NC}"
        echo -e "${YELLOW}💡 Run: cd ../core && pnpm build${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Core dependencies found${NC}"
else
    echo -e "${YELLOW}⏭️  Skipping core validation${NC}"
fi

# CLI validation
if [ "$SKIP_CLI_CHECK" = false ]; then
    echo -e "${BLUE}🔍 Checking CLI build...${NC}"
    if [ ! -d "build/dist" ] || [ ! -f "build/dist/gitgov.mjs" ]; then
        echo -e "${RED}❌ CLI not built${NC}"
        echo -e "${YELLOW}💡 Run: pnpm build${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ CLI build found${NC}"
else
    echo -e "${YELLOW}⏭️  Skipping CLI validation${NC}"
fi

# Test validation
if [ "$SKIP_TESTS" = false ]; then
    echo -e "${BLUE}🧪 Running tests...${NC}"
    if ! pnpm test >/dev/null 2>&1; then
        echo -e "${RED}❌ Tests failed${NC}"
        echo -e "${YELLOW}💡 Fix failing tests before creating packages${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Tests passed${NC}"
else
    echo -e "${YELLOW}⏭️  Skipping tests validation${NC}"
fi

# Create single generic package
echo -e "${BLUE}🔨 Building generic package...${NC}"

# Create package directory
package_dir="$RELEASE_DIR/gitgov-cli"
mkdir -p "$package_dir/bin"

# Copy executable
cp build/dist/gitgov.mjs "$package_dir/bin/gitgov"
chmod +x "$package_dir/bin/gitgov"

# Copy original package.json and update bin path
cp package.json "$package_dir/package.json"

# Update bin path for tarball structure
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$package_dir/package.json', 'utf8'));
pkg.bin = { 'gitgov': './bin/gitgov' };
fs.writeFileSync('$package_dir/package.json', JSON.stringify(pkg, null, 2));
"

# Copy original README
cp README.md "$package_dir/README.md"

# Create tarball
echo -e "${BLUE}📦 Creating tarball...${NC}"
cd "$RELEASE_DIR"
tar -czf "gitgov-cli-${VERSION}.tar.gz" "gitgov-cli"
cd - > /dev/null

# Calculate checksum
shasum -a 256 "$RELEASE_DIR/gitgov-cli-${VERSION}.tar.gz" > "$RELEASE_DIR/gitgov-cli-${VERSION}.tar.gz.sha256"

echo -e "${GREEN}✅ Package created: gitgov-cli-${VERSION}.tar.gz${NC}"

# Summary
echo ""
echo -e "${GREEN}🎉 Release v$VERSION built successfully!${NC}"
echo -e "${BLUE}📁 Release directory: $RELEASE_DIR${NC}"
echo ""
size=$(stat -f%z "$RELEASE_DIR/gitgov-cli-${VERSION}.tar.gz" 2>/dev/null || stat -c%s "$RELEASE_DIR/gitgov-cli-${VERSION}.tar.gz")
size_mb=$(echo "scale=2; $size / 1024 / 1024" | bc)
echo -e "${YELLOW}📦 Package created:${NC}"
echo -e "  ${GREEN}✅${NC} gitgov-cli-${VERSION}.tar.gz (${size_mb}MB)"
echo ""
echo -e "${BLUE}💡 Test with: npm install -g ./build/packages/gitgov-cli-${VERSION}.tar.gz${NC}"
