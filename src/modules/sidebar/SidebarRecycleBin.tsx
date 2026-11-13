import { useCallback, useEffect, useState } from 'react';
import { Folder, RotateCcw, Trash2 } from 'lucide-react';

import { api } from '@/shared/api';
import { LLMProviderLogo } from '@/shared/ui';
import { cn } from '@/shared/utils';
import type { LLMProvider } from '@/shared/types';

type RecycleBinItem = {
  kind: 'project' | 'session';
  id: string;
  provider?: LLMProvider;
  title: string;
  subtitle: string;
  trashedAt: string;
  purgeAt: string;
};

type TrashedProjectsPayload = {
  data?: {
    projects?: Array<{
      projectId: string;
      displayName?: string;
      fullPath?: string;
      sessionCount?: number;
      trashedAt: string;
      purgeAt: string;
    }>;
  };
};

type TrashedSessionsPayload = {
  data?: {
    sessions?: Array<{
      sessionId: string;
      provider: LLMProvider;
      sessionTitle?: string;
      projectDisplayName?: string;
      trashedAt: string;
      purgeAt: string;
    }>;
  };
};

type SidebarRecycleBinProps = {
  /** The sidebar search text; filters the bin by title and subtitle. */
  filter: string;
  /** Called after a restore or a permanent delete so the sidebar lists reload. */
  onChanged: () => void;
};

const itemKey = (item: RecycleBinItem) => `${item.kind}:${item.id}`;

const describeTimeLeft = (purgeAt: string): string => {
  const days = Math.ceil((Date.parse(purgeAt) - Date.now()) / 864e5);
  if (Number.isNaN(days)) return '';
  if (days <= 0) return 'Deletes today';
  return days === 1 ? 'Deletes in 1 day' : `Deletes in ${days} days`;
};

/**
 * Used by SidebarContent for the "Recycle bin" tab: deleted chats and projects,
 * each with Restore and a two-step "Delete now". The server removes items that
 * have been here for 30 days.
 */
export default function SidebarRecycleBin({ filter, onChanged }: SidebarRecycleBinProps) {
  const [items, setItems] = useState<RecycleBinItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [projectsResponse, sessionsResponse] = await Promise.all([api.trashedProjects(), api.trashedSessions()]);
      if (!projectsResponse.ok || !sessionsResponse.ok) {
        throw new Error(`HTTP ${projectsResponse.ok ? sessionsResponse.status : projectsResponse.status}`);
      }
      const projects = ((await projectsResponse.json()) as TrashedProjectsPayload).data?.projects ?? [];
      const sessions = ((await sessionsResponse.json()) as TrashedSessionsPayload).data?.sessions ?? [];
      const next: RecycleBinItem[] = [
        ...projects.map((project) => ({
          kind: 'project' as const,
          id: project.projectId,
          title: project.displayName || project.projectId,
          subtitle: `${project.sessionCount ?? 0} chat(s) · ${project.fullPath ?? ''}`,
          trashedAt: project.trashedAt,
          purgeAt: project.purgeAt,
        })),
        ...sessions.map((session) => ({
          kind: 'session' as const,
          id: session.sessionId,
          provider: session.provider,
          title: session.sessionTitle || session.sessionId,
          subtitle: session.projectDisplayName ?? '',
          trashedAt: session.trashedAt,
          purgeAt: session.purgeAt,
        })),
      ];
      next.sort((a, b) => String(b.trashedAt).localeCompare(String(a.trashedAt)));
      setItems(next);
      setError(null);
    } catch (loadError) {
      console.error('[Sidebar] Failed to load Recycle bin:', loadError);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (item: RecycleBinItem, deleteForever: boolean) => {
    const key = itemKey(item);
    setBusyKey(key);
    try {
      const response = item.kind === 'project'
        ? deleteForever ? await api.deleteProjectPermanently(item.id) : await api.restoreProject(item.id)
        : deleteForever ? await api.deleteSessionPermanently(item.id) : await api.restoreSession(item.id);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setConfirmKey(null);
      await load();
      onChanged();
    } catch (actionError) {
      console.error('[Sidebar] Recycle bin action failed:', actionError);
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusyKey(null);
    }
  };

  const term = filter.trim().toLowerCase();
  const shown = (items ?? []).filter((item) => !term || `${item.title} ${item.subtitle}`.toLowerCase().includes(term));

  if (items === null && !error) {
    return (
      <div className="px-3 py-8 text-center text-xs text-muted-foreground" aria-live="polite">
        Loading Recycle bin...
      </div>
    );
  }

  return (
    <div className="space-y-1.5 px-2 py-1">
      {error && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
          <span className="min-w-0 truncate">Recycle bin: {error}</span>
          <button
            type="button"
            className="flex-shrink-0 underline"
            onClick={() => {
              setError(null);
              void load();
            }}
          >
            Retry
          </button>
        </div>
      )}
      <p className="px-1 pb-0.5 text-[11px] text-muted-foreground">
        Deleted chats and projects stay here for 30 days, then are removed for good.
      </p>
      {shown.length === 0 && !error && (
        <div className="px-3 py-8 text-center">
          <Trash2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {term ? 'No matches in the Recycle bin' : 'Recycle bin is empty'}
          </p>
        </div>
      )}
      {shown.map((item) => {
        const key = itemKey(item);
        const isBusy = busyKey === key;
        const isConfirming = confirmKey === key;
        return (
          <div key={key} className={cn('rounded-lg border border-border/50 bg-card/40 px-2.5 py-2', isBusy && 'opacity-60')}>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-background/70">
                {item.kind === 'project' || !item.provider
                  ? <Folder className="h-4 w-4" />
                  : <LLMProviderLogo provider={item.provider} className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-foreground" title={item.title}>{item.title}</p>
                {item.subtitle && (
                  <p className="truncate text-[10px] text-muted-foreground/70" title={item.subtitle}>{item.subtitle}</p>
                )}
                <p className="text-[10px] text-amber-600 dark:text-amber-400">{describeTimeLeft(item.purgeAt)}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  disabled={isBusy}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300"
                  onClick={() => void runAction(item, false)}
                  title="Restore"
                  aria-label={`Restore: ${item.title}`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmKey(isConfirming ? null : key)}
                  title="Delete now"
                  aria-label={`Delete now: ${item.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {isConfirming && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-2 py-1.5">
                <span className="text-[11px] text-destructive">
                  {item.kind === 'project' ? 'Delete this project and its chats forever?' : 'Delete this chat forever?'}
                </span>
                <span className="flex flex-shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={isBusy}
                    className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-700"
                    onClick={() => void runAction(item, true)}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                    onClick={() => setConfirmKey(null)}
                  >
                    Cancel
                  </button>
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
