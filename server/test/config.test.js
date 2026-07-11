import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { expandHome } from '../src/config.js';

test('expandHome expands a leading tilde on any platform', () => {
  assert.equal(expandHome('~'), os.homedir());
  assert.equal(expandHome('~/.claude/projects'), path.join(os.homedir(), '.claude/projects'));
  assert.equal(expandHome('~\\claude'), path.join(os.homedir(), 'claude'));
});

test('expandHome leaves absolute and relative paths alone', () => {
  assert.equal(expandHome('/var/data'), '/var/data');
  assert.equal(expandHome('C:\\Users\\dev'), 'C:\\Users\\dev');
  assert.equal(expandHome('./data'), './data');
  assert.equal(expandHome(''), '');
});
