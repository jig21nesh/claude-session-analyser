import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function makeTempProjectsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'csa-test-'));
}

export function writeSessionFile(projectsDir, dirName, sessionId, entries) {
  const dir = path.join(projectsDir, dirName);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(filePath, entries.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n'));
  return filePath;
}

export function assistantEntry({
  requestId,
  model = 'claude-opus-4-8',
  timestamp = '2026-07-01T10:00:00.000Z',
  input = 1000,
  output = 500,
  cacheRead = 0,
  cache5m = 0,
  cache1h = 0,
  sidechain = false,
  toolUses = 0,
  cwd = '/Users/tester/dev/sample-project',
}) {
  const content = [{ type: 'text', text: 'ok' }];
  for (let i = 0; i < toolUses; i += 1) {
    content.push({ type: 'tool_use', id: `toolu_${requestId}_${i}`, name: 'Bash', input: {} });
  }
  return {
    type: 'assistant',
    uuid: `uuid-${requestId}`,
    requestId,
    isSidechain: sidechain,
    timestamp,
    cwd,
    gitBranch: 'main',
    version: '2.1.0',
    sessionId: 'ignored',
    message: {
      id: `msg_${requestId}`,
      role: 'assistant',
      model,
      content,
      usage: {
        input_tokens: input,
        output_tokens: output,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cache5m + cache1h,
        cache_creation: {
          ephemeral_5m_input_tokens: cache5m,
          ephemeral_1h_input_tokens: cache1h,
        },
      },
    },
  };
}

export function userEntry({ timestamp = '2026-07-01T09:59:00.000Z', text = 'do the thing', toolResult = false }) {
  return {
    type: 'user',
    uuid: `uuid-user-${Math.random().toString(36).slice(2)}`,
    timestamp,
    message: {
      role: 'user',
      content: toolResult ? [{ type: 'tool_result', tool_use_id: 'toolu_x', content: 'result' }] : text,
    },
  };
}
