#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import pako from 'pako';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, resolve, extname, normalize } from 'path';
import { createRequire } from 'module';

// Version reading with CJS compatibility (Smithery builds to CJS where import.meta.url is undefined)
let PACKAGE_VERSION = '0.2.0'; // fallback for CJS context
try {
  if (typeof import.meta?.url === 'string') {
    const require = createRequire(import.meta.url);
    PACKAGE_VERSION = require('../package.json').version;
  }
} catch {
  // Use fallback version in CJS context
}

// Security: Validate output path is within allowed directories
export function isPathAllowed(filePath: string): { allowed: boolean; reason?: string } {
  const resolvedPath = normalize(resolve(filePath));

  // Check extension (always enforced, even in wildcard mode)
  const ext = extname(resolvedPath).toLowerCase();
  if (ext !== '.svg' && ext !== '.png') {
    return {
      allowed: false,
      reason: `Invalid extension "${ext || '(none)'}". Only .svg and .png are allowed.`
    };
  }

  const envDirs = process.env.PLANTUML_ALLOWED_DIRS;

  // Wildcard mode: allow any directory (extension still enforced above)
  if (envDirs === '*') {
    return { allowed: true };
  }

  // Build allowed directories list (CWD always included)
  const allowedDirs: string[] = [normalize(resolve(process.cwd()))];
  if (envDirs) {
    const extraDirs = envDirs
      .split(':')
      .map(d => d.trim())
      .filter(Boolean)
      .map(d => normalize(resolve(d)));
    allowedDirs.push(...extraDirs);
  }

  // Check if path is under any allowed directory
  for (const dir of allowedDirs) {
    if (resolvedPath === dir || resolvedPath.startsWith(dir + '/')) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: `Path "${resolvedPath}" is outside allowed directories. Allowed: ${allowedDirs.join(', ')}`
  };
}

// PlantUML encoding helpers (same algorithm as plantuml-encoder, but using pako directly)
function encode6bit(b: number): string {
  if (b < 10) return String.fromCharCode(48 + b);
  b -= 10;
  if (b < 26) return String.fromCharCode(65 + b);
  b -= 26;
  if (b < 26) return String.fromCharCode(97 + b);
  b -= 26;
  if (b === 0) return '-';
  if (b === 1) return '_';
  return '?';
}

function append3bytes(b1: number, b2: number, b3: number): string {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xF) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3F;
  return encode6bit(c1 & 0x3F) + encode6bit(c2 & 0x3F) + encode6bit(c3 & 0x3F) + encode6bit(c4 & 0x3F);
}

export function encodePlantUML(plantuml: string): string {
  // Deflate the input using pako (pure JS, no Node.js zlib dependency)
  const deflated = pako.deflateRaw(plantuml, { level: 9 });

  // Encode to PlantUML's custom base64-like encoding
  let result = '';
  for (let i = 0; i < deflated.length; i += 3) {
    const b1 = deflated[i];
    const b2 = i + 1 < deflated.length ? deflated[i + 1] : 0;
    const b3 = i + 2 < deflated.length ? deflated[i + 2] : 0;
    result += append3bytes(b1, b2, b3);
  }
  return result;
}

function decode6bit(c: string): number {
  const code = c.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;        // 0-9
  if (code >= 65 && code <= 90) return code - 65 + 10;   // A-Z
  if (code >= 97 && code <= 122) return code - 97 + 36;  // a-z
  if (c === '-') return 62;
  if (c === '_') return 63;
  return 0;
}

export function decodePlantUML(encoded: string): string {
  // Decode from PlantUML's custom base64-like encoding
  const decoded: number[] = [];
  for (let i = 0; i < encoded.length; i += 4) {
    const c1 = decode6bit(encoded[i] || '');
    const c2 = decode6bit(encoded[i + 1] || '');
    const c3 = decode6bit(encoded[i + 2] || '');
    const c4 = decode6bit(encoded[i + 3] || '');
    decoded.push((c1 << 2) | (c2 >> 4));
    decoded.push(((c2 & 0xF) << 4) | (c3 >> 2));
    decoded.push(((c3 & 0x3) << 6) | c4);
  }

  // Inflate using pako (pure JS, no Node.js zlib dependency)
  const inflated = pako.inflateRaw(new Uint8Array(decoded), { to: 'string' });
  return inflated;
}

// Configuration
const PLANTUML_SERVER_URL = process.env.PLANTUML_SERVER_URL || 'https://www.plantuml.com/plantuml';

class PlantUMLMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'plantuml-server',
        version: PACKAGE_VERSION,
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupPromptHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_plantuml_diagram',
          description: 'Generate a PlantUML diagram with automatic syntax validation and error reporting for auto-fix workflows. Returns embeddable image URLs for valid diagrams or structured error details for invalid syntax that can be automatically corrected. Optionally saves the diagram to a local file.',
          inputSchema: {
            type: 'object',
            properties: {
              plantuml_code: {
                type: 'string',
                description: 'PlantUML diagram code. Will be automatically validated for syntax errors before generating the diagram URL.',
              },
              format: {
                type: 'string',
                enum: ['svg', 'png'],
                default: 'svg',
                description: 'Output image format (SVG or PNG)',
              },
              output_path: {
                type: 'string',
                description: 'Optional. Path to save diagram locally. Restricted to current working directory by default. Set PLANTUML_ALLOWED_DIRS env var (colon-separated paths, or "*" for unrestricted) to allow additional directories. Only .svg and .png extensions permitted.',
              },
            },
            required: ['plantuml_code'],
          },
        },
        {
          name: 'encode_plantuml',
          description: 'Encode PlantUML code for URL usage',
          inputSchema: {
            type: 'object',
            properties: {
              plantuml_code: {
                type: 'string',
                description: 'PlantUML diagram code to encode',
              },
            },
            required: ['plantuml_code'],
          },
        },
        {
          name: 'decode_plantuml',
          description: 'Decode encoded PlantUML string back to PlantUML code',
          inputSchema: {
            type: 'object',
            properties: {
              encoded_string: {
                type: 'string',
                description: 'Encoded PlantUML string to decode',
              },
            },
            required: ['encoded_string'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'generate_plantuml_diagram':
          return this.generateDiagram(request.params.arguments);
        case 'encode_plantuml':
          return this.encodePlantuml(request.params.arguments);
        case 'decode_plantuml':
          return this.decodePlantuml(request.params.arguments);
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  private async validatePlantUMLSyntax(encoded: string, originalCode: string) {
    try {
      // Use /txt endpoint for cleaner error messages
      const validationUrl = `${PLANTUML_SERVER_URL}/txt/${encoded}`;
      const response = await fetch(validationUrl);
      
      // Use PlantUML's native error detection via PSystemError
      const errorMessage = response.headers.get('x-plantuml-diagram-error');
      
      if (errorMessage) {
        // PlantUML detected an error via PSystemError - trust its judgment
        const errorLine = response.headers.get('x-plantuml-diagram-error-line');
        const fullTextOutput = await response.text();
        
        // Extract problematic code from original source if line number available
        const lines = originalCode.split('\n');
        const lineNum = errorLine ? parseInt(errorLine, 10) : null;
        const problematicCode = lineNum && lineNum <= lines.length ? lines[lineNum - 1] : '';
        
        return {
          isValid: false,
          error: {
            message: errorMessage,
            line: lineNum,
            problematic_code: problematicCode?.trim() || '',
            full_plantuml: originalCode,
            full_context: fullTextOutput
          }
        };
      }
      
      return { isValid: true };
    } catch (error) {
      // If validation endpoint fails, assume syntax is valid and let the main generation handle it
      return { isValid: true };
    }
  }

  private async generateDiagram(args: any) {
    const { plantuml_code, format = 'svg', output_path } = args;

    if (!plantuml_code) {
      throw new Error('plantuml_code is required');
    }

    try {
      // Encode the PlantUML code
      const encoded = encodePlantUML(plantuml_code);

      // Validate PlantUML syntax first
      const validation = await this.validatePlantUMLSyntax(encoded, plantuml_code);

      if (!validation.isValid && validation.error) {
        // Return structured error for Claude Code to auto-fix
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                validation_failed: true,
                error_details: {
                  error_message: validation.error.message,
                  error_line: validation.error.line,
                  problematic_code: validation.error.problematic_code,
                  full_plantuml: validation.error.full_plantuml,
                  full_context: validation.error.full_context
                },
                retry_instructions: 'The PlantUML code has syntax errors. Please fix the errors and retry with corrected syntax.'
              }, null, 2)
            }
          ],
          isError: true
        };
      }

      // Generate the diagram URL
      const diagramUrl = `${PLANTUML_SERVER_URL}/${format}/${encoded}`;

      // Test if the URL is accessible (fallback validation)
      const response = await fetch(diagramUrl);
      if (!response.ok) {
        throw new Error(`PlantUML server returned ${response.status}: ${response.statusText}`);
      }

      // If output_path is provided, save the file locally
      if (output_path) {
        try {
          // Resolve the output path and ensure proper extension
          let filePath = resolve(output_path);
          const fileExtension = extname(filePath).toLowerCase();

          // Add format extension if not present or mismatched
          if (!fileExtension || (fileExtension !== `.${format}`)) {
            if (!fileExtension) {
              filePath = `${filePath}.${format}`;
            }
          }

          // Security: Validate path is within allowed directories
          const pathCheck = isPathAllowed(filePath);
          if (!pathCheck.allowed) {
            return {
              content: [{ type: 'text', text: `Security error: ${pathCheck.reason}` }],
              isError: true,
            };
          }

          // Create directory if it doesn't exist
          const dir = dirname(filePath);
          await mkdir(dir, { recursive: true });

          // Get the image data from response
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Write the file
          await writeFile(filePath, buffer);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  local_path: filePath,
                  format: format,
                  url: diagramUrl,
                  message: `Diagram saved successfully to: ${filePath}`
                }, null, 2)
              },
            ],
          };
        } catch (fileError) {
          return {
            content: [
              {
                type: 'text',
                text: `Error saving diagram to file: ${fileError instanceof Error ? fileError.message : String(fileError)}\n\nDiagram URL is still available: ${diagramUrl}`,
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              url: diagramUrl,
              format: format,
              markdown_embed: `![PlantUML Diagram](${diagramUrl})`
            }, null, 2)
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error generating PlantUML diagram: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async encodePlantuml(args: any) {
    const { plantuml_code } = args;

    if (!plantuml_code) {
      throw new Error('plantuml_code is required');
    }

    try {
      const encoded = encodePlantUML(plantuml_code);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              encoded: encoded,
              urls: {
                svg: `${PLANTUML_SERVER_URL}/svg/${encoded}`,
                png: `${PLANTUML_SERVER_URL}/png/${encoded}`
              }
            }, null, 2)
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error encoding PlantUML: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async decodePlantuml(args: any) {
    const { encoded_string } = args;

    if (!encoded_string) {
      throw new Error('encoded_string is required');
    }

    try {
      const decoded = decodePlantUML(encoded_string);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              decoded: decoded
            }, null, 2)
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error decoding PlantUML: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  private setupPromptHandlers() {
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: 'plantuml_error_handling',
          description: 'Guidelines for handling PlantUML syntax errors and implementing auto-fix workflows',
        },
      ],
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      if (request.params.name === 'plantuml_error_handling') {
        return {
          description: 'PlantUML Error Handling and Auto-Fix Guidelines',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'How should I handle PlantUML syntax errors when generating diagrams with the PlantUML MCP server?'
              }
            },
            {
              role: 'assistant',
              content: {
                type: 'text',
                text: `## PlantUML MCP Server - Error Handling & Auto-Fix Guide

### Error Detection Workflow
1. **Always attempt generation first** - Call \`generate_plantuml_diagram\` with your PlantUML code
2. **Check response format** - Look for JSON responses containing \`validation_failed: true\`
3. **Parse error details** - Extract specific error information for intelligent fixes
4. **Auto-fix and retry** - Correct syntax based on error context and retry once
5. **Maximum retry limit** - Attempt auto-fix maximum 2 times before showing user the error

### Response Format Recognition

**Success Response:**
- Returns embeddable URLs and markdown embed code
- Contains \`Successfully generated PlantUML diagram!\` message

**Validation Error Response (JSON):**
\`\`\`json
{
  "validation_failed": true,
  "error_details": {
    "error_message": "Syntax Error description",
    "error_line": 3,
    "problematic_code": "invalid syntax line",
    "full_plantuml": "complete original code",
    "full_context": "detailed error context"
  },
  "retry_instructions": "Fix errors and retry"
}
\`\`\`

**Server Error Response:**
- Generic error message for server connectivity issues

### Common PlantUML Syntax Fixes

**Missing Tags:**
- Error: "No @startuml found"
- Fix: Add \`@startuml\` at start and \`@enduml\` at end

**Invalid Arrow Syntax:**  
- Error: "Syntax Error" on arrow lines
- Fix: Use \`->\` instead of \`>\`, \`-->\` for dashed arrows

**Typos in Keywords:**
- Error: "Unknown keyword" 
- Fix: Check spelling of \`participant\`, \`class\`, \`note\`, etc.

**Missing Quotes:**
- Error: Syntax error on strings with spaces
- Fix: Add quotes around strings containing spaces

**Diagram Type Issues:**
- Error: "Assumed diagram type: sequence" 
- Fix: Use appropriate syntax for intended diagram type

### Auto-Fix Implementation Strategy

1. **Parse the error_line and problematic_code** from validation response
2. **Apply common fixes** based on error_message patterns:
   - Add missing @startuml/@enduml tags
   - Fix arrow syntax (replace > with ->)  
   - Add missing quotes around spaced strings
   - Correct common keyword typos
3. **Preserve user intent** - Keep original meaning while fixing syntax
4. **Retry with fixed code** - Call generate_plantuml_diagram again
5. **Explain fixes made** - Inform user what was corrected

### Best Practices

- **Validate before presenting URLs** - Don't show broken diagram links
- **Use specific error context** - Leverage line numbers and error messages
- **Maintain diagram semantics** - Keep user's intended diagram structure
- **Handle edge cases gracefully** - Some errors may require manual intervention
- **Provide clear feedback** - Explain what was fixed when auto-correcting

### Error Handling Code Pattern

\`\`\`typescript
const result = await generatePlantUMLDiagram(code);
if (isValidationError(result)) {
  const fixed = autoFixSyntax(result.error_details);
  if (fixed) {
    return await generatePlantUMLDiagram(fixed);
  }
  return showErrorToUser(result.error_details);
}
return result; // Success
\`\`\``
              }
            }
          ]
        };
      }
      throw new Error(`Unknown prompt: ${request.params.name}`);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('PlantUML MCP server running on stdio');
  }

  getServer() {
    return this.server;
  }
}

// Export createServer function for Smithery.ai
export default function createServer({ config }: { config?: { plantumlServerUrl?: string } } = {}) {
  // Set environment variable if provided in config
  if (config?.plantumlServerUrl) {
    process.env.PLANTUML_SERVER_URL = config.plantumlServerUrl;
  }

  const mcpServer = new PlantUMLMCPServer();
  return mcpServer.getServer();
}

// CLI execution for backward compatibility
import { realpathSync } from "fs";
import { pathToFileURL } from "url";

function wasCalledAsScript() {
  // In CJS context (e.g., Smithery build), import.meta.url is undefined
  if (typeof import.meta?.url !== 'string') {
    return false;
  }

  // We use realpathSync to resolve symlinks, as cli scripts will often
  // be executed from symlinks in the `node_modules/.bin`-folder
  const realPath = realpathSync(process.argv[1]);

  // Convert the file-path to a file-url before comparing it
  const realPathAsUrl = pathToFileURL(realPath).href;

  return import.meta.url === realPathAsUrl;
}

if (wasCalledAsScript()) {
  const server = new PlantUMLMCPServer();
  server.run().catch(console.error);
}