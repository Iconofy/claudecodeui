import { createContext, useContext } from 'react';
import type { ComponentProps } from 'react';

import type ComposerModelMenu from '@/modules/chat/composer/ComposerModelMenu';
import type { PendingPermissionRequest, PermissionMode } from '@/shared/types';

export type PermissionContextValue = {
  pendingPermissionRequests: PendingPermissionRequest[];
  handlePermissionDecision: (
    requestIds: string | string[],
    decision: { allow?: boolean; message?: string; rememberEntry?: string | null; updatedInput?: unknown; permissionMode?: PermissionMode; model?: string },
  ) => void;
  /** The composer's permission-mode setter, so the plan card can switch later messages to bypass. */
  selectPermissionMode?: (mode: PermissionMode) => void;
  /** The composer's model menu props, so the plan card can show the same menu and send the picked model with Build. */
  planModelMenu?: ComponentProps<typeof ComposerModelMenu>;
  /** Focuses the composer: a message sent while a plan waits is the revise text. */
  focusComposer?: () => void;
};

/** A plan (ExitPlanMode) waiting for Build or a revise. */
export const isPlanPermissionRequest = (request: Pick<PendingPermissionRequest, 'toolName'>): boolean =>
  request.toolName === 'ExitPlanMode' || request.toolName === 'exit_plan_mode';

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function usePermission(): PermissionContextValue | null {
  return useContext(PermissionContext);
}

export default PermissionContext;
