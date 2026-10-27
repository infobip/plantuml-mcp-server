# Agent instructions

This file is the single source of project instructions for coding agents. `CLAUDE.md` imports it; maintain shared guidance here.

## Project and development

- Requires Node.js 22.12.0 or later, npm, and Make.
- `src/plantuml-mcp-server.ts` contains the server, tool handlers, prompt, and default `createServer` export.
- `src/plantuml-mcp-server.test.ts` contains the source tests. `scripts/test-mcpc.mjs` tests the compiled server through mcpc.
- The project uses strict TypeScript, ES2022, and ES modules. Build output goes to `dist/`; do not edit generated files.
- `@modelcontextprotocol/sdk` provides MCP over stdio. `pako` provides compression for PlantUML encoding and decoding.
- Tools: `generate_plantuml_diagram` validates syntax, returns SVG/PNG URLs and Markdown, and optionally saves files; `encode_plantuml` and `decode_plantuml` convert source and URL encodings.
- Prompt: `plantuml_error_handling` provides syntax-error and retry guidance.
- `PLANTUML_SERVER_URL` defaults to `https://www.plantuml.com/plantuml`. Always use this public server for rendering in this project.
- `PLANTUML_ALLOWED_DIRS` controls additional output directories. The current working directory is always allowed; only SVG/PNG extensions are permitted.
- `package.json` defines the CLI entry used by `npx plantuml-mcp-server` after publication.

| Command | Purpose |
|---|---|
| `make install` | Install dependencies with npm. |
| `make build` | Clean and compile the project; preferred build command. |
| `npm run build` | Compile without cleaning. |
| `make run` | Build, make executable, and start the local server. |
| `npm start` | Start the existing compiled server. |
| `make dev` / `npm run dev` | Watch TypeScript sources. |
| `make setup` | Install, build, and show Claude Code configuration instructions. |
| `make setup-claude` | Show MCP configuration commands without changing configuration. |

## Validate local changes

After server, dependency, or test-runner changes, run these commands from the repository root:

```bash
npm ci --ignore-scripts --no-audit --no-fund --engine-strict
make test-all
```

To repeat only the local MCP integration check:

```bash
make test-mcpc
```

- `make test-mcpc` installs `@apify/mcpc` globally if `mcpc` is missing from PATH. It reuses existing installations without upgrading them.
- If CLI installation fails, report the npm permissions, network, or PATH issue. Do not retry with `sudo`.
- `make test-mcpc` rebuilds and tests this checkout's `dist/plantuml-mcp-server.js`. Do not substitute the published npm server.
- Use `mcpc` for MCP calls. Do not replace the check with raw JSON-RPC pipes or a custom SDK client.
- `make test-mcp` is an alias for `make test-mcpc`.
- `make test-ci` runs source tests and TypeScript checks. Some source tests require network access.
- `make test-all` runs `test-ci` and `test-mcpc`.
- Do not use the legacy `make test` background-process probe as evidence that MCP tools work.
- Read [README.md](README.md#local-mcp-smoke-test) for prerequisites and troubleshooting.

## What the integration test verifies

The runner checks server identity, three tool schemas, the prompt, Unicode encode/decode, image URLs, SVG/PNG files, C4 rendering, syntax errors, and output-path restrictions.

It uses synthetic diagrams and the public server `https://www.plantuml.com/plantuml`. Network access is required. Never send confidential diagram content in tests.

The runner creates a temporary config, private `MCPC_HOME_DIR`, isolated working directory, and allowed output directory. Its `@local` session exists only inside that private mcpc home. It closes this session after success, failure, or interruption. It does not inspect, reconnect, or replace user sessions.

The command prints an artifact directory containing `results.json`, mcpc responses, and generated images. A passing run exits zero and prints `PASS local mcpc smoke test`. Any failed assertion or cleanup must fail the command.

## Troubleshooting and reporting

- If a trusted corporate CA is required, set `NODE_EXTRA_CA_CERTS` before running the command. The runner forwards it to the server.
- Never set `NODE_TLS_REJECT_UNAUTHORIZED=0` or bypass certificate validation.
- If setup or network access fails, report the blocker. Do not report an integration pass based only on unit tests.
- If cleanup fails or the process is forcibly killed, use the printed private home: `MCPC_HOME_DIR="<artifact-directory>/mcpc" mcpc close @local`. Never run this cleanup against the default mcpc home.
- Report the tested commit, Node version, command, result, and artifact path.
- For dependency changes, also run `npm audit` and `npm audit --omit=dev`.

## Releases

Run release or publication commands only with explicit user approval.

- `make release-patch`, `make release-minor`, and `make release-major` select the version increment.
- These targets require a clean tracked working tree, run `make test-all`, execute `npm version`, and push commits and tags with `git push --follow-tags`.
- They do not publish to npm. Publication is a separate `make npm-publish` command with interactive confirmation.
