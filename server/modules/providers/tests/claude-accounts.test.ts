import assert from 'node:assert/strict';
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  applyClaudeAccountEnv,
  loadClaudeAccounts,
  splitClaudeAccountModel,
} from '@/modules/providers/list/claude/claude-accounts.js';

async function withAccountsFile(content: unknown, run: (file: string) => Promise<void> | void): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-accounts-'));
  const file = path.join(dir, 'claude-accounts.json');
  const previous = process.env.CLOUDCLI_CLAUDE_ACCOUNTS;
  process.env.CLOUDCLI_CLAUDE_ACCOUNTS = file;
  try {
    await writeFile(file, typeof content === 'string' ? content : JSON.stringify(content));
    await run(file);
  } finally {
    if (previous === undefined) {
      delete process.env.CLOUDCLI_CLAUDE_ACCOUNTS;
    } else {
      process.env.CLOUDCLI_CLAUDE_ACCOUNTS = previous;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

test('valid accounts load; invalid or duplicate ids and non-string env values are dropped', async () => {
  await withAccountsFile({
    accounts: [
      { id: 'work', label: 'Work', env: { CLAUDE_CODE_OAUTH_TOKEN: 'tok', BAD: 1, 'not-valid': 'x' } },
      { id: 'second', configDir: '~/.claude-second' },
      { id: 'Work Account' },
      { id: 'work', label: 'duplicate' },
      'not an object',
    ],
  }, () => {
    const accounts = loadClaudeAccounts();
    assert.deepEqual(accounts.map((account) => account.id), ['work', 'second']);
    assert.deepEqual(accounts[0].env, { CLAUDE_CODE_OAUTH_TOKEN: 'tok' });
    assert.equal(accounts[1].label, 'second');
    assert.equal(accounts[1].configDir, path.join(os.homedir(), '.claude-second'));
  });
});

test('only a configured account prefix is split off a model value', async () => {
  await withAccountsFile({ accounts: [{ id: 'work', label: 'Work' }] }, () => {
    const split = splitClaudeAccountModel('work:opus');
    assert.equal(split.account?.id, 'work');
    assert.equal(split.model, 'opus');
    assert.deepEqual(splitClaudeAccountModel('opus'), { account: null, model: 'opus' });
    // A colon in a model id is not an account.
    assert.deepEqual(splitClaudeAccountModel('llama3:8b'), { account: null, model: 'llama3:8b' });
    assert.deepEqual(splitClaudeAccountModel(undefined), { account: null, model: '' });
  });
});

test('an account applies its config dir and variables on top of the base env', async () => {
  await withAccountsFile({ accounts: [{ id: 'x', configDir: '/tmp/cfg', env: { ANTHROPIC_BASE_URL: 'https://example.test' } }] }, () => {
    const [account] = loadClaudeAccounts();
    const base = { PATH: '/bin', CLAUDE_CONFIG_DIR: '/old' };
    const env = applyClaudeAccountEnv(base, account);
    assert.equal(env.PATH, '/bin');
    assert.equal(env.CLAUDE_CONFIG_DIR, path.resolve('/tmp/cfg'));
    assert.equal(env.ANTHROPIC_BASE_URL, 'https://example.test');
    assert.equal(base.CLAUDE_CONFIG_DIR, '/old');
  });
});

test('a broken file means no accounts, and edits are picked up without a restart', async () => {
  await withAccountsFile('{ not json', async (file) => {
    assert.deepEqual(loadClaudeAccounts(), []);
    await writeFile(file, JSON.stringify({ accounts: [{ id: 'later' }] }));
    const future = new Date(Date.now() + 5000);
    await utimes(file, future, future);
    assert.deepEqual(loadClaudeAccounts().map((account) => account.id), ['later']);
  });
});
