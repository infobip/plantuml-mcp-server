# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Building and Running
- `npm run build` - Compile TypeScript to JavaScript in the dist/ directory
- `npm run dev` - Start TypeScript compiler in watch mode for development
- `npm start` - Run the compiled server from dist/plantuml-mcp-server.js
- `make build` - Clean and build the project (preferred)
- `make run` - Build and run the server with proper setup
- `make dev` - Run TypeScript in watch mode using Makefile

### Testing
- `make test-mcp` - Test using mcptools CLI with sample PlantUML diagrams (comprehensive test including C4 diagrams)
- `make test` - Test server functionality with background process
- `make test-ci` - Fast CI tests without external dependencies (TypeScript compilation, tool registration validation)

### Release Management
- `make release-patch` - Create patch release (e.g., 0.1.0 → 0.1.1) with automated CI testing, version bump, git tagging, and npm publishing
- `make release-minor` - Create minor release (e.g., 0.1.0 → 0.2.0) with full release workflow
- `make release-major` - Create major release (e.g., 0.1.0 → 2.0.0) with full release workflow

**Release Workflow:**
1. Ensures working directory is clean (no uncommitted changes)
2. Runs comprehensive CI tests (`make test-ci`)
3. Updates package.json version using `npm version`
4. Creates git tag and pushes to repository with `git push --follow-tags`
5. Publishes to npm registry with `npm publish`

### Setup and Installation
- `make install` - Install npm dependencies with Node.js version check
- `make setup` - Full setup including install, build, and Claude Code configuration
- `make setup-claude` - Show Claude Code MCP configuration instructions

## Project Architecture

### Single-File MCP Server
This is a Model Context Protocol (MCP) server that provides PlantUML diagram generation capabilities. The project follows a single-file architecture pattern with all core logic in `src/plantuml-mcp-server.ts:22-216`.

**Main Components:**
- `src/plantuml-mcp-server.ts` - Complete MCP server implementation with PlantUML capabilities
- `dist/` - Compiled JavaScript output directory (TypeScript target: ES2022, module: ESNext)
- `Makefile` - Comprehensive build and development workflow management
- `package.json` - Configured as ESM module with bin entry for npx support

### MCP Tools Implementation
The server implements three MCP tools via the `PlantUMLMCPServer` class:

1. **`generate_plantuml_diagram`** (src/plantuml-mcp-server.ts:93-144)
   - Generates PlantUML diagrams and returns embeddable URLs
   - Supports SVG/PNG formats
   - Validates server accessibility with fetch requests
   - Returns markdown embed code

2. **`encode_plantuml`** (src/plantuml-mcp-server.ts:146-175)
   - Encodes PlantUML code for URL usage using plantuml-encoder library

3. **`decode_plantuml`** (src/plantuml-mcp-server.ts:177-206)
   - Decodes encoded PlantUML strings back to source code

### Dependencies and Configuration
- Uses `@modelcontextprotocol/sdk` for MCP protocol implementation
- Uses `plantuml-encoder` library for encoding/decoding (src/plantuml-mcp-server.ts:11-17)
- `PLANTUML_SERVER_URL` environment variable (defaults to https://www.plantuml.com/plantuml)
- Requires Node.js 18+ (specified in package.json engines)
- Server runs on stdio transport for MCP communication

### Development Workflow
The project uses TypeScript with strict type checking. The comprehensive Makefile provides all necessary commands for development, testing, and deployment. The server can be installed via `npx plantuml-mcp-server` after publishing to npm, or run locally via `make run`.
- For this project always use public planuml server 'https://www.plantuml.com/plantuml' for rendering diagrams