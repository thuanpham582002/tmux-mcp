{
  description = "MCP Server for interfacing with tmux sessions";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        packages.default = pkgs.buildNpmPackage {
          pname = "tmux-mcp";
          version = "0.1.3-raw";
          
          src = ./.;
          
          npmDepsHash = "sha256-vykTsM2retSXjuEJ8xAkS6OO/cm9MEWbVAAzD5sb0ik=";
          
          npmFlags = [ "--legacy-peer-deps" ];
          
          buildPhase = ''
            npm run build
          '';
          
          installPhase = ''
            mkdir -p $out/bin $out/lib/node_modules/tmux-mcp
            cp -r build $out/lib/node_modules/tmux-mcp/
            cp -r node_modules $out/lib/node_modules/tmux-mcp/
            cp package.json $out/lib/node_modules/tmux-mcp/
            
            # Create wrapper script
            cat > $out/bin/tmux-mcp << EOF
#!/usr/bin/env bash
exec ${pkgs.nodejs}/bin/node $out/lib/node_modules/tmux-mcp/build/index.js "\$@"
EOF
            chmod +x $out/bin/tmux-mcp
          '';
          
          meta = with pkgs.lib; {
            description = "MCP Server for interfacing with tmux sessions";
            homepage = "https://github.com/nickgnd/tmux-mcp";
            license = licenses.mit;
            maintainers = [ ];
            platforms = platforms.unix;
          };
        };
        
        devShells.default = pkgs.mkShell {
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
        };
      });
}