import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';

import type { ProviderModelOption } from '@/shared/types';
import { DEFAULT_EFFORT_VALUE } from '@/shared/constants';
import { isAccountModelCopy, joinAccountModel, listModelAccounts, splitAccountModel } from '@/shared/utils';
import { useComposerMenuAnchor } from '@/modules/chat/hooks/useComposerMenuAnchor';
import { useUltracodeToggle } from '@/modules/chat/hooks/useUltracodeToggle';
import { MODEL_ROW_ATTRIBUTE, useModelOrderDrag } from '@/modules/chat/composer/useModelOrderDrag';
import {
  ComposerMenuHeading,
  ComposerMenuItem,
  ComposerMenuSeparator,
  ComposerMenuSurface,
} from '@/modules/chat/composer/ComposerMenuPrimitives';

type EffortOption = NonNullable<ProviderModelOption['effort']>['values'][number];

type ComposerModelMenuProps = {
  effort: string;
  /** Effort values the active provider/model actually accepts; empty hides the section. */
  effortOptions: EffortOption[];
  onSelectEffort: (effort: string) => void;
  model: string;
  /** Model catalog for the active provider; empty hides the section. */
  modelOptions: ProviderModelOption[];
  onSelectModel: (model: string) => void;
  /** Saves a new order of the model list; without it the rows have no drag grip. */
  onReorderModels?: (order: string[]) => Promise<void>;
  modelsLoading: boolean;
};

/**
 * Rendered by chat's ChatComposer as the popover for choosing the active
 * provider's model and reasoning effort for the next turn.
 */
function ComposerModelMenu({
  effort,
  effortOptions,
  onSelectEffort,
  model,
  modelOptions,
  onSelectModel,
  onReorderModels,
  modelsLoading,
}: ComposerModelMenuProps) {
  const { t } = useTranslation('chat');
  const [isOpen, setIsOpen] = useState(false);
  const [isReasoningOpen, setIsReasoningOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  const { triggerRef, menuRef, anchor, updateAnchor } = useComposerMenuAnchor(isOpen, close);

  // The model list is what people change most, so it is open right away; the
  // reasoning levels start collapsed every time the menu opens.
  useEffect(() => {
    if (!isOpen) {
      setIsReasoningOpen(false);
    }
  }, [isOpen]);

  const defaultEffortLabel = t('composer.effortDefault', { defaultValue: 'Default' });
  const resolvedEffortOptions = useMemo<EffortOption[]>(
    () => (effortOptions.length > 0 ? [{ value: DEFAULT_EFFORT_VALUE }, ...effortOptions] : []),
    [effortOptions],
  );
  const effortLabel = effort === DEFAULT_EFFORT_VALUE ? defaultEffortLabel : effort;

  const selectedModelOption = useMemo(
    () => modelOptions.find((option) => option.value === model) ?? null,
    [model, modelOptions],
  );
  // Extra Claude accounts arrive as "<account>:<model>" copies: list the plain
  // models, and the accounts as their own section.
  const plainModelOptions = useMemo(() => modelOptions.filter((option) => !isAccountModelCopy(option)), [modelOptions]);
  const accounts = useMemo(() => listModelAccounts(modelOptions), [modelOptions]);
  const plainModelValues = useMemo(() => plainModelOptions.map((option) => option.value), [plainModelOptions]);
  const { order: modelOrder, draggingValue, gripProps } = useModelOrderDrag(plainModelValues, onReorderModels);
  const orderedModelOptions = useMemo(
    () => modelOrder
      .map((value) => plainModelOptions.find((option) => option.value === value))
      .filter((option): option is ProviderModelOption => Boolean(option)),
    [modelOrder, plainModelOptions],
  );
  const { accountId, model: plainModel } = splitAccountModel(model, modelOptions);
  const plainModelOption = plainModelOptions.find((option) => option.value === plainModel) ?? null;
  const accountLabel = accounts.find((account) => account.id === accountId)?.label ?? '';
  const modelLabel = (plainModelOption?.label || plainModel) + (accountLabel ? ` · ${accountLabel}` : '');
  const [isUltracodeOn, setUltracodeOn] = useUltracodeToggle();
  const offersUltracode = Boolean(selectedModelOption?.ultracode);

  const hasEffortSection = resolvedEffortOptions.length > 0;
  const hasModelSection = modelOptions.length > 0 || modelsLoading;
  if (!hasEffortSection && !hasModelSection) {
    return null;
  }

  const triggerLabel = hasModelSection ? modelLabel : effortLabel;
  const ariaLabel = t('composer.modelMenu', {
    defaultValue: 'Select model and reasoning effort',
  });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          updateAnchor();
          setIsOpen((current) => !current);
        }}
        className="flex h-8 max-w-20 shrink-0 items-center gap-1 rounded-lg border border-border/60 bg-muted/40 px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted sm:max-w-56"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        <span className="truncate">{triggerLabel}</span>
        {hasModelSection && hasEffortSection && effort !== DEFAULT_EFFORT_VALUE && (
          <span className="hidden shrink-0 capitalize text-muted-foreground sm:inline">· {effortLabel}</span>
        )}
        {hasModelSection && offersUltracode && isUltracodeOn && (
          <span className="hidden shrink-0 text-muted-foreground sm:inline">· Ultracode</span>
        )}
      </button>

      {isOpen && anchor && createPortal(
        <ComposerMenuSurface anchor={anchor} menuRef={menuRef} ariaLabel={ariaLabel}>
          {hasModelSection && (
            <>
              <ComposerMenuHeading>
                {t('composer.model', { defaultValue: 'Model' })}
              </ComposerMenuHeading>
              {plainModelOptions.length === 0 && modelsLoading && (
                <p className="px-2.5 py-1.5 text-sm text-muted-foreground">
                  {t('composer.loadingModels', { defaultValue: 'Loading models…' })}
                </p>
              )}
              {orderedModelOptions.map((option) => (
                <div
                  key={option.value}
                  {...{ [MODEL_ROW_ATTRIBUTE]: option.value }}
                  className={`flex items-center${draggingValue === option.value ? ' opacity-60' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <ComposerMenuItem
                      label={option.label || option.value}
                      isSelected={option.value === plainModel}
                      onSelect={() => {
                        onSelectModel(joinAccountModel(accountId, option.value));
                        setIsOpen(false);
                      }}
                    />
                  </div>
                  {onReorderModels && (
                    // On the right: on a phone the menu can reach past the left screen edge.
                    <span
                      role="button"
                      aria-label={`Drag ${option.label || option.value} to reorder`}
                      title="Drag to reorder"
                      className="flex h-7 w-7 shrink-0 cursor-grab touch-none select-none items-center justify-center text-muted-foreground"
                      {...gripProps(option.value)}
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              ))}
            </>
          )}

          {accounts.length > 0 && (
            <>
              {hasModelSection && <ComposerMenuSeparator />}
              <ComposerMenuHeading>Account</ComposerMenuHeading>
              {[{ id: '', label: 'Default login' }, ...accounts].map((account) => (
                <ComposerMenuItem
                  key={account.id || 'default'}
                  label={account.label}
                  isSelected={account.id === accountId}
                  onSelect={() => {
                    onSelectModel(joinAccountModel(account.id, plainModel));
                    setIsOpen(false);
                  }}
                />
              ))}
            </>
          )}

          {hasEffortSection && (
            <>
              {(hasModelSection || accounts.length > 0) && <ComposerMenuSeparator />}
              {hasModelSection ? (
                <ComposerMenuItem
                  role="menuitem"
                  label={`${t('composer.reasoning', { defaultValue: 'Reasoning' })}: ${effortLabel}${offersUltracode && isUltracodeOn ? ' · Ultracode' : ''}`}
                  isSelected={false}
                  onSelect={() => setIsReasoningOpen((current) => !current)}
                  trailing={
                    isReasoningOpen
                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  }
                  className="capitalize text-muted-foreground"
                />
              ) : (
                <ComposerMenuHeading>
                  {t('composer.reasoning', { defaultValue: 'Reasoning' })}
                </ComposerMenuHeading>
              )}

              {(isReasoningOpen || !hasModelSection) && (
                <>
                  {resolvedEffortOptions.map((option) => (
                    <ComposerMenuItem
                      key={option.value}
                      label={option.value === DEFAULT_EFFORT_VALUE ? defaultEffortLabel : option.value}
                      description={option.description}
                      isSelected={option.value === effort}
                      onSelect={() => {
                        onSelectEffort(option.value);
                        setIsOpen(false);
                      }}
                      className="capitalize"
                    />
                  ))}
                  {offersUltracode && (
                    // Stays open on click: it is a switch, not a choice that ends the menu.
                    <ComposerMenuItem
                      label="Ultracode"
                      description="Workflow orchestration at any effort level"
                      isSelected={isUltracodeOn}
                      onSelect={() => setUltracodeOn(!isUltracodeOn)}
                    />
                  )}
                </>
              )}
            </>
          )}
        </ComposerMenuSurface>,
        document.body,
      )}
    </>
  );
}

/** Memoized: the composer re-renders on every keystroke and none of this menu's props change while typing. */
export default memo(ComposerModelMenu);
