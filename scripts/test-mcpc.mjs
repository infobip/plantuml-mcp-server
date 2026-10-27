#!/usr/bin/env node

// Exercise the compiled server through mcpc, not a custom MCP client.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, open, readFile, realpath, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(repo, 'dist/plantuml-mcp-server.js');
const publicServer = 'https://www.plantuml.com/plantuml';
const controller = new AbortController();
const interrupt = () => {
  failure ??= new Error('Test interrupted');
  controller.abort();
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);

let artifacts;
let mcpcHome;
let session;
let connectAttempted = false;
let failure;
const results = [];
let commandIndex = 0;

async function mcpc(label, args, { expected = [0], cleanup = false, record = true } = {}) {
  const prefix = join(artifacts, String(++commandIndex).padStart(2, '0'));
  const stdoutPath = `${prefix}.stdout`;
  const stderrPath = `${prefix}.stderr`;
  const out = await open(stdoutPath, 'w', 0o600);
  const err = await open(stderrPath, 'w', 0o600);
  let status;
  try {
    // File descriptors avoid truncated JSON when mcpc exits before a pipe flushes.
    status = await new Promise((resolveStatus) => {
      let error;
      const child = spawn('mcpc', [...args, '--json'], {
        cwd: repo,
        signal: cleanup ? undefined : controller.signal,
        stdio: ['ignore', out.fd, err.fd],
        env: { ...process.env, MCPC_HOME_DIR: mcpcHome },
      });
      const timer = setTimeout(() => {
        error = new Error('mcpc command timed out after 90 seconds');
        child.kill('SIGKILL');
      }, 90_000);
      timer.unref();
      child.on('error', cause => { error = cause; });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        resolveStatus({ code, signal, error });
      });
    });
  } finally {
    await Promise.all([out.close(), err.close()]);
  }
  const stdout = await readFile(stdoutPath, 'utf8');
  const stderr = await readFile(stderrPath, 'utf8');
  // Never retain the user's unrelated session configuration in test artifacts.
  if (!record) await Promise.all([rm(stdoutPath), rm(stderrPath)]);
  if (record) results.push({ label, exitCode: status.code, signal: status.signal });
  if (status.error || !expected.includes(status.code)) {
    const hint = status.error?.code === 'ENOENT'
      ? 'Install mcpc first: npm install -g @apify/mcpc'
      : `${status.error?.message ?? `exit ${status.code}, signal ${status.signal}`}\n${stderr}`;
    throw new Error(`${label}: ${hint}`);
  }
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error(`${label}: mcpc did not return valid JSON. See ${stdoutPath}. ${stderr}`);
  }
  if (record) results.at(-1).value = value;
  return value;
}

async function call(label, tool, args, error = false) {
  const result = await mcpc(label, [session, 'tools-call', tool, JSON.stringify(args)], {
    expected: error ? [0, 2] : [0],
  });
  assert.equal(Boolean(result.isError), error, `${label}: unexpected isError result`);
  return result;
}

function text(result) {
  assert.equal(result.content?.[0]?.type, 'text', 'Expected a text content block');
  return result.content[0].text;
}

function payload(result) {
  return JSON.parse(text(result));
}

async function absent(path) {
  await assert.rejects(access(path), { code: 'ENOENT' });
}

function passed(label) {
  console.log(`PASS ${label}`);
}

try {
  await access(entry);
  const metadata = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
  artifacts = await realpath(await mkdtemp(join(tmpdir(), 'plantuml-mcpc-')));
  console.log(`Artifacts: ${artifacts}`);
  mcpcHome = join(artifacts, 'mcpc');
  // Even listing sessions can reconnect bridges. Isolate all mcpc state.
  const sessions = await mcpc('Inspect sessions', [], { record: false });
  assert.ok(Array.isArray(sessions.sessions), 'Unexpected mcpc session-list response');
  const cwd = join(artifacts, 'server-cwd');
  const output = join(artifacts, 'allowed-output');
  await Promise.all([mkdir(cwd), mkdir(output)]);
  session = '@local';
  assert.ok(!sessions.sessions.some(s => s.name === session), 'Test session name already exists');
  console.log(`Local server: ${entry}`);
  console.log(`Test session: ${session} (MCPC_HOME_DIR=${mcpcHome})`);

  const env = {
    PLANTUML_SERVER_URL: publicServer,
    PLANTUML_ALLOWED_DIRS: output,
  };
  if (process.env.NODE_EXTRA_CA_CERTS) {
    // mcpc forwards only a small environment whitelist to stdio servers.
    env.NODE_EXTRA_CA_CERTS = resolve(process.env.NODE_EXTRA_CA_CERTS);
  }
  // mcpc configs do not expose cwd. Set it before loading the real CLI entry.
  // This also prevents inherited wildcard output permissions from weakening tests.
  const launch = `process.chdir(${JSON.stringify(cwd)}); `
    + `process.argv = [process.execPath, ${JSON.stringify(entry)}]; `
    + `await import(${JSON.stringify(pathToFileURL(entry).href)});`;
  const config = join(artifacts, 'mcp.json');
  await writeFile(config, JSON.stringify({
    mcpServers: {
      local: {
        command: process.execPath,
        args: ['--input-type=module', '--eval', launch],
        env,
      },
    },
  }, null, 2), { mode: 0o600 });

  connectAttempted = true;
  const connected = await mcpc('Connect', ['connect', `${config}:local`, session]);
  assert.equal(connected.length, 1);
  assert.equal(connected[0].serverInfo.name, 'plantuml-server');
  assert.equal(connected[0].serverInfo.version, metadata.version);
  const tools = await mcpc('List tools', [session, 'tools-list']);
  assert.deepEqual(tools.map(t => t.name).sort(), [
    'decode_plantuml', 'encode_plantuml', 'generate_plantuml_diagram',
  ]);
  for (const tool of tools) {
    const schema = await mcpc(`Schema: ${tool.name}`, [session, 'tools-get', tool.name]);
    assert.equal(schema.name, tool.name);
    assert.equal(schema.inputSchema.type, 'object');
  }
  const prompts = await mcpc('List prompts', [session, 'prompts-list']);
  assert.deepEqual(prompts.map(p => p.name), ['plantuml_error_handling']);
  const prompt = await mcpc('Get prompt', [session, 'prompts-get', 'plantuml_error_handling']);
  assert.ok(prompt.messages?.length > 0);
  passed('server identity, three tools, schemas, and prompt');

  const unicode = '@startuml\nAlice -> Bob: čćžšđ\n@enduml';
  const encoded = payload(await call('Encode', 'encode_plantuml', { plantuml_code: unicode })).encoded;
  assert.ok(typeof encoded === 'string' && encoded.length > 0);
  const decoded = payload(await call('Decode', 'decode_plantuml', { encoded_string: encoded })).decoded;
  assert.equal(decoded, unicode);
  passed('Unicode encode/decode roundtrip');

  const code = '@startuml\nAlice -> Bob: Local MCP smoke test\n@enduml';
  const url = payload(await call('Diagram URL', 'generate_plantuml_diagram', { plantuml_code: code }));
  assert.equal(url.success, true);
  assert.ok(url.url.startsWith(`${publicServer}/svg/`));
  assert.ok(url.markdown_embed.includes(url.url));
  passed('diagram URL and Markdown embed');

  for (const format of ['svg', 'png']) {
    const path = join(output, 'nested', `sequence.${format}`);
    const response = payload(await call(format, 'generate_plantuml_diagram', {
      plantuml_code: code, format, output_path: path,
    }));
    assert.equal(response.success, true);
    assert.equal(response.local_path, path);
    assert.equal(response.format, format);
    assert.ok(response.url.startsWith(`${publicServer}/${format}/`));
    const data = await readFile(path);
    if (format === 'svg') assert.ok(data.includes(Buffer.from('<svg')));
    else assert.deepEqual(data.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    passed(`${format.toUpperCase()} file contents and nested directory creation`);
  }

  const c4 = '@startuml\n!include <C4/C4_Container>\nPerson(user, "User")\n'
    + 'Container(app, "App", "Node.js")\nRel(user, app, "Uses")\n@enduml';
  const c4Path = join(cwd, 'c4.svg');
  const c4Response = payload(await call('C4', 'generate_plantuml_diagram', {
    plantuml_code: c4, output_path: c4Path,
  }));
  assert.equal(c4Response.success, true);
  assert.ok((await readFile(c4Path, 'utf8')).includes('<svg'));
  passed('C4 rendering and default CWD write permission');

  const invalid = '@startuml\nBob -> Alice: Hello\ninvalid_syntax_here\n@enduml';
  const syntax = payload(await call('Invalid syntax', 'generate_plantuml_diagram', {
    plantuml_code: invalid,
  }, true));
  assert.equal(syntax.validation_failed, true);
  assert.ok(syntax.error_details.error_message);
  passed('structured syntax error');

  const outside = join(artifacts, 'outside.svg');
  const forbidden = await call('Forbidden path', 'generate_plantuml_diagram', {
    plantuml_code: code, output_path: outside,
  }, true);
  assert.ok(text(forbidden).includes('outside allowed directories'));
  await absent(outside);
  const badExtension = join(output, 'bad.txt');
  const extension = await call('Forbidden extension', 'generate_plantuml_diagram', {
    plantuml_code: code, output_path: badExtension,
  }, true);
  assert.ok(text(extension).includes('Invalid extension'));
  await absent(badExtension);
  passed('path and extension restrictions, with no forbidden files created');
} catch (error) {
  failure = error;
} finally {
  if (connectAttempted) {
    try {
      const closed = await mcpc('Close test session', ['close', session], { cleanup: true });
      assert.equal(closed.closed, true);
      passed('test session cleanup');
    } catch (error) {
      console.error(`Cleanup failed. Run with MCPC_HOME_DIR=${JSON.stringify(mcpcHome)}: mcpc close ${session}`);
      failure ??= error;
    }
  }
  if (artifacts) {
    try {
      await writeFile(join(artifacts, 'results.json'), JSON.stringify({
        passed: !failure, error: failure?.message, results,
      }, null, 2), { mode: 0o600 });
    } catch (error) {
      failure ??= error;
    }
  }
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}

if (failure) {
  console.error(`FAIL local mcpc smoke test: ${failure.message}`);
  console.error('For TLS errors, set NODE_EXTRA_CA_CERTS to a trusted CA file. Do not disable TLS validation.');
  process.exitCode = 1;
} else {
  console.log('PASS local mcpc smoke test');
}
