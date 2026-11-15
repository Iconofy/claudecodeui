import React from 'react';
import { ChevronsUpDown, FileText } from 'lucide-react';

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Button,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Shimmer,
} from '@/shared/ui';
import ComposerModelMenu from '@/modules/chat/composer/ComposerModelMenu';
import { isPlanPermissionRequest, usePermission } from '@/modules/chat/context/PermissionContext';
import { MarkdownContent } from '@/modules/chat/tools/ContentRenderers/MarkdownContent';

type PlanDisplayProps = {
  title: string;
  content: string;
  defaultOpen?: boolean;
  isStreaming?: boolean;
  showRawParameters?: boolean;
  rawContent?: string;
  toolName: string;
  toolId?: string;
};

/**
 * Rendered by chat's ToolRenderer for plan tools (ExitPlanMode), showing the
 * proposed plan inline together with its build decision, the model to build with, and a
 * shortcut to the composer (a message sent while the plan waits revises it).
 */
export const PlanDisplay: React.FC<PlanDisplayProps> = ({
  title,
  content,
  defaultOpen = false,
  isStreaming = false,
  showRawParameters = false,
  rawContent,
  toolName: _toolName,
}) => {
  const permissionCtx = usePermission();

  const pendingRequest = permissionCtx?.pendingPermissionRequests.find(isPlanPermissionRequest);

  const handleBuild = () => {
    if (pendingRequest && permissionCtx) {
      permissionCtx.handlePermissionDecision(pendingRequest.requestId, {
        allow: true,
        model: permissionCtx.planModelMenu?.model,
      });
    }
  };

  // Approves the plan and switches to bypass mode: the composer (later messages) and,
  // through the approval, the run that is executing now.
  const handleBuildWithBypass = () => {
    if (pendingRequest && permissionCtx) {
      permissionCtx.selectPermissionMode?.('bypassPermissions');
      permissionCtx.handlePermissionDecision(pendingRequest.requestId, {
        allow: true,
        permissionMode: 'bypassPermissions',
        model: permissionCtx.planModelMenu?.model,
      });
    }
  };

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <Card className="my-1 flex flex-col shadow-none">
        {/* Header — always visible */}
        <CardHeader className="flex flex-row items-start justify-between space-y-0 px-4 pb-0 pt-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              {isStreaming ? <Shimmer>{title}</Shimmer> : title}
            </CardTitle>
          </div>
          <CollapsibleTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
            <ChevronsUpDown className="h-4 w-4" />
            <span className="sr-only">Toggle plan</span>
          </CollapsibleTrigger>
        </CardHeader>

        {/* Collapsible content */}
        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-3">
            {content ? (
              <MarkdownContent
                content={content}
                className="prose prose-sm max-w-none dark:prose-invert"
              />
            ) : isStreaming ? (
              <div className="py-2">
                <Shimmer>Generating plan...</Shimmer>
              </div>
            ) : null}

            {showRawParameters && rawContent && (
              <Collapsible className="mt-3">
                <CollapsibleTrigger className="flex items-center gap-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
                  <svg
                    className="h-2.5 w-2.5 flex-shrink-0 transition-transform duration-150 data-[state=open]:rotate-90"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  raw params
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-1 overflow-hidden whitespace-pre-wrap break-words rounded border border-border/40 bg-muted p-2 font-mono text-[11px] text-muted-foreground">
                    {rawContent}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </CollapsibleContent>

        {/* Footer — always visible when permission is pending */}
        {pendingRequest && (
          <CardFooter className="flex-wrap justify-end gap-2 border-t border-border/40 px-4 pb-3 pt-3">
            {/* The model that builds the plan: Build sends it, the server switches the running turn. */}
            {permissionCtx?.planModelMenu && <ComposerModelMenu {...permissionCtx.planModelMenu} />}
            {/* A message sent from the composer while the plan waits is the revise text. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => permissionCtx?.focusComposer?.()}
              className="text-muted-foreground"
            >
              Change plan…
            </Button>
            <Button variant="outline" size="sm" onClick={handleBuildWithBypass}>
              Build &amp; bypass mode
            </Button>
            <Button size="sm" onClick={handleBuild}>
              Build{' '}
              <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 py-0.5 font-mono text-[10px]">
                ⌘↩
              </kbd>
            </Button>
          </CardFooter>
        )}
      </Card>
    </Collapsible>
  );
};
