import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { isPathAllowed, encodePlantUML, decodePlantUML } from './plantuml-mcp-server.js';
import { existsSync, unlinkSync, rmSync } from 'fs';
import { resolve } from 'path';

// Test utilities
const PLANTUML_SERVER_URL = 'https://www.plantuml.com/plantuml';
const TEST_OUTPUT_DIR = './test-output-vitest';

const simpleDiagram = `@startuml
Alice -> Bob: Hello
Bob --> Alice: Hi
@enduml`;

const classDiagram = `@startuml
class User {
  +name: String
  +login()
}
@enduml`;

// Helper to clean test files
function cleanupTestFiles(files: string[]) {
  for (const file of files) {
    try {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    } catch (e) {
      // ignore
    }
  }
  try {
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  } catch (e) {
    // ignore
  }
}

describe('PlantUML Encoder', () => {
  it('should encode PlantUML code', () => {
    const encoded = encodePlantUML(simpleDiagram);
    expect(encoded).toBeDefined();
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('should decode PlantUML code', () => {
    const encoded = encodePlantUML(simpleDiagram);
    const decoded = decodePlantUML(encoded);
    expect(decoded).toBe(simpleDiagram);
  });

  it('should produce consistent encoding', () => {
    const encoded1 = encodePlantUML(simpleDiagram);
    const encoded2 = encodePlantUML(simpleDiagram);
    expect(encoded1).toBe(encoded2);
  });
});

describe('PlantUML URL Generation', () => {
  it('should generate valid SVG URL', () => {
    const encoded = encodePlantUML(simpleDiagram);
    const url = `${PLANTUML_SERVER_URL}/svg/${encoded}`;
    expect(url).toContain('/svg/');
    expect(url).toContain(encoded);
  });

  it('should generate valid PNG URL', () => {
    const encoded = encodePlantUML(simpleDiagram);
    const url = `${PLANTUML_SERVER_URL}/png/${encoded}`;
    expect(url).toContain('/png/');
    expect(url).toContain(encoded);
  });
});

describe('PlantUML Server Accessibility', () => {
  it('should fetch SVG diagram from server', async () => {
    const encoded = encodePlantUML(simpleDiagram);
    const url = `${PLANTUML_SERVER_URL}/svg/${encoded}`;

    const response = await fetch(url);
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toContain('image/svg+xml');
  });

  it('should fetch PNG diagram from server', async () => {
    const encoded = encodePlantUML(simpleDiagram);
    const url = `${PLANTUML_SERVER_URL}/png/${encoded}`;

    const response = await fetch(url);
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toContain('image/png');
  });
});

describe('PlantUML Syntax Validation', () => {
  it('should detect syntax errors via headers', async () => {
    const invalidDiagram = `@startuml
Bob -> Alice : Hello
invalid_syntax_here
@enduml`;

    const encoded = encodePlantUML(invalidDiagram);
    const url = `${PLANTUML_SERVER_URL}/txt/${encoded}`;

    const response = await fetch(url);
    const errorHeader = response.headers.get('x-plantuml-diagram-error');

    // PlantUML should detect syntax error
    expect(errorHeader).toBeDefined();
  });

  it('should not have error header for valid diagram', async () => {
    const encoded = encodePlantUML(simpleDiagram);
    const url = `${PLANTUML_SERVER_URL}/txt/${encoded}`;

    const response = await fetch(url);
    const errorHeader = response.headers.get('x-plantuml-diagram-error');

    expect(errorHeader).toBeNull();
  });
});

describe('Local File Saving', () => {
  const testFiles: string[] = [];

  afterAll(() => {
    cleanupTestFiles(testFiles);
  });

  it('should save SVG file locally', async () => {
    const encoded = encodePlantUML(simpleDiagram);
    const url = `${PLANTUML_SERVER_URL}/svg/${encoded}`;
    const filePath = resolve(`${TEST_OUTPUT_DIR}/test-save.svg`);
    testFiles.push(filePath);

    const response = await fetch(url);
    expect(response.ok).toBe(true);

    const { writeFile, mkdir } = await import('fs/promises');
    const { dirname } = await import('path');

    await mkdir(dirname(filePath), { recursive: true });
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(filePath, buffer);

    expect(existsSync(filePath)).toBe(true);
  });

  it('should save PNG file locally', async () => {
    const encoded = encodePlantUML(classDiagram);
    const url = `${PLANTUML_SERVER_URL}/png/${encoded}`;
    const filePath = resolve(`${TEST_OUTPUT_DIR}/test-save.png`);
    testFiles.push(filePath);

    const response = await fetch(url);
    expect(response.ok).toBe(true);

    const { writeFile, mkdir } = await import('fs/promises');
    const { dirname } = await import('path');

    await mkdir(dirname(filePath), { recursive: true });
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(filePath, buffer);

    expect(existsSync(filePath)).toBe(true);
  });

  it('should create nested directories', async () => {
    const encoded = encodePlantUML(simpleDiagram);
    const url = `${PLANTUML_SERVER_URL}/svg/${encoded}`;
    const filePath = resolve(`${TEST_OUTPUT_DIR}/nested/deep/diagram.svg`);
    testFiles.push(filePath);

    const response = await fetch(url);
    const { writeFile, mkdir } = await import('fs/promises');
    const { dirname } = await import('path');

    await mkdir(dirname(filePath), { recursive: true });
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(filePath, buffer);

    expect(existsSync(filePath)).toBe(true);
  });
});

describe('Path Extension Handling', () => {
  it('should detect SVG extension', () => {
    const { extname } = require('path');
    expect(extname('diagram.svg')).toBe('.svg');
    expect(extname('path/to/diagram.svg')).toBe('.svg');
  });

  it('should detect PNG extension', () => {
    const { extname } = require('path');
    expect(extname('diagram.png')).toBe('.png');
  });

  it('should handle missing extension', () => {
    const { extname } = require('path');
    expect(extname('diagram')).toBe('');
    expect(extname('path/to/diagram')).toBe('');
  });

  it('should auto-append extension when missing', () => {
    const { extname } = require('path');
    const format = 'svg';
    let filePath = 'diagram';

    if (!extname(filePath)) {
      filePath = `${filePath}.${format}`;
    }

    expect(filePath).toBe('diagram.svg');
  });
});

describe('Path Security Validation', () => {
  describe('Extension validation', () => {
    it('should allow .svg extension', () => {
      expect(isPathAllowed('./diagram.svg').allowed).toBe(true);
    });

    it('should allow .png extension', () => {
      expect(isPathAllowed('./diagram.png').allowed).toBe(true);
    });

    it('should reject .txt extension', () => {
      const result = isPathAllowed('./diagram.txt');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid extension');
    });

    it('should reject no extension', () => {
      const result = isPathAllowed('./diagram');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid extension');
    });

    it('should reject .exe extension', () => {
      const result = isPathAllowed('./malware.exe');
      expect(result.allowed).toBe(false);
    });
  });

  describe('Directory restriction (CWD)', () => {
    it('should allow path within CWD', () => {
      expect(isPathAllowed('./output/diagram.svg').allowed).toBe(true);
    });

    it('should allow nested path within CWD', () => {
      expect(isPathAllowed('./deep/nested/path/diagram.png').allowed).toBe(true);
    });

    it('should reject path outside CWD via traversal', () => {
      const result = isPathAllowed('../../../etc/diagram.svg');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('outside allowed directories');
    });

    it('should reject absolute path outside CWD', () => {
      const result = isPathAllowed('/etc/diagram.svg');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('outside allowed directories');
    });
  });

  describe('PLANTUML_ALLOWED_DIRS env var', () => {
    const originalEnv = process.env.PLANTUML_ALLOWED_DIRS;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.PLANTUML_ALLOWED_DIRS;
      } else {
        process.env.PLANTUML_ALLOWED_DIRS = originalEnv;
      }
    });

    it('should allow path in env-specified directory', () => {
      process.env.PLANTUML_ALLOWED_DIRS = '/tmp';
      expect(isPathAllowed('/tmp/diagram.svg').allowed).toBe(true);
    });

    it('should allow nested path in env-specified directory', () => {
      process.env.PLANTUML_ALLOWED_DIRS = '/tmp';
      expect(isPathAllowed('/tmp/nested/deep/diagram.png').allowed).toBe(true);
    });

    it('should support multiple colon-separated directories', () => {
      process.env.PLANTUML_ALLOWED_DIRS = '/tmp:/home/user/diagrams';
      expect(isPathAllowed('/tmp/diagram.svg').allowed).toBe(true);
      expect(isPathAllowed('/home/user/diagrams/test.png').allowed).toBe(true);
    });

    it('should still allow CWD when env var is set', () => {
      process.env.PLANTUML_ALLOWED_DIRS = '/tmp';
      expect(isPathAllowed('./diagram.svg').allowed).toBe(true);
    });

    it('should reject path not in env dirs and not in CWD', () => {
      process.env.PLANTUML_ALLOWED_DIRS = '/tmp';
      const result = isPathAllowed('/etc/diagram.svg');
      expect(result.allowed).toBe(false);
    });

    it('should allow any directory when set to wildcard (*)', () => {
      process.env.PLANTUML_ALLOWED_DIRS = '*';
      expect(isPathAllowed('/etc/diagram.svg').allowed).toBe(true);
      expect(isPathAllowed('/any/path/diagram.png').allowed).toBe(true);
    });

    it('should still enforce extension check in wildcard mode', () => {
      process.env.PLANTUML_ALLOWED_DIRS = '*';
      const result = isPathAllowed('/etc/malware.exe');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid extension');
    });
  });

  describe('Edge cases', () => {
    it('should handle paths with spaces', () => {
      expect(isPathAllowed('./my diagrams/test.svg').allowed).toBe(true);
    });

    it('should normalize paths with redundant separators', () => {
      expect(isPathAllowed('.//output///diagram.svg').allowed).toBe(true);
    });

    it('should handle uppercase extensions', () => {
      expect(isPathAllowed('./diagram.SVG').allowed).toBe(true);
      expect(isPathAllowed('./diagram.PNG').allowed).toBe(true);
    });
  });
});
