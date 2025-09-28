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
GITGOV_VERSION="latest"
REPO_URL="https://github.com/gitgovernance/monorepo"
GITHUB_RELEASES_URL="https://api.github.com/repos/gitgovernance/monorepo/releases/latest"
INSTALL_DIR="$HOME/.gitgov"
BIN_DIR="$HOME/.local/bin"

echo -e "${BLUE}${BOLD}"
echo "🚀 GitGovernance CLI Installer"
echo "=============================="
echo "The future of human-agent collaboration"
echo -e "${NC}"

# Detect platform and architecture
detect_platform() {
    local os=""
    local arch=""
    
    case "$(uname -s)" in
        Linux*)     os="linux" ;;
        Darwin*)    os="darwin" ;;
        MINGW*|CYGWIN*|MSYS*) os="win32" ;;
        *)          echo -e "${RED}❌ Unsupported operating system: $(uname -s)${NC}"; exit 1 ;;
    esac
    
    case "$(uname -m)" in
        x86_64|amd64)   arch="x64" ;;
        arm64|aarch64)  arch="arm64" ;;
        *)              echo -e "${RED}❌ Unsupported architecture: $(uname -m)${NC}"; exit 1 ;;
    esac
    
    if [[ "$os" == "win32" ]]; then
        echo "gitgov-${os}-${arch}.exe"
    else
        echo "gitgov-${os}-${arch}"
    fi
}

BINARY_NAME=$(detect_platform)
echo -e "${GREEN}✅ Platform detected: $BINARY_NAME${NC}"

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

# Download binary from GitHub Releases
echo "📥 Downloading GitGovernance CLI binary..."

# Get latest release info
RELEASE_INFO=$(curl -s "$GITHUB_RELEASES_URL")
DOWNLOAD_URL=$(echo "$RELEASE_INFO" | grep -o "https://github.com/gitgovernance/monorepo/releases/download/[^\"]*/$BINARY_NAME" | head -1)

if [ -z "$DOWNLOAD_URL" ]; then
    echo -e "${RED}❌ Could not find binary for your platform: $BINARY_NAME${NC}"
    echo -e "${YELLOW}💡 Try: npm install -g @gitgov/cli${NC}"
    exit 1
fi

echo "🔗 Download URL: $DOWNLOAD_URL"

# Download binary
curl -fsSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/gitgov"
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to download GitGovernance CLI${NC}"
    exit 1
fi

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
