import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { claudeMdService } from '@/modules/providers/list/claude/claude-md.js';

/**
 * CLAUDE.md variants live in `<CLAUDE_CONFIG_DIR>/claude-md/`; each test gets
 * its own config folder with variants A and B and CLAUDE.md = A.
 */
function withConfigDir(run: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-md-test-'));
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = dir;
  try {
    fs.mkdirSync(path.join(dir, 'claude-md'));
    fs.writeFileSync(path.join(dir, 'claude-md', 'CLAUDE_A.md'), 'A\n');
    fs.writeFileSync(path.join(dir, 'claude-md', 'CLAUDE_B.md'), 'B\n');
    fs.copyFileSync(path.join(dir, 'claude-md', 'CLAUDE_A.md'), path.join(dir, 'CLAUDE.md'));
    run(dir);
  } finally {
    if (previous === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = previous;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('lists variants and names the current CLAUDE.md', () => {
  withConfigDir(() => {
    const result = claudeMdService.variants();
    assert.equal(result.enabled, true);
    assert.deepEqual(result.variants, ['CLAUDE_A.md', 'CLAUDE_B.md']);
    assert.equal(result.current.name, 'CLAUDE_A.md');
    assert.equal(claudeMdService.currentValue(), 'CLAUDE_A.md');
  });
});

test('is off without a variants folder', () => {
  withConfigDir((dir) => {
    fs.rmSync(path.join(dir, 'claude-md'), { recursive: true });
    assert.equal(claudeMdService.isEnabled(), false);
    const status = claudeMdService.status('s1', 'CLAUDE_B.md');
    assert.equal(status.tracked, false);
    assert.equal(status.changed, false);
  });
});

test('compares the accepted variant with the current file', () => {
  withConfigDir((dir) => {
    assert.equal(claudeMdService.status('s1', null).tracked, false);
    assert.equal(claudeMdService.status('s1', 'CLAUDE_A.md').changed, false);
    const changed = claudeMdService.status('s1', 'CLAUDE_B.md');
    assert.equal(changed.changed, true);
    assert.equal(changed.accepted?.name, 'CLAUDE_B.md');
    // Editing the variant file: the chat follows it by name.
    fs.writeFileSync(path.join(dir, 'claude-md', 'CLAUDE_A.md'), 'A2\n');
    assert.equal(claudeMdService.status('s1', 'CLAUDE_A.md').changed, true);
    // A deleted variant cannot be put back.
    fs.rmSync(path.join(dir, 'claude-md', 'CLAUDE_B.md'));
    assert.equal(claudeMdService.status('s1', 'CLAUDE_B.md').accepted?.name.startsWith('CLAUDE_'), false);
  });
});

test('swaps only to an existing variant and keeps a hand-edited CLAUDE.md', () => {
  withConfigDir((dir) => {
    for (const name of ['nope.md', '../CLAUDE_A.md', 'CLAUDE.md', undefined, 42]) {
      assert.equal(claudeMdService.swap(name), null);
    }
    assert.equal(claudeMdService.swap('CLAUDE_B.md')?.current.name, 'CLAUDE_B.md');
    assert.equal(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), 'B\n');

    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'hand edit');
    const value = claudeMdService.currentValue();
    assert.match(value, /^sha1:[0-9a-f]{40}$/);
    assert.equal(claudeMdService.status('s1', value).changed, false);
    assert.equal(claudeMdService.swap('CLAUDE_A.md')?.variants.length, 2);
    const unsaved = fs.readdirSync(path.join(dir, 'claude-md', 'unsaved'));
    assert.equal(unsaved.length, 1);
    assert.equal(fs.readFileSync(path.join(dir, 'claude-md', 'unsaved', unsaved[0]), 'utf8'), 'hand edit');
  });
});
