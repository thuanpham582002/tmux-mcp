# Nix Installation Guide

This project provides Nix flakes and packages for easy installation and development.

## Installation Options

### Option 1: Using Nix Flakes (Recommended)

Install directly from this repository:
```bash
nix profile install github:noroom113/tmux-mcp
```

Or run without installing:
```bash
nix run github:noroom113/tmux-mcp
```

Test if it works:
```bash
nix run github:noroom113/tmux-mcp -- --help
```

### Option 2: Local Development

Clone and enter development environment:
```bash
git clone https://github.com/noroom113/tmux-mcp.git
cd tmux-mcp
nix develop  # Using flakes
# or
nix-shell    # For non-flake users
```

### Option 3: Build from Source

```bash
git clone https://github.com/noroom113/tmux-mcp.git
cd tmux-mcp
nix build
./result/bin/tmux-mcp --help
```

## Development Environment

The Nix development shell includes:
- Node.js
- npm (with --legacy-peer-deps support)
- TypeScript
- tmux (required dependency)

## Requirements

- Nix with flakes enabled
- tmux installed and running
- Git (for source installations)

## Configuration

After installation, configure tmux-mcp in your Claude Code settings or MCP client:

```json
{
  "mcpServers": {
    "tmux": {
      "command": "tmux-mcp",
      "args": []
    }
  }
}
```

## Troubleshooting

### Flakes not enabled
Enable flakes in your Nix configuration:
```bash
mkdir -p ~/.config/nix
echo "experimental-features = nix-command flakes" >> ~/.config/nix/nix.conf
```

### Build issues
If you encounter build issues, try:
```bash
nix flake check  # Validate flake
nix develop      # Enter dev shell
npm install --legacy-peer-deps
npm run build
```

## System Compatibility

Tested on:
- macOS (aarch64-darwin, x86_64-darwin)  
- Linux (aarch64-linux, x86_64-linux)

## Integration with NixOS/Home Manager

Add to your system configuration:

### NixOS Configuration
```nix
# configuration.nix
{ pkgs, ... }:
{
  environment.systemPackages = [
    (pkgs.callPackage (pkgs.fetchFromGitHub {
      owner = "noroom113";
      repo = "tmux-mcp";
      rev = "main";  # or specific commit
      sha256 = "..."; # nix-prefetch-url output
    }) {})
  ];
}
```

### Home Manager
```nix
# home.nix
{ pkgs, ... }:
{
  home.packages = [
    (pkgs.callPackage (pkgs.fetchFromGitHub {
      owner = "noroom113";
      repo = "tmux-mcp";
      rev = "main";
      sha256 = "...";
    }) {})
  ];
}
```