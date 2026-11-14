import assert from 'node:assert/strict';
import test from 'node:test';

import { applyModelLayout, createProviderModelsService } from '@/modules/providers/services/provider-models.service.js';
import type { CustomProviderModelRecord, LLMProvider, ProviderModelsDefinition } from '@/shared/types.js';

const ACCOUNT = { id: 'work', label: 'Work' };

const predefined: ProviderModelsDefinition = {
  DEFAULT: 'default',
  OPTIONS: [
    { value: 'default', label: 'Default' },
    { value: 'fable', label: 'Fable', ultracode: true },
    { value: 'opus', label: 'Opus' },
    { value: 'haiku', label: 'Haiku' },
    { value: 'work:fable', label: 'Fable · Work', account: ACCOUNT },
    { value: 'work:opus', label: 'Opus · Work', account: ACCOUNT },
  ],
};

const customRows: CustomProviderModelRecord[] = [
  { recordId: 1, provider: 'claude', modelId: 'fable-next', model: 'Fable Next', sortOrder: 0, effort: null },
  { recordId: 2, provider: 'claude', modelId: 'gateway-x', model: 'Gateway X', sortOrder: 1, effort: null },
];

const createService = () => {
  const settings = new Map<string, string>();
  const service = createProviderModelsService({
    resolveProvider: () => ({
      models: {
        getSupportedModels: async () => predefined,
        getCurrentActiveModel: async () => ({ model: predefined.DEFAULT }),
      },
    }),
    catalog: {
      listCustomProviderModels: (provider: LLMProvider) => (provider === 'claude' ? customRows : []),
    } as never,
    settings: {
      get: (key: string) => settings.get(key) ?? null,
      set: (key: string, value: string) => { settings.set(key, value); },
    } as never,
    sessions: {
      getSessionById: () => null,
      setSessionModel: () => {},
      setSessionEffort: () => {},
    },
  });
  return { service, settings };
};

const values = (catalog: ProviderModelsDefinition) => catalog.OPTIONS.map((option) => option.value);

test('without a saved layout the catalog keeps its own order', async () => {
  const { service } = createService();
  assert.deepEqual(values(await service.getProviderModels('claude')), [
    'default', 'fable', 'opus', 'haiku', 'work:fable', 'work:opus', 'fable-next', 'gateway-x',
  ]);
});

test('setModelOrder puts listed models first and account copies follow their model', async () => {
  const { service, settings } = createService();
  const catalog = await service.setModelOrder('claude', ['gateway-x', 'opus', 'fable', 'opus']);
  assert.deepEqual(values(catalog), [
    'gateway-x', 'opus', 'work:opus', 'fable', 'work:fable', 'default', 'haiku', 'fable-next',
  ]);
  assert.deepEqual(JSON.parse(settings.get('provider_models_layout:claude') ?? '{}').order, ['gateway-x', 'opus', 'fable']);
});

test('setBuiltinModelEdit renames a built-in, sets cliModel and hides the duplicate custom row', async () => {
  const { service } = createService();
  const catalog = await service.setBuiltinModelEdit('claude', 'fable', { label: 'Fable Next', id: 'fable-next' });
  const fable = catalog.OPTIONS.find((option) => option.value === 'fable');
  assert.equal(fable?.label, 'Fable Next');
  assert.equal(fable?.cliModel, 'fable-next');
  assert.equal(fable?.edited, true);
  assert.equal(fable?.builtinLabel, 'Fable');
  assert.equal(fable?.ultracode, true);
  const copy = catalog.OPTIONS.find((option) => option.value === 'work:fable');
  assert.equal(copy?.label, 'Fable Next · Work');
  assert.equal(copy?.cliModel, 'fable-next');
  assert.ok(!values(catalog).includes('fable-next'));

  const restored = await service.setBuiltinModelEdit('claude', 'fable', null);
  const reset = restored.OPTIONS.find((option) => option.value === 'fable');
  assert.equal(reset?.label, 'Fable');
  assert.equal(reset?.cliModel, undefined);
  assert.ok(values(restored).includes('fable-next'));
});

test('setBuiltinModelEdit refuses values that are not built-in models', async () => {
  const { service } = createService();
  await assert.rejects(service.setBuiltinModelEdit('claude', 'gateway-x', { label: 'X', id: 'x' }), /not found/);
  await assert.rejects(service.setBuiltinModelEdit('claude', 'work:fable', { label: 'X', id: 'x' }), /not found/);
});

test('a damaged layout row falls back to the plain catalog', async () => {
  const { service, settings } = createService();
  settings.set('provider_models_layout:claude', '{not json');
  assert.equal(values(await service.getProviderModels('claude'))[0], 'default');
});

test('applyModelLayout leaves custom models unedited even when an edit uses their value', () => {
  const merged: ProviderModelsDefinition = {
    DEFAULT: 'a',
    OPTIONS: [{ value: 'a', label: 'A', isCustom: false }, { value: 'b', label: 'B', isCustom: true }],
  };
  const result = applyModelLayout(merged, { order: [], edits: { b: { label: 'Bee', id: 'bee' } } });
  assert.equal(result.OPTIONS[1].label, 'B');
  assert.equal(result.OPTIONS[1].cliModel, undefined);
});
