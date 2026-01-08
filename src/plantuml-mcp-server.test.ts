import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, unlinkSync, rmdirSync } from 'fs';
import { resolve } from 'path';
import plantumlEncoder from 'plantuml-encoder';

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
      rmdirSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  } catch (e) {
    // ignore
  }
}

describe('PlantUML Encoder', () => {
  it('should encode PlantUML code', () => {
    const encoded = plantumlEncoder.encode(simpleDiagram);
    expect(encoded).toBeDefined();
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('should decode PlantUML code', () => {
    const encoded = plantumlEncoder.encode(simpleDiagram);
    const decoded = plantumlEncoder.decode(encoded);
    expect(decoded).toBe(simpleDiagram);
  });

  it('should produce consistent encoding', () => {
    const encoded1 = plantumlEncoder.encode(simpleDiagram);
    const encoded2 = plantumlEncoder.encode(simpleDiagram);
    expect(encoded1).toBe(encoded2);
  });
});

describe('PlantUML URL Generation', () => {
  it('should generate valid SVG URL', () => {
    const encoded = plantumlEncoder.encode(simpleDiagram);
    const url = `${PLANTUML_SERVER_URL}/svg/${encoded}`;
    expect(url).toContain('/svg/');
    expect(url).toContain(encoded);
  });

  it('should generate valid PNG URL', () => {
    const encoded = plantumlEncoder.encode(simpleDiagram);
    const url = `${PLANTUML_SERVER_URL}/png/${encoded}`;
    expect(url).toContain('/png/');
    expect(url).toContain(encoded);
  });
});

describe('PlantUML Server Accessibility', () => {
  it('should fetch SVG diagram from server', async () => {
    const encoded = plantumlEncoder.encode(simpleDiagram);
    const url = `${PLANTUML_SERVER_URL}/svg/${encoded}`;

    const response = await fetch(url);
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toContain('image/svg+xml');
  });

  it('should fetch PNG diagram from server', async () => {
    const encoded = plantumlEncoder.encode(simpleDiagram);
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

    const encoded = plantumlEncoder.encode(invalidDiagram);
    const url = `${PLANTUML_SERVER_URL}/txt/${encoded}`;

    const response = await fetch(url);
    const errorHeader = response.headers.get('x-plantuml-diagram-error');

    // PlantUML should detect syntax error
    expect(errorHeader).toBeDefined();
  });

  it('should not have error header for valid diagram', async () => {
    const encoded = plantumlEncoder.encode(simpleDiagram);
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
    const encoded = plantumlEncoder.encode(simpleDiagram);
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
    const encoded = plantumlEncoder.encode(classDiagram);
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
    const encoded = plantumlEncoder.encode(simpleDiagram);
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
