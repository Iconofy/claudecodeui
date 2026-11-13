import { promises as fs } from 'node:fs';
import path from 'node:path';

import { projectsDb, sessionsDb } from '@/modules/database/index.js';
import { AppError, RECYCLE_BIN_RETENTION_MS } from '@/shared/utils.js';

function uniqueJsonlPathsFromSessions(
  sessions: Array<{ jsonl_path: string | null }>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const row of sessions) {
    const raw = row.jsonl_path?.trim();
    if (!raw) {
      continue;
    }
    const absolute = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(raw);
    if (seen.has(absolute)) {
      continue;
    }
    seen.add(absolute);
    result.push(absolute);
  }

  return result;
}

async function unlinkJsonlIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return;
    }
    console.warn(`[project-delete] Failed to remove ${filePath}:`, (error as Error).message);
  }
}

/**
 * Loads all session rows for the project path and removes each distinct `jsonl_path` file on disk.
 */
export async function deleteSessionJsonlFilesForProjectPath(projectPath: string): Promise<void> {
  const sessions = sessionsDb.getSessionsByProjectPathIncludingArchived(projectPath);
  // Including the transcripts a session has left behind: editing a message on
  // a provider that rewinds by branching moves the session onto a copy, and
  // the row stops pointing at the file the replaced turns are still in.
  const paths = uniqueJsonlPathsFromSessions([
    ...sessions,
    ...sessions.flatMap((session) => sessionsDb
      .getSupersededTranscriptPaths(session.session_id)
      .map((jsonl_path) => ({ jsonl_path }))),
  ]);

  for (const filePath of paths) {
    await unlinkJsonlIfExists(filePath);
  }

  for (const session of sessions) {
    sessionsDb.clearSupersededProviderSessions(session.session_id);
  }
}

/**
 * - **Soft delete** (`force` false): set `isArchived` on the `projects` row (hide from the active list; DB only).
 * - **Force** (`force` true): for each session row for that `project_path`, delete the file at `jsonl_path`
 *   (when set), then remove session rows and the `projects` row.
 * - **Trash** (`force` and `options.trash`): move the project (and with it its chats) to the Recycle bin;
 *   nothing is removed until the bin is emptied or the purge job expires it.
 */
export async function deleteOrArchiveProject(
  projectId: string,
  force: boolean,
  options: { trash?: boolean } = {},
): Promise<void> {
  const row = projectsDb.getProjectById(projectId);
  if (!row) {
    throw new AppError(`Unknown projectId: ${projectId}`, {
      code: 'PROJECT_NOT_FOUND',
      statusCode: 404,
    });
  }

  if (!force) {
    projectsDb.updateProjectIsArchivedById(projectId, true);
    return;
  }

  if (options.trash) {
    projectsDb.trashProjectById(projectId);
    return;
  }

  await deleteSessionJsonlFilesForProjectPath(row.project_path);
  sessionsDb.deleteSessionsByProjectPath(row.project_path);
  projectsDb.deleteProjectById(projectId);
}

/**
 * Restores one archived project row back into the active project list.
 */
export function restoreArchivedProject(projectId: string): void {
  const row = projectsDb.getProjectById(projectId);
  if (!row) {
    throw new AppError(`Unknown projectId: ${projectId}`, {
      code: 'PROJECT_NOT_FOUND',
      statusCode: 404,
    });
  }

  projectsDb.updateProjectIsArchivedById(projectId, false);
}

/**
 * Recycle bin projects with their chat count and the day the purge job removes them.
 * Used by the Projects routes for the sidebar's Recycle bin tab.
 */
export function listTrashedProjects() {
  return projectsDb.getTrashedProjects().map((row) => ({
    projectId: row.project_id,
    displayName: row.custom_project_name?.trim() || path.basename(row.project_path) || row.project_path,
    fullPath: row.project_path,
    sessionCount: sessionsDb.getSessionsByProjectPathIncludingArchived(row.project_path).length,
    trashedAt: row.trashedAt,
    purgeAt: new Date(Date.parse(row.trashedAt) + RECYCLE_BIN_RETENTION_MS).toISOString(),
  }));
}
