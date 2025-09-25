#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import plantumlEncoder from 'plantuml-encoder';

function encodePlantUML(plantuml: string): string {
  return plantumlEncoder.encode(plantuml);
}

function decodePlantUML(encoded: string): string {
  return plantumlEncoder.decode(encoded);
}

// Configuration
const PLANTUML_SERVER_URL = process.env.PLANTUML_SERVER_URL || 'https://www.plantuml.com/plantuml';

class PlantUMLMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server({
      name: 'plantuml-server',
      version: '0.1.0',
      capabilities: {
        tools: {},
        prompts: {},
      },
    });

    this.setupToolHandlers();
    this.setupPromptHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_plantuml_diagram',
          description: 'Generate a PlantUML diagram with automatic syntax validation and error reporting for auto-fix workflows. Returns embeddable image URLs for valid diagrams or structured error details for invalid syntax that can be automatically corrected.',
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
    const { plantuml_code, format = 'svg' } = args;

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

      return {
        content: [
          {
            type: 'text',
            text: `Successfully generated PlantUML diagram!\n\n**Embeddable ${format.toUpperCase()} URL:**\n\`\`\`\n${diagramUrl}\n\`\`\`\n\n**Markdown embed:**\n\`\`\`markdown\n![PlantUML Diagram](${diagramUrl})\n\`\`\``,
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
            text: `**Encoded PlantUML:**\n\`\`\`\n${encoded}\n\`\`\`\n\n**Full SVG URL:**\n\`\`\`\n${PLANTUML_SERVER_URL}/svg/${encoded}\n\`\`\`\n\n**Full PNG URL:**\n\`\`\`\n${PLANTUML_SERVER_URL}/png/${encoded}\n\`\`\``,
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
            text: `**Decoded PlantUML:**\n\`\`\`plantuml\n${decoded}\n\`\`\``,
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
// Check if this file is being run directly (not imported)
const isMainModule = process.argv[1] && (
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]) ||
  process.argv[1].endsWith('plantuml-mcp-server.js')
);

if (isMainModule) {
  const server = new PlantUMLMCPServer();
  server.run().catch(console.error);
}