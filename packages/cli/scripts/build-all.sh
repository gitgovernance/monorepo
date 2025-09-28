#!/bin/bash

# Build All - Generates both NPM packages and standalone binaries
# Usage: ./scripts/build-all.sh [version]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 GitGovernance CLI - Build All${NC}"
echo -e "${BLUE}=================================${NC}"

# Get version from package.json if not provided as argument
if [ -z "$1" ]; then
    VERSION=$(node -p "require('./package.json').version")
else
    VERSION="$1"
fi

echo -e "${YELLOW}📦 Version: $VERSION${NC}"
echo ""

# Build NPM packages
echo -e "${BLUE}🏗️  Building NPM packages...${NC}"
./scripts/build-packages.sh "$VERSION"

echo ""

# Build standalone binaries
echo -e "${BLUE}🔨 Building standalone binaries...${NC}"
./scripts/build-binaries.sh

echo ""
echo -e "${GREEN}✅ Build All completed successfully!${NC}"
echo -e "${GREEN}📁 Check releases/ directory for all artifacts${NC}"
