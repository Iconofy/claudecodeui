import { readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Extra Claude accounts, read from `~/.cloudcli/claude-accounts.json` (or the
 * file named by `CLOUDCLI_CLAUDE_ACCOUNTS`). Each account runs the Claude CLI
 * with its own environment; the model picker offers it as "<id>:<model>".
 *
 * {
 *   "accounts": [
 *     { "id": "work", "label": "Work", "env": { "CLAUDE_CODE_OAUTH_TOKEN": "sk-ant-oat01-..." } },
 *     { "id": "second", "label": "Second login", "configDir": "~/.claude-second" }
 *   ]
 * }
 *
 * The file holds secrets: it is read on the server only, and nothing but `id`
 * and `label` ever reaches the browser.
 */
export type ClaudeAccount = {
  id: string;
  label: string;
  description?: string;
  /** CLAUDE_CONFIG_DIR for this account (its own `claude /login`). */
  configDir?: string;
  /** Environment variables set for this account's CLI runs (tokens, base URL...). */
  env: Record<string, string>;
};

const ACCOUNT_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

let cache: { file: string; mtimeMs: number; accounts: ClaudeAccount[] } | null = null;

function accountsFilePath(): string {
  const override = process.env.CLOUDCLI_CLAUDE_ACCOUNTS?.trim();
  return override || path.join(os.homedir(), '.cloudcli', 'claude-accounts.json');
}

function expandHome(value: string): string {
  return value === '~' || value.startsWith('~/') || value.startsWith('~\\')
    ? path.join(os.homedir(), value.slice(1))
    : value;
}

/** Validates one entry; returns null (with a warning) for anything unusable. */
function parseAccount(raw: unknown, seen: Set<string>): ClaudeAccount | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const entry = raw as Record<string, unknown>;
  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  if (!ACCOUNT_ID.test(id) || seen.has(id)) {
    console.warn(`[claude-accounts] Skipped an account with a missing, invalid or duplicate id: ${JSON.stringify(entry.id)} (use a-z, 0-9 and -)`);
    return null;
  }
  const env: Record<string, string> = {};
  if (entry.env && typeof entry.env === 'object') {
    for (const [name, value] of Object.entries(entry.env as Record<string, unknown>)) {
      if (ENV_NAME.test(name) && typeof value === 'string') {
        env[name] = value;
      }
    }
  }
  const configDir = typeof entry.configDir === 'string' && entry.configDir.trim()
    ? path.resolve(expandHome(entry.configDir.trim()))
    : undefined;
  const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim().slice(0, 40) : id;
  const description = typeof entry.description === 'string' ? entry.description.trim().slice(0, 120) : undefined;
  seen.add(id);
  return { id, label, description, configDir, env };
}

/**
 * The configured accounts, re-read whenever the file changes (no restart
 * needed). A missing file means "no extra accounts"; a broken one is reported
 * once per change and treated the same way.
 */
export function loadClaudeAccounts(): ClaudeAccount[] {
  const file = accountsFilePath();
  let mtimeMs: number;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    cache = null;
    return [];
  }
  if (cache && cache.file === file && cache.mtimeMs === mtimeMs) {
    return cache.accounts;
  }
  let accounts: ClaudeAccount[] = [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { accounts?: unknown };
    const seen = new Set<string>();
    accounts = (Array.isArray(parsed?.accounts) ? parsed.accounts : [])
      .map((entry) => parseAccount(entry, seen))
      .filter((entry): entry is ClaudeAccount => entry !== null);
  } catch (error) {
    console.warn(`[claude-accounts] Could not read ${file}:`, (error as Error).message);
  }
  cache = { file, mtimeMs, accounts };
  return accounts;
}

/**
 * Splits "<account>:<model>" when the prefix is a configured account; any
 * other value (including model ids that contain a colon) is a plain model.
 */
export function splitClaudeAccountModel(value: string | undefined | null): { account: ClaudeAccount | null; model: string } {
  const text = typeof value === 'string' ? value : '';
  const separator = text.indexOf(':');
  if (separator > 0) {
    const account = loadClaudeAccounts().find((entry) => entry.id === text.slice(0, separator));
    if (account) {
      return { account, model: text.slice(separator + 1) };
    }
  }
  return { account: null, model: text };
}

/** Returns a copy of `env` with the account's CLAUDE_CONFIG_DIR and variables applied. */
export function applyClaudeAccountEnv(env: NodeJS.ProcessEnv, account: ClaudeAccount): NodeJS.ProcessEnv {
  return {
    ...env,
    ...(account.configDir ? { CLAUDE_CONFIG_DIR: account.configDir } : {}),
    ...account.env,
  };
}
