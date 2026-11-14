import assert from 'node:assert/strict';

import { test } from 'vitest';

import { stripSlashCommandToken } from '@/modules/chat/utils/chatFormatting';

test('removes the slash token at the end and keeps the draft', () => {
  assert.deepEqual(stripSlashCommandToken('hello draft /co'), { text: 'hello draft ', cursor: 12 });
});

test('a lone command leaves the composer empty', () => {
  assert.deepEqual(stripSlashCommandToken('/cost'), { text: '', cursor: 0 });
});

test('removes a token in the middle at the cursor', () => {
  assert.deepEqual(stripSlashCommandToken('one /us two', 7), { text: 'one two', cursor: 4 });
});

test('a token after a line break is removed', () => {
  assert.deepEqual(stripSlashCommandToken('line1\n/usage'), { text: 'line1\n', cursor: 6 });
});

test('text without a slash token is unchanged', () => {
  assert.deepEqual(stripSlashCommandToken('no token here'), { text: 'no token here', cursor: 13 });
  assert.deepEqual(stripSlashCommandToken('a/b'), { text: 'a/b', cursor: 3 });
});
