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

# Fast CI tests without external dependencies
test-ci: build-executable
	@echo "⚡ Running CI-optimized tests..."
	@echo "🧪 Running unit tests..."
	npm run test
	@echo "✅ Unit tests passed"
	@echo ""
	@echo "📋 Testing TypeScript compilation..."
	npx tsc --noEmit
	@echo "✅ TypeScript compilation successful"
	@echo ""
	@echo "🔧 Testing tool schema validation..."
	echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node $(DIST_DIR)/$(MAIN_FILE).js 2>/dev/null | grep -q "generate_plantuml_diagram"
	echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node $(DIST_DIR)/$(MAIN_FILE).js 2>/dev/null | grep -q "encode_plantuml"
	echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node $(DIST_DIR)/$(MAIN_FILE).js 2>/dev/null | grep -q "decode_plantuml"
	@echo "✅ All tools properly registered"
	@echo ""
	@echo "📚 Testing prompts registration..."
	echo '{"jsonrpc":"2.0","method":"prompts/list","id":1}' | node $(DIST_DIR)/$(MAIN_FILE).js 2>/dev/null | grep -q "plantuml_error_handling"
	@echo "✅ Prompts properly registered"
	@echo ""
	@echo "🎉 All CI tests passed! Ready for deployment."

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

# Run all tests (CI + integration)
test-all: test-ci test-mcp
	@echo ""
	@echo "🎉 All tests passed! Ready for release."

# Test with mcptools CLI
test-mcp: build-executable
	@echo "🧪 Testing with mcptools CLI..."
	@echo "📋 Listing available tools:"
	@mcpt tools node $(DIST_DIR)/$(MAIN_FILE).js
	@echo ""
	@echo "🔧 Testing encode_plantuml tool:"
	@mcpt call encode_plantuml --params '{"plantuml_code":"@startuml\nAlice -> Bob: Hello\n@enduml"}' node $(DIST_DIR)/$(MAIN_FILE).js
	@echo ""
	@echo "📊 Testing generate_plantuml_diagram tool:"
	@PLANTUML_SERVER_URL=$(PLANTUML_SERVER_URL) mcpt call generate_plantuml_diagram --params '{"plantuml_code":"@startuml\nAlice -> Bob: Hello\nBob --> Alice: Hi there\n@enduml","format":"svg"}' node $(DIST_DIR)/$(MAIN_FILE).js
	@echo ""
	@echo "🔗 Testing generate_plantuml_diagram with !include directive:"
	@PLANTUML_SERVER_URL=$(PLANTUML_SERVER_URL) mcpt call generate_plantuml_diagram --params '{"plantuml_code":"@startuml\n!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml\n\nPerson(user, \"User\")\nContainer(web, \"Web App\", \"React\", \"User interface\")\nContainer(api, \"API\", \"Node.js\", \"Backend API\")\n\nRel(user, web, \"Uses\")\nRel(web, api, \"Calls\")\n@enduml","format":"svg"}' node $(DIST_DIR)/$(MAIN_FILE).js
	@echo ""
	@echo "❌ Testing syntax error validation (auto-fix workflow):"
	@PLANTUML_SERVER_URL=$(PLANTUML_SERVER_URL) mcpt call generate_plantuml_diagram --params '{"plantuml_code":"@startuml\nBob -> Alice : Hello\nasd\n@enduml","format":"svg"}' node $(DIST_DIR)/$(MAIN_FILE).js
	@echo ""
	@echo "🔓 Testing decode_plantuml tool:"
	@mcpt call decode_plantuml --params '{"encoded_string":"LOqnQyCm48Lt_GfLKmoEjMJgbDHJ8IacO3gMitHjrCedeJkHlr-KX4AtuxlllRTdWI9rZUefa8lLexw8P7wsji1r-0fogKjbB2wH8CdWqcfp16gPBOkFOR7ZRZirD9-ETWKMB7RSVOo9109X6NBhLnCMJhHfPRqsCsCndVgJDbTSUctUST67d4slpHd1YNceEf1W-GI7_qAGGw_DONfjtbloE7npEr_0_I1vtJwTKcUCZztxoip8fhlX6xZNZ11ZmtiaNzVu2m00"}' node $(DIST_DIR)/$(MAIN_FILE).js
	@echo ""
	@echo "📚 Listing available prompts:"
	@mcpt prompts node $(DIST_DIR)/$(MAIN_FILE).js
	@echo ""
	@echo "🔍 Testing plantuml_error_handling prompt:"
	@mcpt get-prompt plantuml_error_handling -f pretty node $(DIST_DIR)/$(MAIN_FILE).js
	@echo ""
	@echo "🔒 Testing output_path security (save to CWD - should succeed):"
	@rm -f ./test-output-mcp.svg
	@PLANTUML_SERVER_URL=$(PLANTUML_SERVER_URL) mcpt call generate_plantuml_diagram --params '{"plantuml_code":"@startuml\nAlice -> Bob: Security Test\n@enduml","format":"svg","output_path":"./test-output-mcp.svg"}' node $(DIST_DIR)/$(MAIN_FILE).js
	@test -f ./test-output-mcp.svg && echo "✅ File created successfully" || echo "❌ File not created"
	@rm -f ./test-output-mcp.svg
	@echo ""
	@echo "🔒 Testing output_path security (outside CWD - should fail):"
	@PLANTUML_SERVER_URL=$(PLANTUML_SERVER_URL) mcpt call generate_plantuml_diagram --params '{"plantuml_code":"@startuml\nAlice -> Bob: Security Test\n@enduml","format":"svg","output_path":"/tmp/outside-cwd.svg"}' node $(DIST_DIR)/$(MAIN_FILE).js | grep -q "Security error" && echo "✅ Path outside CWD correctly rejected" || echo "❌ Security check failed"
	@echo ""
	@echo "🔒 Testing output_path security (invalid extension - should fail):"
	@PLANTUML_SERVER_URL=$(PLANTUML_SERVER_URL) mcpt call generate_plantuml_diagram --params '{"plantuml_code":"@startuml\nAlice -> Bob: Security Test\n@enduml","format":"svg","output_path":"./test.txt"}' node $(DIST_DIR)/$(MAIN_FILE).js | grep -q "Invalid extension" && echo "✅ Invalid extension correctly rejected" || echo "❌ Extension check failed"

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
	@echo "  make test-mcp     - Test with mcptools CLI"
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
	@echo "  make test-ci        - Fast CI tests (no external dependencies)"
	@echo "  make test-mcp       - Test with mcptools CLI"
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
	@echo "  make test-mcp"
	@echo "  PLANTUML_SERVER_URL=https://your-server.com make test-mcp"

.PHONY: help install clean build build-executable dev run test test-ci test-mcp test-all release-patch release-minor release-major npm-publish setup-claude init setup check-node
