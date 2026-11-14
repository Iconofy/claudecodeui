import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * CLAUDE.md variants: the CLAUDE_*.md files in `<claude config>/claude-md/`
 * (`$CLAUDE_CONFIG_DIR` or `~/.claude`). One of them is copied over
 * `<claude config>/CLAUDE.md`, and each chat remembers the one it uses in
 * `sessions.claude_md`: a variant file name, or `sha1:<hash>` when the content
 * matches no variant. The feature is off while the folder holds no variant.
 */
const configDir = (): string => process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), '.claude');
const variantsDir = (): string => path.join(configDir(), 'claude-md');
const claudeMdPath = (): string => path.join(configDir(), 'CLAUDE.md');
const VARIANT_NAME = /^CLAUDE_.+\.md$/i;
const STORED_HASH = /^(?:sha1:)?([0-9a-f]{40})?$/;

function hashFile(file: string): string {
  try {
    return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return '';
  }
}

function variantFiles(): string[] {
  try {
    return fs.readdirSync(variantsDir()).filter((name) => VARIANT_NAME.test(name)).sort();
  } catch {
    return [];
  }
}

const variantOf = (hash: string): string | undefined =>
  variantFiles().find((name) => hashFile(path.join(variantsDir(), name)) === hash);

const displayName = (hash: string): string =>
  hash ? variantOf(hash) || '(edited, matches no CLAUDE_*.md)' : '(no CLAUDE.md)';

export type ClaudeMdStatus = {
  sessionId: string;
  tracked: boolean;
  changed: boolean;
  current: { hash: string; name: string };
  /** `name` starts with "CLAUDE_" only when that variant file exists, i.e. it can be put back. */
  accepted: { value: string; hash: string | null; name: string } | null;
};

export type ClaudeMdVariants = { enabled: boolean; variants: string[]; current: { hash: string; name: string } };

export const claudeMdService = {
  isEnabled(): boolean {
    return variantFiles().length > 0;
  },

  /** The value to store for the CLAUDE.md that is in place right now. */
  currentValue(): string {
    const now = hashFile(claudeMdPath());
    return variantOf(now) || `sha1:${now}`;
  },

  status(sessionId: string, accepted: string | null): ClaudeMdStatus {
    const now = hashFile(claudeMdPath());
    const tracked = this.isEnabled() && typeof accepted === 'string' && accepted !== '';
    let acceptedInfo: ClaudeMdStatus['accepted'] = null;
    if (tracked) {
      const stored = STORED_HASH.exec(accepted);
      if (stored) {
        const hash = stored[1] || '';
        acceptedInfo = { value: accepted, hash, name: displayName(hash) };
      } else {
        const exists = variantFiles().includes(accepted);
        acceptedInfo = {
          value: accepted,
          hash: exists ? hashFile(path.join(variantsDir(), accepted)) : null,
          name: exists ? accepted : `(missing variant ${accepted})`,
        };
      }
    }
    return {
      sessionId,
      tracked,
      changed: Boolean(acceptedInfo && acceptedInfo.hash !== now),
      current: { hash: now, name: displayName(now) },
      accepted: acceptedInfo,
    };
  },

  variants(): ClaudeMdVariants {
    const now = hashFile(claudeMdPath());
    const variants = variantFiles();
    return { enabled: variants.length > 0, variants, current: { hash: now, name: displayName(now) } };
  },

  /**
   * Copies one variant over CLAUDE.md; null for a name that is not an existing
   * variant (checked against the folder listing, so no path can be passed in).
   * A CLAUDE.md that matches no variant is kept first in `claude-md/unsaved/`.
   */
  swap(name: unknown): ClaudeMdVariants | null {
    if (typeof name !== 'string' || !variantFiles().includes(name)) {
      return null;
    }
    const now = hashFile(claudeMdPath());
    if (now && !variantOf(now)) {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      fs.mkdirSync(path.join(variantsDir(), 'unsaved'), { recursive: true });
      fs.copyFileSync(claudeMdPath(), path.join(variantsDir(), 'unsaved', `CLAUDE_unsaved-${stamp}.md`));
    }
    fs.copyFileSync(path.join(variantsDir(), name), claudeMdPath());
    return this.variants();
  },
};
