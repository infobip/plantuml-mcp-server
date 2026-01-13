# PlantUML MCP Server

[![smithery badge](https://smithery.ai/badge/@infobip/plantuml-mcp-server)](https://smithery.ai/server/@infobip/plantuml-mcp-server)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides PlantUML diagram generation capabilities for Claude Desktop and Claude Code.

### Available Tools

1. **`generate_plantuml_diagram`** - Generate diagrams and get embeddable URLs (SVG/PNG), optionally save locally
2. **`encode_plantuml`** - Encode PlantUML code for URL sharing
3. **`decode_plantuml`** - Decode PlantUML from encoded strings

### Available Prompts

1. **`plantuml_error_handling`** - Guidelines for handling PlantUML syntax errors and implementing auto-fix workflows

This prompt provides Claude instances with comprehensive instructions on how to:
- Detect PlantUML syntax errors using native server validation
- Implement intelligent auto-fix workflows for common syntax issues
- Parse structured error responses and apply appropriate corrections
- Handle validation failures gracefully with retry logic

The prompt enables Claude to automatically detect and fix common PlantUML errors like missing tags, invalid arrow syntax, typos in keywords, and missing quotes, making PlantUML diagram generation more reliable and user-friendly.


## Quick Setup

### For Claude Code

```bash
# Using default PlantUML server
claude mcp add plantuml --scope user --env PLANTUML_SERVER_URL=https://www.plantuml.com/plantuml -- npx plantuml-mcp-server
```

### For Claude Desktop

Add this to your Claude Desktop MCP configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "plantuml": {
      "command": "npx",
      "args": ["plantuml-mcp-server"],
      "env": {
        "PLANTUML_SERVER_URL": "https://www.plantuml.com/plantuml"
      }
    }
  }
}
```

To use your own PlantUML server, change the `PLANTUML_SERVER_URL` environment variable.

Then restart Claude Desktop/Code to activate the MCP server.


## What You Can Do

After setup, you can ask Claude to:
- **Generate PlantUML diagrams** and get embeddable SVG/PNG URLs
- **Create sequence diagrams, class diagrams, architecture diagrams** 
- **Use advanced PlantUML features** like `!include` directives and external libraries
- **Encode/decode PlantUML** for URL sharing
- **Save diagrams locally** with secure path restrictions

### Saving Diagrams Locally

The `generate_plantuml_diagram` tool supports saving diagrams to local files via the `output_path` parameter.

**Security:** By default, files can only be saved within the current working directory. Only `.svg` and `.png` extensions are allowed.

To allow additional directories, set the `PLANTUML_ALLOWED_DIRS` environment variable:
```bash
# Allow specific directories (colon-separated)
PLANTUML_ALLOWED_DIRS=/home/user/diagrams:/tmp/output

# Allow any directory (use with caution)
PLANTUML_ALLOWED_DIRS=*
```

---

## Examples

### C4 diagram for plantuml-mcp-server

```
> add c4 diagram for this project in readme 'C4 diagram for plantuml-mcp-server' section
```

![C4 Container Diagram - PlantUML MCP Server](https://www.plantuml.com/plantuml/png/ZLLDRzj64BtpLqnvYGHGvg4--HH7Lc8NZYFOSei21eWrEQ8sMivkTuQoXA3_lLX-Mb8Av2HnEVFcxNjlm8yioajTcUWtJRcf2uIDYEEhDFNgxQBKigbVQqQVMn8akSXjbJgZAFJCM0gZNzFvvMmPZfw_tgULOa6VpY-pkILHcj1Vk80VtL___UrvbVrrjxhDxXTV5WytasaKYHQ3CB-4eHnkj2gzgc06FIfydI_X2VqEVHGjqREbII2LG7o3EpJMeOyJY9yP6UP6XMlCRO7f3V9Mh8kdqG0_oPlt2SHjOUYxleDhPisYICBpqjiSEO25AU3ndnfPE9v68qxsoTPKA7-OLBdBk24NMiyfnrFu4G70UCN9KFwkAe7umHPuyPtJrS7XK-wrQzZSAYeCSeFel1MRMmEvhQgQTAv4Mugd9_XYhU44ubNuXHQWcN2C_3iqXLTG8g5NWbblRLQq9YI0bDjYV950WKS7PxETjvKJRcKC__v__jBRdIwGOHYBtbkVRKA3fX9QB7ZJiW5LYvsjzHxAMXTeD26VpTufeuj6aWJYFuS7M52f2Sy9D84PB6jT0LAYTmWD5IXGCEyq_ZUAdWuiM6MBlKm6pkVUZuu-8XNe6JevEGbNQk_Sue-Cu-bxT79L0Z6v2Xwnr2p-q0Ycygqg4Ofmeb_hhYzwHDCjn93kQzuohAqVhzTpYATDVLzvbCK_dhuzp1wNyp2CfT0Mn2jYPxrqRNrv7x6vCeRRfz3K9waFJf-Na-un99zHyas8G7iIC5fbXX0S-Hr0kj4_CniP-42YzW7d5TVMOn_kLghG_xxntCNRrMevhdm2SIfx0QJ2MKtIIDeGF67pAq2yAnD87PK3N0UIVLBvTd1a5ESB2lyq-0d4cWIDqIMImB5Y7R4s46sGxeYbCMgd5P1hv0cubHATG-qQwKAIo0g2r-L6mAvx9d05mwhcjd8UDqYiT_X29rvfOl5rip3yGa6hzpI7cxnPlrqR-yQd0qThu0gEjlC3TulvGijsJnR72_f2uMxxsV1rwl8-woYY2fiOHH-HYheo_m40)


### Sequence diagram for plantuml-mcp-server

```
> add sequence diagram in readme in architecture section
```

![PlantUML MCP Server Architecture](https://www.plantuml.com/plantuml/png/XLHDZzem4BtxLups50wKGwiU8b4j0aehmIhYwuI4J3m4guwTscDMjEf_hnoJyB5BUujddcVUUpFnioDkoPUAaII5a2ckQJMRmcoOmGBj4IrqOM3pWoJCoLk4hygyCiPpCXQULWxj4t07uODLt9BCPSKrmTDGSIyGHkX-aAbgK0pTmjxfM6Ddm-nzu8VSb3MY2J3MxpTSlsj9aYlvYvCq6lfzTgRH_H8gfh08UgzwRNJYI4W3PBbsbR7KOI7RuDk226ICSkb6Tw50ZPOJRgj0mPTgAoGlB2z34dLkn2KLGW9lGZNXKRm1arWhi0tE1ih1oq0WKazXZZyzEheCvzpjNjj3MaaR23nk1KQwJUca1coqTr8Na7j7femGgOlcNWDEuTjocS5alDpeNjEYvuv5xtUiAlwmbdCxWFMauG-24s-ANiIIjngmtA4GVASGLlFfbT9WJWeZwIh5JwqJmT7ncUP37sl0rOw7qxs7TzFxbtE3gbAdIxN6fVIo19y_9PrmubM5MdpSdGXTZ9ppEqb9vv43qK9mP8Ftzmui3kQrnLXqNb7SA_oF2pNWoeKtzMjnTokRd3jj8_hMY3aUqJfi7O3AcXoTUo3CM5b8pTN3GLm9Z3J4PSxQ48ALnO70xEj70ff_VsZqNXO-_amf0-X2DXsyB5UpwNOndg_7ysrOfH0VuPvxHIaq-iAZKcU6joiFN1N6IZh4x68zwMKl4zWRMt82vwlmOZ3K0W8nnfvH2r-glm00)


### OAuth2 Authorization Code Flow Diagram

```
> show me basic oauth2 flow png, open it in browser
```

![OAuth2 Authorization Code Flow](https://www.plantuml.com/plantuml/png/RPDRJnin48NV_IkEUAYe6amJUbrrWK0fGgf41BHFI97n3ed5njwE9mJwwoll9M5JNbRMpl6PRux6nr4Cot9HAd5I4Yx7IvcFaBw1tLyZBdYSXeBmemmhfOoLmDZv5ObtO2BIGLM6nLbN6I_OEIqTUS6ugcxzxWc7LIH-MskRIb_TRtHD_DWQfq9VUaKnBDbIgxhrk-F9HUFSbPJAyotsoTn4GfwhH8gzmvOYmr3ZmZjnHWXbc3clMlAzmtgg32EDAoeSanL8WEdvnXf2-I04ThEvP3W_ky5-fw8ZfbW57sagpnNbDXJqnjOTfgx8jTPgZPI8Cnne_4mSi4m5UN6cZ2gLDaGVD4wJfHT4oqH-o-AZnZcdi2hYXOlH1RzswER-fBSIIcIzERgXCrXJbdV6FXmbJMxkx71qK6Ty4nx8u-p9pesVqIRaJOGDq6Uz4IKFt0U6fCkzZfFBwnlir_zl_Jga0TfZ9CiaWuPqUvul6cDhASR65-_0TCyKvssVUYKc5vte5THkUp9yrRMKwS-Iec3bPFuARI--32Tac1ZVJDrWMkiFrNfRUms6xpL-cz8LQUiQvvV2zMuEDIOSXAnG0UuKXH7ptvOEHnhVNQnAyungVSS6B-cnDU3XaRWr7smU2_h1qLFbc2BClH0ZXWL1t8AqGkhKJpMzXna9FArWNfXeHRv0wgdKCVbYkIZ_0G00)

---

## Development Setup

### Prerequisites
- Node.js 18+ 
- npm

### Local Installation

```bash
# Clone and setup
git clone https://github.com/mzagar/plantuml-mcp-server.git
cd plantuml-mcp-server
make setup
```

### Development Commands

```bash
# Building & Running
make build        # Clean build TypeScript to JavaScript
make dev          # Development mode with watch
make run          # Build and run the server locally

# Testing
make test         # Basic server functionality test
make test-mcp     # Comprehensive testing with mcptools CLI
make test-ci      # Fast CI tests (no external dependencies)

# Setup & Installation  
make install      # Install npm dependencies
make setup        # Full setup (install + build + Claude Code config)
make setup-claude # Show Claude Code MCP configuration instructions

# Release Management
make release-patch  # Create patch release (0.1.0 → 0.1.1)
make release-minor  # Create minor release (0.1.0 → 0.2.0) 
make release-major  # Create major release (0.1.0 → 2.0.0)

# Utilities
make clean        # Clean build directory
make help         # Show all available commands
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PLANTUML_SERVER_URL` | PlantUML server URL | `https://www.plantuml.com/plantuml` |
| `PLANTUML_ALLOWED_DIRS` | Additional directories for `output_path` (colon-separated, or `*` for any) | CWD only |

## License

MIT License - see [LICENSE](LICENSE) file for details.