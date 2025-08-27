{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs
    nodePackages.npm
    tmux
    nodePackages.typescript
  ];
  
  shellHook = ''
    echo "Development environment for tmux-mcp"
    echo "Run 'npm install' to install dependencies"
    echo "Run 'npm run dev' to start development"
  '';
}