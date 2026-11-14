import assert from 'node:assert/strict';

import { test } from 'vitest';

import { moveModelBefore } from '@/modules/chat/composer/useModelOrderDrag';

const order = ['a', 'b', 'c', 'd'];

test('moveModelBefore moves a row down to the place of the row under the pointer', () => {
  assert.deepEqual(moveModelBefore(order, 'a', 'c'), ['b', 'c', 'a', 'd']);
});

test('moveModelBefore moves a row up to the place of the row under the pointer', () => {
  assert.deepEqual(moveModelBefore(order, 'd', 'b'), ['a', 'd', 'b', 'c']);
});

test('moveModelBefore returns the same array when nothing moves', () => {
  assert.equal(moveModelBefore(order, 'b', 'b'), order);
  assert.equal(moveModelBefore(order, 'x', 'b'), order);
  assert.equal(moveModelBefore(order, 'b', 'x'), order);
});
