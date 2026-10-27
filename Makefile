# PlantUML MCP Server Makefile

# Variables
NODE_VERSION = $(shell node --version 2>/dev/null || echo "not found")
PLANTUML_SERVER_URL ?= https://www.plantuml.com/plantuml
DIST_DIR = dist
SRC_DIR = src
MAIN_FILE = plantuml-mcp-server

# Default target
.DEFAULT_GOAL := help

# Check if Node.js is installed
check-node:
	@if [ "$(NODE_VERSION)" = "not found" ]; then \
		echo "❌ Node.js is not installed. Please install Node.js 22.12.0 or later first."; \
		exit 1; \
	fi
	@echo "✅ Node.js $(NODE_VERSION) found"

# Install dependencies
install: check-node
	@echo "📦 Installing dependencies..."
	npm install

# Clean build directory
clean:
	@echo "🧹 Cleaning build directory..."
	rm -rf $(DIST_DIR)

# Build the project
build: check-node clean
	@echo "🔨 Building TypeScript project..."
	npm run build
	@echo "✅ Build complete! Output in $(DIST_DIR)/"

# Build and make executable
build-executable: build
	@echo "🔧 Making executable..."
	chmod +x $(DIST_DIR)/$(MAIN_FILE).js

# Development build with watch mode
dev: check-node
	@echo "👀 Starting development build (watch mode)..."
	npm run dev

# Run the server locally
run: build-executable
	@echo "🚀 Starting PlantUML MCP Server..."
	@echo "Server URL: $(PLANTUML_SERVER_URL)"
	@echo "Press Ctrl+C to stop"
	PLANTUML_SERVER_URL=$(PLANTUML_SERVER_URL) node $(DIST_DIR)/$(MAIN_FILE).js

# Test the server with a simple PlantUML example
test: build-executable
	@echo "🧪 Testing server with sample PlantUML..."
	@echo "Starting server in background..."
	@PLANTUML_SERVER_URL=$(PLANTUML_SERVER_URL) node $(DIST_DIR)/$(MAIN_FILE).js &
	@sleep 2
	@echo "Server should be running. Check logs above for any errors."
	@echo "Kill the background process manually if needed: pkill -f 'node $(DIST_DIR)/$(MAIN_FILE).js'"

# Unit tests and type checks (some tests call the public PlantUML server)
test-ci: build-executable
	@echo "🧪 Running unit tests and TypeScript checks..."
	npm test -- src/plantuml-mcp-server.test.ts
	./node_modules/.bin/tsc --noEmit

# Internal shared release logic
do-release:
	@echo "🚀 Starting $(RELEASE_TYPE) release..."
	@echo "📋 Checking working directory is clean..."
	@git diff-index --quiet HEAD || (echo "❌ Working directory not clean. Commit changes first." && exit 1)
	@echo "✅ Working directory clean"
	@echo ""
	@echo "⚡ Running all tests..."
	$(MAKE) test-all
	@echo ""
	@echo "📦 Updating version ($(RELEASE_TYPE))..."
	npm version $(RELEASE_TYPE)
	@echo ""
	@echo "📤 Pushing to GitHub with tags..."
	git push --follow-tags
	@echo ""
	@echo "🎉 $(RELEASE_TYPE) release tagged and pushed to GitHub!"
	@echo "📦 To publish to npm, run: make npm-publish"

# Release targets
release-patch:
	$(MAKE) do-release RELEASE_TYPE=patch

release-minor:
	$(MAKE) do-release RELEASE_TYPE=minor

release-major:
	$(MAKE) do-release RELEASE_TYPE=major

# Publish current version to npm
npm-publish:
	@echo "📦 Publishing to npm..."
	@echo "⚠️  This will publish version $(shell node -p "require('./package.json').version") to npm"
	@echo "Press Ctrl+C to cancel, or Enter to continue..."
	@read confirm
	npm publish
	@echo "🎉 Published to npm successfully!"

# Run all tests (unit/type checks + local MCP integration)
test-all: test-ci test-mcpc
	@echo ""
	@echo "🎉 All tests passed! Ready for release."

# Install the official Apify CLI only when it is missing from PATH.
ensure-mcpc:
	@if ! command -v mcpc >/dev/null 2>&1; then \
		command -v npm >/dev/null 2>&1 || { echo "❌ npm is required to install @apify/mcpc."; exit 1; }; \
		echo "📦 mcpc not found. Installing @apify/mcpc globally..."; \
		npm install --global --no-audit --no-fund @apify/mcpc || { \
			echo "❌ Could not install mcpc. Check npm permissions and network access; no sudo is used."; \
			exit 1; \
		}; \
	fi
	@command -v mcpc >/dev/null 2>&1 || { \
		echo "❌ mcpc is still not on PATH. Add the npm global bin directory to PATH and retry."; \
		exit 1; \
	}
	@mcpc --version || { echo "❌ mcpc is installed but cannot run. Check its installation and Node.js version."; exit 1; }

# Local MCP integration checks through mcpc; failures return a nonzero exit.
test-mcpc: ensure-mcpc build-executable
	node scripts/test-mcpc.mjs

# Backward-compatible name for the integration test.
test-mcp: test-mcpc

# Setup for Claude Code using CLI command
setup-claude:
	@echo "⚙️  Setting up for Claude Code..."
	@echo "📝 Run this command to add the MCP server:"
	@echo ""
	@echo "Option 1 (Recommended - using npx):"
	@echo "claude mcp add plantuml --scope user --env PLANTUML_SERVER_URL=$(PLANTUML_SERVER_URL) -- npx plantuml-mcp-server"
	@echo ""
	@echo "Option 2 (Local installation):"
	@echo "claude mcp add plantuml --scope user --env PLANTUML_SERVER_URL=$(PLANTUML_SERVER_URL) -- node /path/to/plantuml-mcp-server/$(DIST_DIR)/$(MAIN_FILE).js"
	@echo ""
	@echo "🔄 Then restart Claude Code to pick up the new MCP server."

# Create source directory structure
init: check-node
	@echo "📁 Creating project structure..."
	@mkdir -p $(SRC_DIR)
	@if [ ! -f $(SRC_DIR)/$(MAIN_FILE).ts ]; then \
		echo "$(MAIN_FILE).ts already in correct location"; \
	fi

# Full setup: install, build, and show setup instructions
setup: install init build-executable setup-claude
	@echo "🎉 Setup complete!"
	@echo ""
	@echo "Quick commands:"
	@echo "  make run          - Run the server locally"
	@echo "  make dev          - Run in development mode (watch)"
	@echo "  make test         - Test the server"
	@echo "  make test-mcpc    - Test the local server through mcpc"
	@echo "  make clean build  - Clean rebuild"

# Show help
help:
	@echo "PlantUML MCP Server - Available Commands:"
	@echo ""
	@echo "  make install        - Install npm dependencies"
	@echo "  make build          - Build TypeScript to JavaScript"
	@echo "  make run            - Build and run the server"
	@echo "  make dev            - Run in development mode (watch)"
	@echo "  make test           - Test the server"
	@echo "  make test-ci        - Unit tests and type checks (requires network)"
	@echo "  make test-mcpc      - Local MCP smoke test (installs missing mcpc; requires network)"
	@echo "  make test-mcp       - Alias for test-mcpc"
	@echo "  make test-all       - Run all tests (CI + integration)"
	@echo "  make release-patch  - Create patch release (0.1.0 → 0.1.1)"
	@echo "  make release-minor  - Create minor release (0.1.0 → 0.2.0)"
	@echo "  make release-major  - Create major release (0.1.0 → 2.0.0)"
	@echo "  make npm-publish    - Publish current version to npm (manual confirmation)"
	@echo "  make clean          - Clean build directory"
	@echo "  make setup          - Full setup (install + build + instructions)"
	@echo "  make setup-claude   - Show Claude Code setup instructions"
	@echo "  make help           - Show this help"
	@echo ""
	@echo "Environment variables:"
	@echo "  PLANTUML_SERVER_URL - PlantUML server URL (default: $(PLANTUML_SERVER_URL))"
	@echo ""
	@echo "Examples:"
	@echo "  make run"
	@echo "  make test-mcpc"
	@echo "  NODE_EXTRA_CA_CERTS=/path/to/trusted-ca.pem make test-mcpc"

.PHONY: help install clean build build-executable dev run test test-ci test-mcp test-mcpc test-all release-patch release-minor release-major npm-publish setup-claude init setup check-node ensure-mcpc
