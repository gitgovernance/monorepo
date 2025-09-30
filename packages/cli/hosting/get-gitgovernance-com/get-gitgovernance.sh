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
REQUIRED_NODE_VERSION="18"
NPM_PACKAGE="@gitgov/cli"

echo ""
echo "🚀 GitGovernance CLI Installer"
echo "=============================="
echo "The future of human-agent collaboration"
echo ""

# Check Node.js availability and version
check_nodejs() {
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js is required but not installed.${NC}"
        echo -e "${YELLOW}💡 Install Node.js from: https://nodejs.org${NC}"
        echo -e "${YELLOW}💡 Recommended: Use nvm for easy version management${NC}"
        exit 1
    fi
    
    local node_version=$(node --version | sed 's/v//')
    local major_version=$(echo "$node_version" | cut -d. -f1)
    
    if [ "$major_version" -lt "$REQUIRED_NODE_VERSION" ]; then
        echo -e "${RED}❌ Node.js version $major_version detected, but version $REQUIRED_NODE_VERSION+ is required.${NC}"
        echo -e "${YELLOW}💡 Update Node.js from: https://nodejs.org${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Node.js v$node_version detected${NC}"
}

# Check npm availability
check_npm() {
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm is required but not installed.${NC}"
        echo -e "${YELLOW}💡 npm usually comes with Node.js. Reinstall Node.js from: https://nodejs.org${NC}"
        exit 1
    fi
    
    local npm_version=$(npm --version)
    echo -e "${GREEN}✅ npm v$npm_version detected${NC}"
}

echo -e "${BLUE}🔍 Checking system requirements...${NC}"
check_nodejs
check_npm

# Check if Git is available (optional but recommended)
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}⚠️  Git not found. GitGovernance works best with Git repositories.${NC}"
    echo -e "${YELLOW}💡 Install Git from: https://git-scm.com${NC}"
else
    git_version=$(git --version | cut -d' ' -f3)
    echo -e "${GREEN}✅ Git v$git_version detected${NC}"
fi

echo ""
echo -e "${BLUE}📦 Installing GitGovernance CLI via NPM...${NC}"

# Install GitGovernance CLI globally via npm
echo "🔄 Running: npm install -g $NPM_PACKAGE"
if npm install -g "$NPM_PACKAGE"; then
    echo -e "${GREEN}✅ GitGovernance CLI installed successfully via NPM!${NC}"
else
    echo -e "${RED}❌ Failed to install GitGovernance CLI${NC}"
    echo -e "${YELLOW}💡 You may need to run with sudo: sudo npm install -g $NPM_PACKAGE${NC}"
    echo -e "${YELLOW}💡 Or configure npm to install packages globally without sudo${NC}"
    exit 1
fi

# Verify installation and get version
echo ""
echo -e "${BLUE}🔍 Verifying installation...${NC}"
if command -v gitgov &> /dev/null; then
    installed_version=$(gitgov --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✅ GitGovernance CLI is ready!${NC}"
    echo -e "${BLUE}📋 Version: $installed_version${NC}"
else
    echo -e "${YELLOW}⚠️  GitGovernance CLI installed but not in PATH.${NC}"
    echo -e "${YELLOW}💡 Try restarting your terminal or run: hash -r${NC}"
fi

# Show installation info
echo ""
echo -e "${BLUE}${BOLD}🎉 Installation Complete!${NC}"
echo -e "${BLUE}========================${NC}"
echo -e "📦 Package: $NPM_PACKAGE"
echo -e "🔗 Command: gitgov"
echo -e "🌐 Installed globally via NPM"
echo ""

# Show next steps
echo -e "${BLUE}${BOLD}🚀 Perfect First Impression Ready!${NC}"
echo ""
echo -e "${GREEN}Quick Start:${NC}"
echo -e "1. Navigate to your project: ${YELLOW}cd /path/to/your/project${NC}"
echo -e "2. Initialize Git repo: ${YELLOW}git init${NC} (if needed)"
echo -e "3. Initialize GitGovernance: ${GREEN}gitgov init --name \"My Project\"${NC}"
echo -e "4. View your dashboard: ${GREEN}gitgov status${NC}"
echo -e "5. Launch interactive TUI: ${GREEN}gitgov dashboard${NC}"
echo ""

echo -e "${BLUE}💡 Available Commands:${NC}"
echo -e "  ${GREEN}gitgov init${NC}      - Initialize project"
echo -e "  ${GREEN}gitgov status${NC}    - Project dashboard"
echo -e "  ${GREEN}gitgov task${NC}      - Manage tasks"
echo -e "  ${GREEN}gitgov cycle${NC}     - Strategic planning"
echo -e "  ${GREEN}gitgov dashboard${NC} - Interactive TUI"
echo -e "  ${GREEN}gitgov diagram${NC}   - Workflow visualization"
echo ""

echo -e "${BLUE}🌟 Welcome to the future of human-agent collaboration!${NC}"
