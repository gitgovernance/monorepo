#!/bin/bash
# GitGovernance CLI - Release Builder
# Creates professional distribution packages for all platforms

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
# Get version from package.json if not provided as argument
if [ -z "$1" ]; then
    VERSION=$(node -p "require('./package.json').version")
else
    VERSION="$1"
fi
RELEASE_DIR="releases"
PLATFORMS=("macos-x64" "macos-arm64" "linux-x64" "linux-arm64")

echo -e "${BLUE}🚀 Building GitGovernance CLI Release v$VERSION${NC}"
echo -e "${BLUE}================================================${NC}"

# Clean and create release directory (preserve install.sh)
if [ -f "$RELEASE_DIR/install.sh" ]; then
    cp "$RELEASE_DIR/install.sh" "/tmp/install.sh.backup"
fi
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
if [ -f "/tmp/install.sh.backup" ]; then
    cp "/tmp/install.sh.backup" "$RELEASE_DIR/install.sh"
    rm "/tmp/install.sh.backup"
fi

# Build core first
echo -e "${BLUE}📦 Building core dependencies...${NC}"
cd ../core && pnpm build
cd ../cli

# Build CLI with bundle for production
echo -e "${BLUE}📦 Building CLI...${NC}"
pnpm build
echo -e "${BLUE}📦 Creating production bundle...${NC}"
pnpm build:bundle

# Create release packages for each platform
for platform in "${PLATFORMS[@]}"; do
    echo -e "${BLUE}🔨 Building package for $platform...${NC}"
    
    # Create platform directory
    platform_dir="$RELEASE_DIR/$platform"
    mkdir -p "$platform_dir/bin"
    mkdir -p "$platform_dir/lib"
    
    # Copy built CLI (regular build for lib structure)
    cp -r dist/* "$platform_dir/lib/"
    
    # Copy production bundle as main executable (no wrapper needed)
    cp dist/bundle.cjs "$platform_dir/bin/gitgov"
    chmod +x "$platform_dir/bin/gitgov"
    
    chmod +x "$platform_dir/bin/gitgov"
    
    # Create package info
    cat > "$platform_dir/package.json" << EOF
{
  "name": "@gitgov/cli",
  "version": "$VERSION",
  "description": "GitGovernance CLI - AI-first project governance",
  "type": "module",
  "bin": {
    "gitgov": "./bin/gitgov"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "homepage": "https://gitgovernance.com",
  "repository": "https://github.com/gitgovernance/monorepo",
  "license": "Apache-2.0"
}
EOF
    
    # Create README
    cat > "$platform_dir/README.md" << EOF
# GitGovernance CLI v$VERSION

AI-first project governance for modern development teams.

## Quick Start

\`\`\`bash
# Initialize a project
gitgov init

# Check project status  
gitgov status

# Interactive dashboard
gitgov dashboard

# Headless dashboard data
gitgov dashboard --json
\`\`\`

## Documentation

- **Website**: https://gitgovernance.com
- **Docs**: https://docs.gitgovernance.com  
- **GitHub**: https://github.com/gitgovernance/monorepo

## Support

- **Issues**: https://github.com/gitgovernance/monorepo/issues
- **Discussions**: https://github.com/gitgovernance/monorepo/discussions

---

© 2025 GitGovernance Team
EOF
    
    # Create tarball
    echo -e "${BLUE}📦 Creating tarball for $platform...${NC}"
    cd "$RELEASE_DIR"
    tar -czf "gitgov-cli-$platform.tar.gz" "$platform"
    cd ..
    
    # Calculate checksum
    shasum -a 256 "$RELEASE_DIR/gitgov-cli-$platform.tar.gz" > "$RELEASE_DIR/gitgov-cli-$platform.tar.gz.sha256"
    
    echo -e "${GREEN}✅ Package created: gitgov-cli-$platform.tar.gz${NC}"
done

# Create release manifest
echo -e "${BLUE}📋 Creating release manifest...${NC}"
cat > "$RELEASE_DIR/manifest.json" << EOF
{
  "version": "$VERSION",
  "releaseDate": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "platforms": {
EOF

first=true
for platform in "${PLATFORMS[@]}"; do
    if [ "$first" = true ]; then
        first=false
    else
        echo "," >> "$RELEASE_DIR/manifest.json"
    fi
    
    checksum=$(cat "$RELEASE_DIR/gitgov-cli-$platform.tar.gz.sha256" | cut -d' ' -f1)
    size=$(stat -f%z "$RELEASE_DIR/gitgov-cli-$platform.tar.gz" 2>/dev/null || stat -c%s "$RELEASE_DIR/gitgov-cli-$platform.tar.gz")
    
    cat >> "$RELEASE_DIR/manifest.json" << EOF
    "$platform": {
      "filename": "gitgov-cli-$platform.tar.gz",
      "checksum": "$checksum",
      "size": $size,
      "downloadUrl": "https://github.com/gitgovernance/monorepo/releases/download/v$VERSION/gitgov-cli-$platform.tar.gz"
    }
EOF
done

cat >> "$RELEASE_DIR/manifest.json" << EOF
  },
  "installer": {
    "url": "https://get.gitgovernance.com",
    "script": "https://raw.githubusercontent.com/gitgovernance/monorepo/main/packages/cli/scripts/install-production.sh"
  }
}
EOF

echo -e "${GREEN}✅ Release manifest created${NC}"

# Summary
echo ""
echo -e "${GREEN}🎉 Release v$VERSION built successfully!${NC}"
echo -e "${BLUE}📁 Release directory: $RELEASE_DIR${NC}"
echo ""
echo -e "${YELLOW}📦 Packages created:${NC}"
for platform in "${PLATFORMS[@]}"; do
    size=$(stat -f%z "$RELEASE_DIR/gitgov-cli-$platform.tar.gz" 2>/dev/null || stat -c%s "$RELEASE_DIR/gitgov-cli-$platform.tar.gz")
    size_mb=$(echo "scale=2; $size / 1024 / 1024" | bc)
    echo -e "  ${GREEN}✅${NC} gitgov-cli-$platform.tar.gz (${size_mb}MB)"
done

echo ""
echo -e "${BLUE}🚀 Next steps:${NC}"
echo -e "  1. Upload packages to GitHub Releases"
echo -e "  2. Update get.gitgovernance.com with install script"
echo -e "  3. Test installation: curl -sSL https://get.gitgovernance.com | sh"
