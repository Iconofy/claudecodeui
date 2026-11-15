import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ClaudeSessionsProvider } from '@/modules/providers/list/claude/claude-sessions.provider.js';
import { CLAUDE_PREDEFINED_MODELS } from '@/modules/providers/list/claude/claude-models.provider.js';
import { queryClaudeSDK, resolveToolApproval } from '@/modules/providers/list/claude/claude-runtime.provider.js';
import type { AnyRecord, NormalizedMessage, ProviderRuntimeContext } from '@/shared/types.js';

/**
 * A plan approval (ExitPlanMode) can carry the model picked on the plan card.
 * The run switches to it with the SDK's `setModel`; a revise (deny) never does.
 */

const [START_MODEL, OTHER_MODEL] = CLAUDE_PREDEFINED_MODELS.OPTIONS.map((option) => option.value);
const cliModelOf = (value: string) =>
  CLAUDE_PREDEFINED_MODELS.OPTIONS.find((option) => option.value === value)?.cliModel || value;

async function answerPlan(decision: AnyRecord): Promise<{ setModel: Array<string | undefined>; result: AnyRecord }> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'claude-plan-model-'));
  const setModel: Array<string | undefined> = [];
  const sent: NormalizedMessage[] = [];
  let result: AnyRecord = {};

  const createQuery: NonNullable<ProviderRuntimeContext['createQuery']> = ({ prompt, options }) => {
    void (async () => {
      for await (const _message of prompt) { /* the CLI reads its stdin */ }
    })();
    const iterator = (async function* () {
      yield { type: 'system', subtype: 'init', session_id: 'native-plan-session' };
      result = await options.canUseTool('ExitPlanMode', { plan: 'x' }, {});
    })();
    return Object.assign(iterator, {
      interrupt: async () => {},
      setModel: async (model?: string) => { setModel.push(model); },
    });
  };

  const sessions = new ClaudeSessionsProvider({ getLiveRunStartTime: () => null });
  const context: ProviderRuntimeContext = {
    resolveProviderSessionId: () => null,
    resolveResumeModel: async () => undefined,
    getProviderModels: async () => CLAUDE_PREDEFINED_MODELS as never,
    normalizeMessage: (raw, sessionId) => sessions.normalizeMessage(raw, sessionId),
    isProviderInstalled: async () => true,
    createQuery,
  };
  const writer = { send: (message: NormalizedMessage) => { sent.push(message); }, userId: null };

  try {
    const done = queryClaudeSDK('hello', { sessionId: 'app-plan-session', cwd, model: START_MODEL }, writer as never, context);
    let request: NormalizedMessage | undefined;
    for (let attempt = 0; attempt < 200 && !request; attempt += 1) {
      await new Promise((resolve) => { setTimeout(resolve, 25); });
      request = sent.find((message) => message.kind === 'permission_request');
    }
    assert.ok(request, 'the plan never asked for approval');
    resolveToolApproval((request as AnyRecord).requestId, decision as never);
    await done;
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
  return { setModel, result };
}

test('Build with another model switches the running turn to it', async () => {
  const { setModel, result } = await answerPlan({ allow: true, model: OTHER_MODEL, permissionMode: 'bypassPermissions' });
  assert.deepEqual(setModel, [cliModelOf(OTHER_MODEL)]);
  assert.equal(result.behavior, 'allow');
  assert.equal(result.updatedPermissions?.[0]?.mode, 'bypassPermissions');
});

test('Build with the same model, or without one, does not switch', async () => {
  assert.deepEqual((await answerPlan({ allow: true, model: START_MODEL })).setModel, []);
  assert.deepEqual((await answerPlan({ allow: true })).setModel, []);
});

test('a revise passes the user text back and never switches the model', async () => {
  const { setModel, result } = await answerPlan({ allow: false, message: 'The user wants the plan changed: shorter', model: OTHER_MODEL });
  assert.deepEqual(setModel, []);
  assert.deepEqual(result, { behavior: 'deny', message: 'The user wants the plan changed: shorter' });
});
