import { projectsDb, sessionsDb } from '@/modules/database/index.js';
import { sessionsService } from '@/modules/providers/index.js';
import { deleteOrArchiveProject } from '@/modules/projects/services/project-delete.service.js';
import { RECYCLE_BIN_RETENTION_MS } from '@/shared/utils.js';

const POLL_INTERVAL_MS = 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Permanently removes every project and session that has been in the Recycle
 * bin for longer than the retention period. One failing item does not stop the
 * rest. Overlapping calls are skipped. Exported for the tests.
 */
export async function purgeExpiredTrash(now = Date.now()): Promise<{ projects: number; sessions: number }> {
  const purged = { projects: 0, sessions: 0 };
  if (running) {
    return purged;
  }
  running = true;
  try {
    const cutoff = new Date(now - RECYCLE_BIN_RETENTION_MS).toISOString();
    for (const projectId of projectsDb.getTrashedProjectIdsBefore(cutoff)) {
      try {
        await deleteOrArchiveProject(projectId, true);
        purged.projects += 1;
      } catch (error) {
        console.warn(`[trash] Could not purge project ${projectId}:`, (error as Error).message);
      }
    }
    for (const sessionId of sessionsDb.getTrashedSessionIdsBefore(cutoff)) {
      try {
        await sessionsService.deleteOrArchiveSessionById(sessionId, { force: true, deletedFromDisk: true });
        purged.sessions += 1;
      } catch (error) {
        console.warn(`[trash] Could not purge session ${sessionId}:`, (error as Error).message);
      }
    }
  } finally {
    running = false;
  }
  if (purged.projects || purged.sessions) {
    console.log(`[trash] Purged ${purged.projects} project(s) and ${purged.sessions} session(s) from the Recycle bin`);
  }
  return purged;
}

/** Used by the server entrypoint: purges once at startup, then every hour. */
export function initializeTrashPurge(): void {
  if (timer) {
    return;
  }
  const tick = () => {
    purgeExpiredTrash().catch((error) => console.warn('[trash] Purge failed:', (error as Error).message));
  };
  timer = setInterval(tick, POLL_INTERVAL_MS);
  timer.unref?.();
  tick();
}

/** Used by the server entrypoint on shutdown. */
export function closeTrashPurge(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
