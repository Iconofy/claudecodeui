import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, projectsDb, sessionsDb } from '@/modules/database/index.js';
import { sessionsService } from '@/modules/providers/index.js';
import { deleteOrArchiveProject, listTrashedProjects, restoreArchivedProject } from '@/modules/projects/services/project-delete.service.js';
import { purgeExpiredTrash } from '@/modules/projects/services/trash-purge.service.js';
import { isSlashCommandMessage, RECYCLE_BIN_RETENTION_MS } from '@/shared/utils.js';

async function withIsolatedDatabase(runTest: () => void | Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'recycle-bin-'));
  closeConnection();
  process.env.DATABASE_PATH = path.join(tempDirectory, 'auth.db');
  await initializeDatabase();
  try {
    await runTest();
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

test('a trashed session leaves the active and archive lists, survives a resync, and restores', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createSession('s-trash', 'claude', '/workspace/bin-demo', 'Trash me');
    sessionsDb.createSession('s-archive', 'claude', '/workspace/bin-demo', 'Archive me');
    sessionsDb.updateSessionIsArchived('s-archive', true);

    const result = await sessionsService.deleteOrArchiveSessionById('s-trash', { force: true, trash: true });
    assert.equal(result.action, 'trashed');

    assert.deepEqual(sessionsDb.getArchivedSessions().map((row) => row.session_id), ['s-archive']);
    assert.deepEqual(sessionsService.listTrashedSessions().map((row) => row.sessionId), ['s-trash']);
    assert.ok(!sessionsDb.getAllSessions().some((row) => row.session_id === 's-trash'));

    // A transcript resync with newer activity must not bring a binned row back.
    sessionsDb.createSession('s-trash', 'claude', '/workspace/bin-demo', 'Trash me');
    assert.deepEqual(sessionsService.listTrashedSessions().map((row) => row.sessionId), ['s-trash']);

    sessionsService.restoreSessionById('s-trash');
    assert.deepEqual(sessionsService.listTrashedSessions(), []);
    assert.ok(sessionsDb.getAllSessions().some((row) => row.session_id === 's-trash'));
  });
});

test('force without trash still deletes the session at once', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createSession('s-gone', 'claude', '/workspace/bin-demo', 'Gone');
    const result = await sessionsService.deleteOrArchiveSessionById('s-gone', { force: true });
    assert.equal(result.action, 'deleted');
    assert.equal(sessionsDb.getSessionById('s-gone'), null);
  });
});

test('a trashed project carries its chats and restores with them', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createSession('s-in-project', 'claude', '/workspace/bin-project', 'Inside');
    const project = projectsDb.getProjectPath('/workspace/bin-project');
    assert.ok(project);

    await deleteOrArchiveProject(project.project_id, true, { trash: true });

    const trashed = listTrashedProjects();
    assert.deepEqual(trashed.map((row) => row.projectId), [project.project_id]);
    assert.equal(trashed[0].sessionCount, 1);
    assert.equal(Date.parse(trashed[0].purgeAt) - Date.parse(trashed[0].trashedAt), RECYCLE_BIN_RETENTION_MS);
    assert.deepEqual(projectsDb.getArchivedProjectPaths(), []);
    // The chat travels with the project instead of being listed on its own.
    assert.deepEqual(sessionsService.listTrashedSessions(), []);

    restoreArchivedProject(project.project_id);
    assert.deepEqual(listTrashedProjects(), []);
    assert.ok(sessionsDb.getSessionById('s-in-project'));
  });
});

test('the purge job removes only items older than the retention period', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createSession('s-old', 'claude', '/workspace/purge-a', 'Old');
    sessionsDb.createSession('s-project', 'claude', '/workspace/purge-b', 'In project');
    const project = projectsDb.getProjectPath('/workspace/purge-b');
    assert.ok(project);
    await sessionsService.deleteOrArchiveSessionById('s-old', { force: true, trash: true });
    await deleteOrArchiveProject(project.project_id, true, { trash: true });

    const tomorrow = await purgeExpiredTrash(Date.now() + 24 * 60 * 60 * 1000);
    assert.deepEqual(tomorrow, { projects: 0, sessions: 0 });

    const later = await purgeExpiredTrash(Date.now() + RECYCLE_BIN_RETENTION_MS + 60_000);
    assert.deepEqual(later, { projects: 1, sessions: 1 });
    assert.equal(sessionsDb.getSessionById('s-old'), null);
    assert.equal(sessionsDb.getSessionById('s-project'), null);
    assert.equal(projectsDb.getProjectById(project.project_id), null);
  });
});

test('slash commands are not session titles', () => {
  assert.equal(isSlashCommandMessage('/model'), true);
  assert.equal(isSlashCommandMessage('  /resume opus'), true);
  assert.equal(isSlashCommandMessage('/plugin:install x'), true);
  assert.equal(isSlashCommandMessage('fix /usr/bin path'), false);
  assert.equal(isSlashCommandMessage('/'), false);
  assert.equal(isSlashCommandMessage('Refactor the sidebar'), false);
});
