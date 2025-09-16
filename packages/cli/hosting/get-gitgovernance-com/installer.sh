#!/bin/bash
# GitGovernance CLI Installer
# Usage: curl -sSL https://get.gitgovernance.com | sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
GITGOV_VERSION="1.0.0"
REPO_URL="https://github.com/solocompanyai/solo-hub"
INSTALL_DIR="$HOME/.gitgov"
BIN_DIR="$HOME/.local/bin"

echo -e "${BLUE}${BOLD}"
echo "🚀 GitGovernance CLI Installer"
echo "=============================="
echo "The future of human-agent collaboration"
echo -e "${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is required but not installed.${NC}"
    echo -e "${YELLOW}💡 Install Node.js from: https://nodejs.org${NC}"
    echo -e "${YELLOW}   Minimum version: 18.0.0${NC}"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✅ Node.js detected: $NODE_VERSION${NC}"

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is required but not installed.${NC}"
    exit 1
fi

NPM_VERSION=$(npm --version)
echo -e "${GREEN}✅ npm detected: $NPM_VERSION${NC}"

# Check if running on macOS (MVP limitation)
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}❌ This installer currently supports macOS only (MVP).${NC}"
    echo -e "${YELLOW}💡 For other platforms, use: npm install -g @gitgov/cli${NC}"
    exit 1
fi

echo -e "${GREEN}✅ macOS detected${NC}"

# Check if Git is available
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}⚠️  Git not found. GitGovernance works best with Git repositories.${NC}"
    echo -e "${YELLOW}💡 Install Git from: https://git-scm.com${NC}"
fi

echo ""
echo -e "${BLUE}📦 Installing GitGovernance CLI...${NC}"

# Create installation directory
mkdir -p "$INSTALL_DIR"
mkdir -p "$BIN_DIR"

# For MVP: Clone and install from source
echo "📥 Downloading GitGovernance..."
if [ -d "$INSTALL_DIR/source" ]; then
    rm -rf "$INSTALL_DIR/source"
fi

git clone --depth 1 "$REPO_URL" "$INSTALL_DIR/source" > /dev/null 2>&1

# Navigate to CLI package and install
echo "🔧 Setting up CLI..."
cd "$INSTALL_DIR/source/packages/cli"

# Install dependencies
npm install > /dev/null 2>&1

# Create executable wrapper (based on working gitgov-local)
echo "⚡ Creating executable..."
cat > "$INSTALL_DIR/gitgov" << 'EOF'
#!/bin/bash
# GitGovernance CLI - Production Wrapper

# Store original directory where user executed command
export GITGOV_ORIGINAL_DIR="$(pwd)"

# Execute CLI from source with proper context
cd "INSTALL_DIR_PLACEHOLDER/source/packages/cli"
npx tsx src/index.ts "$@"
EOF

# Fix the install directory placeholder
sed -i '' "s|INSTALL_DIR_PLACEHOLDER|$INSTALL_DIR|g" "$INSTALL_DIR/gitgov"

chmod +x "$INSTALL_DIR/gitgov"

# Create symlink to bin directory
ln -sf "$INSTALL_DIR/gitgov" "$BIN_DIR/gitgov"

# Verify installation
if command -v gitgov &> /dev/null; then
    echo -e "${GREEN}✅ GitGovernance CLI installed successfully!${NC}"
else
    echo -e "${YELLOW}⚠️  GitGovernance CLI installed but not in PATH.${NC}"
    echo -e "${YELLOW}📝 Add this to your shell profile (~/.zshrc or ~/.bashrc):${NC}"
    echo "   export PATH=\"\$PATH:$BIN_DIR\""
    echo ""
    echo -e "${YELLOW}🔄 Then reload your shell:${NC}"
    echo "   source ~/.zshrc"
    echo ""
fi

# Show installation info
echo ""
echo -e "${BLUE}${BOLD}🎉 Installation Complete!${NC}"
echo -e "${BLUE}========================${NC}"
echo "📍 Installed to: $INSTALL_DIR"
echo "🔗 Command: gitgov"
echo "📋 Version: $GITGOV_VERSION"
echo ""

# Show next steps
echo -e "${BLUE}${BOLD}🚀 Perfect First Impression Ready!${NC}"
echo ""
echo -e "${GREEN}Quick Start:${NC}"
echo "1. Navigate to your project: ${YELLOW}cd /path/to/your/project${NC}"
echo "2. Initialize Git repo: ${YELLOW}git init${NC} (if needed)"
echo "3. Initialize GitGovernance: ${GREEN}gitgov init --name \"My Project\"${NC}"
echo "4. View your dashboard: ${GREEN}gitgov status${NC}"
echo "5. Launch interactive TUI: ${GREEN}gitgov dashboard${NC}"
echo ""

echo -e "${BLUE}💡 Available Commands:${NC}"
echo "  ${GREEN}gitgov init${NC}      - Initialize project"
echo "  ${GREEN}gitgov status${NC}    - Project dashboard"
echo "  ${GREEN}gitgov task${NC}      - Manage tasks"
echo "  ${GREEN}gitgov cycle${NC}     - Strategic planning"
echo "  ${GREEN}gitgov dashboard${NC} - Interactive TUI"
echo "  ${GREEN}gitgov diagram${NC}   - Workflow visualization"
echo ""

echo -e "${BLUE}🌟 Welcome to the future of human-agent collaboration!${NC}"
