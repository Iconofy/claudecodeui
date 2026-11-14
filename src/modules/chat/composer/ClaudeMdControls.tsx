import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Check, RefreshCw, TriangleAlert } from 'lucide-react';

import { authenticatedFetch } from '@/shared/api';
import { useComposerMenuAnchor } from '@/modules/chat/hooks/useComposerMenuAnchor';
import {
  ComposerMenuHeading,
  ComposerMenuItem,
  ComposerMenuSurface,
} from '@/modules/chat/composer/ComposerMenuPrimitives';

/**
 * CLAUDE.md variants in the composer (server: claude-md.ts). Each Claude chat
 * remembers its variant; when another chat switched CLAUDE.md, this chat puts
 * its own back before it sends. A banner (and a refused send) is left only when
 * that variant no longer exists. The swapper button picks a variant for the chat.
 * Hidden unless `<claude config>/claude-md/` holds CLAUDE_*.md files.
 */
type ClaudeMdStatus = {
  sessionId: string;
  tracked: boolean;
  changed: boolean;
  current: { hash: string; name: string };
  accepted: { value: string; hash: string | null; name: string } | null;
};

type ClaudeMdState = {
  sessionId: string | null;
  active: boolean;
  status: ClaudeMdStatus | null;
  variants: string[];
  current: string | null;
  busy: boolean;
};

let state: ClaudeMdState = { sessionId: null, active: false, status: null, variants: [], current: null, busy: false };
const listeners = new Set<() => void>();
let checkSeq = 0;

function setState(patch: Partial<ClaudeMdState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const useClaudeMdState = () => useSyncExternalStore(subscribe, () => state);

async function readData<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json())?.data as T;
}

type VariantsData = { enabled: boolean; variants: string[]; current: { name: string } };

const applyVariants = (data: VariantsData) =>
  setState({ variants: data.enabled ? data.variants : [], current: data.current.name });

async function postSwap(name: string, sessionId: string | null): Promise<void> {
  applyVariants(await readData<VariantsData>(await authenticatedFetch('/api/providers/claude/md-swap', {
    method: 'POST',
    body: JSON.stringify({ name, sessionId }),
  })));
}

/** Re-reads the chat's CLAUDE.md; with `confirm` it records the current one for the chat. */
export async function checkClaudeMd(sessionId: string | null, confirm = false): Promise<ClaudeMdStatus | null> {
  const seq = ++checkSeq;
  if (state.sessionId !== sessionId) {
    setState({ sessionId, status: null });
  }
  if (!sessionId || !state.active) {
    setState({ busy: false });
    return null;
  }
  setState({ busy: true });
  let status: ClaudeMdStatus | null = null;
  try {
    const url = `/api/providers/sessions/${encodeURIComponent(sessionId)}/claude-md`;
    status = await readData<ClaudeMdStatus>(
      await authenticatedFetch(confirm ? `${url}/confirm` : url, confirm ? { method: 'POST', body: '{}' } : {}),
    );
    if (status?.changed && status.accepted?.name.startsWith('CLAUDE_')) {
      await postSwap(status.accepted.name, sessionId);
      status = await readData<ClaudeMdStatus>(await authenticatedFetch(url));
    }
  } catch (error) {
    console.warn('CLAUDE.md check failed:', error);
  }
  if (seq === checkSeq) {
    setState({ status, busy: false, current: status?.current.name ?? state.current });
  }
  return status;
}

/** Called by the composer when the chat or provider changes. */
export function setClaudeMdScope(sessionId: string | null, active: boolean): void {
  setState({ active });
  void checkClaudeMd(sessionId);
}

/** True when the send has to wait: the chat's CLAUDE.md is gone and was not accepted again. */
export async function claudeMdBlocksSend(sessionId: string | null): Promise<boolean> {
  if (!sessionId || !state.active) {
    return false;
  }
  return Boolean((await checkClaudeMd(sessionId))?.changed);
}

async function loadVariants(): Promise<void> {
  try {
    applyVariants(await readData<VariantsData>(await authenticatedFetch('/api/providers/claude/md-variants')));
  } catch (error) {
    console.warn('CLAUDE.md variants failed:', error);
  }
}

const shortName = (name: string) =>
  name.startsWith('CLAUDE_') ? name.slice(7, -3) : name.startsWith('(e') ? 'edited' : 'none';

export function ClaudeMdBanner() {
  const { status, busy } = useClaudeMdState();

  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === 'visible' && state.sessionId) {
        void checkClaudeMd(state.sessionId);
      }
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, []);

  if (!status?.changed) {
    return null;
  }
  const buttonClass =
    'ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors disabled:opacity-50';
  return (
    <div
      role="alert"
      className="mx-auto mb-2 flex max-w-[54.25rem] flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground"
    >
      <span className="w-full min-w-0 sm:w-auto sm:flex-1">
        <TriangleAlert className="mr-1 inline h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        <span className="font-semibold">CLAUDE.md changed</span> since this chat accepted it:{' '}
        <span className="font-mono">{status.accepted?.name}</span> →{' '}
        <span className="font-mono">{status.current.name}</span>. Sending is locked until you accept it or
        switch the file back.
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void checkClaudeMd(status.sessionId)}
        title="Check CLAUDE.md again"
        className={`${buttonClass} text-muted-foreground hover:bg-muted hover:text-foreground`}
      >
        <RefreshCw className={`h-3.5 w-3.5${busy ? ' animate-spin' : ''}`} />
        Refresh
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void checkClaudeMd(status.sessionId, true)}
        title="Use the current CLAUDE.md for this chat from now on"
        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
        Use current
      </button>
    </div>
  );
}

export function ClaudeMdMenu() {
  const { active, variants, current } = useClaudeMdState();
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  const { triggerRef, menuRef, anchor, updateAnchor } = useComposerMenuAnchor(isOpen, close);

  useEffect(() => {
    void loadVariants();
  }, []);

  if (!active || variants.length === 0 || current === null) {
    return null;
  }
  const label = 'Switch CLAUDE.md';
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          updateAnchor();
          void loadVariants();
          setIsOpen((open) => !open);
        }}
        className="flex h-8 shrink-0 items-center rounded-lg border border-border/60 bg-muted/40 px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={label}
        title={`CLAUDE.md: ${current}`}
      >
        <span className="sm:hidden">MD</span>
        <span className="hidden max-w-36 truncate sm:block">{shortName(current)}</span>
      </button>
      {isOpen && anchor && createPortal(
        <ComposerMenuSurface anchor={anchor} menuRef={menuRef} ariaLabel={label}>
          <ComposerMenuHeading>CLAUDE.md</ComposerMenuHeading>
          {variants.map((name) => (
            <ComposerMenuItem
              key={name}
              label={shortName(name)}
              description={name}
              isSelected={name === current}
              onSelect={() => {
                setIsOpen(false);
                void postSwap(name, state.sessionId)
                  .catch((error) => console.warn('CLAUDE.md swap failed:', error))
                  .then(() => checkClaudeMd(state.sessionId));
              }}
            />
          ))}
        </ComposerMenuSurface>,
        document.body,
      )}
    </>
  );
}
