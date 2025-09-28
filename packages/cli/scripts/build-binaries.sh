#!/bin/bash
# GitGovernance CLI - Multi-Platform Binary Builder
# Creates SEA binaries for all supported platforms

set -e

# Configuration
PLATFORMS=("linux-x64" "linux-arm64" "darwin-x64" "darwin-arm64" "win32-x64")
NODE_VERSION="20.11.0"  # LTS version
BUILD_DIR="build"
RELEASES_DIR="releases/binaries"
TEMP_DIR="$BUILD_DIR/temp"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

print_status "Building GitGovernance CLI binaries for all platforms..."

# Ensure bundles are built
if [ ! -f "dist/cli-tui.cjs" ] || [ ! -f "dist/bundle.cjs" ]; then
    print_status "Building bundles first..."
    pnpm build
fi

# Create directories after build (to avoid clean removing them)
mkdir -p "$BUILD_DIR"
mkdir -p "$RELEASES_DIR"
mkdir -p "$TEMP_DIR"

# Generate SEA blobs
print_status "Generating SEA blobs..."
pnpm sea:tui

# Function to download Node.js binary for platform
download_node_binary() {
    local platform=$1
    local node_url=""
    local node_filename=""
    
    case "$platform" in
        "linux-x64")
            node_url="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
            node_filename="node-v${NODE_VERSION}-linux-x64.tar.xz"
            ;;
        "linux-arm64")
            node_url="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-arm64.tar.xz"
            node_filename="node-v${NODE_VERSION}-linux-arm64.tar.xz"
            ;;
        "darwin-x64")
            node_url="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-x64.tar.xz"
            node_filename="node-v${NODE_VERSION}-darwin-x64.tar.xz"
            ;;
        "darwin-arm64")
            node_url="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-arm64.tar.xz"
            node_filename="node-v${NODE_VERSION}-darwin-arm64.tar.xz"
            ;;
        "win32-x64")
            node_url="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip"
            node_filename="node-v${NODE_VERSION}-win-x64.zip"
            ;;
        *)
            print_error "Unsupported platform: $platform"
            return 1
            ;;
    esac
    
    local cache_file="$TEMP_DIR/$node_filename"
    
    if [ ! -f "$cache_file" ]; then
        print_status "Downloading Node.js $NODE_VERSION for $platform..."
        curl -fsSL "$node_url" -o "$cache_file"
        if [ $? -ne 0 ]; then
            print_error "Failed to download Node.js for $platform"
            return 1
        fi
    else
        print_status "Using cached Node.js binary for $platform"
    fi
    
    echo "$cache_file"
}

# Function to extract Node binary from archive
extract_node_binary() {
    local platform=$1
    local archive_file=$2
    local extract_dir="$TEMP_DIR/$platform"
    
    mkdir -p "$extract_dir"
    
    case "$archive_file" in
        *.tar.xz)
            tar -xf "$archive_file" -C "$extract_dir" --strip-components=1
            if [[ "$platform" == "win32"* ]]; then
                echo "$extract_dir/node.exe"
            else
                echo "$extract_dir/bin/node"
            fi
            ;;
        *.zip)
            unzip -q "$archive_file" -d "$extract_dir"
            # Windows zip has different structure
            local extracted_dir=$(find "$extract_dir" -name "node-v*" -type d | head -1)
            echo "$extracted_dir/node.exe"
            ;;
        *)
            print_error "Unsupported archive format: $archive_file"
            return 1
            ;;
    esac
}

# Function to create SEA binary for platform
create_sea_binary() {
    local platform=$1
    local node_binary=$2
    local variant=$3  # "lite" or "tui"
    
    local output_name="gitgov"
    if [[ "$platform" == "win32"* ]]; then
        output_name="${output_name}.exe"
    fi
    
    if [[ "$platform" == "win32"* ]]; then
        local output_path="$RELEASES_DIR/gitgov-${platform}.exe"
    else
        local output_path="$RELEASES_DIR/gitgov-${platform}"
    fi
    
    # Copy Node binary
    cp "$node_binary" "$output_path"
    
    # Inject SEA blob
    if command -v npx >/dev/null 2>&1; then
        npx postject "$output_path" NODE_SEA_BLOB "releases/sea-prep-${variant}.blob" \
            --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
    else
        print_error "postject not available. Install with: npm install -g postject"
        return 1
    fi
    
    # Make executable (Unix-like systems)
    if [[ "$platform" != "win32"* ]]; then
        chmod +x "$output_path"
    fi
    
    print_success "Created $output_path"
}

# Build binaries for all platforms
for platform in "${PLATFORMS[@]}"; do
    print_status "Building binaries for $platform..."
    
    # Download Node.js binary
    archive_file=$(download_node_binary "$platform")
    if [ $? -ne 0 ]; then
        print_error "Failed to download Node.js for $platform"
        continue
    fi
    
    # Extract Node binary
    node_binary=$(extract_node_binary "$platform" "$archive_file")
    if [ $? -ne 0 ]; then
        print_error "Failed to extract Node.js for $platform"
        continue
    fi
    
    # Create TUI variant only
    create_sea_binary "$platform" "$node_binary" "tui"
done

# Generate checksums
print_status "Generating checksums..."
(cd "$RELEASES_DIR" && {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum gitgov-* > checksums.txt
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 gitgov-* > checksums.txt
    else
        print_warning "No checksum utility found (sha256sum/shasum)"
    fi
})

# Cleanup
print_status "Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

print_success "Binary build complete!"
print_status "Binaries available in: $RELEASES_DIR/"
ls -la "$RELEASES_DIR/"

print_status "Usage examples:"
echo "  # GitGovernance CLI (with TUI support)"
echo "  ./$RELEASES_DIR/gitgov-linux-x64 status --json"
echo "  ./$RELEASES_DIR/gitgov-linux-x64 dashboard"
echo ""
print_status "Ready for distribution! 🚀"
