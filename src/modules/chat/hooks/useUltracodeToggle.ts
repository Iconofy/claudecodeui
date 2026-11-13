import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'claude-ultracode';
const CHANGE_EVENT = 'ultracode-toggle-change';

/** The stored Ultracode choice; read at send time by the composer. */
export function readUltracodeToggle(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeUltracodeToggle(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Storage blocked (private mode): the choice lasts until reload.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * Used by the composer's model menu: the Ultracode on/off switch. The Claude CLI
 * runs Ultracode at any effort level, so it is a toggle next to the Reasoning
 * levels rather than one of them. Shared by every open tab through localStorage.
 */
export function useUltracodeToggle(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, readUltracodeToggle, () => false);
  return [enabled, writeUltracodeToggle];
}
