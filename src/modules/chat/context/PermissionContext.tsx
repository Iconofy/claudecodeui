import { createContext, useContext } from 'react';

import type { PendingPermissionRequest, PermissionMode } from '@/shared/types';

export type PermissionContextValue = {
  pendingPermissionRequests: PendingPermissionRequest[];
  handlePermissionDecision: (
    requestIds: string | string[],
    decision: { allow?: boolean; message?: string; rememberEntry?: string | null; updatedInput?: unknown; permissionMode?: PermissionMode },
  ) => void;
  /** The composer's permission-mode setter, so the plan card can switch later messages to bypass. */
  selectPermissionMode?: (mode: PermissionMode) => void;
};

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function usePermission(): PermissionContextValue | null {
  return useContext(PermissionContext);
}

export default PermissionContext;
