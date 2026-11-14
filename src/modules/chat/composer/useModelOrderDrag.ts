import { useCallback, useRef, useState, type PointerEvent } from 'react';

/**
 * Moves `value` to the place `target` has in `order`, the way a dragged row takes the place
 * of the row under the pointer. Returns `order` itself when nothing would change.
 */
export function moveModelBefore(order: string[], value: string, target: string): string[] {
  const to = order.indexOf(target);
  if (value === target || to === -1 || !order.includes(value)) {
    return order;
  }

  const next = order.filter((entry) => entry !== value);
  next.splice(to, 0, value);
  return next;
}

type DragState = { value: string; order: string[]; moved: boolean };

/** Attribute that marks a draggable row; its value is the row's model value. */
export const MODEL_ROW_ATTRIBUTE = 'data-model-row';

/**
 * Drag-to-reorder for the composer's model list. Only the grip handles pointer events, so the
 * same code works with a mouse and on a touch screen, and a tap on the row still selects the
 * model. While dragging, `order` is the draft; on release the draft goes to `onCommit` and the
 * list falls back to `values` (the server's new order, or the old one if saving failed).
 */
export function useModelOrderDrag(values: string[], onCommit?: (order: string[]) => Promise<void>) {
  const [draft, setDraft] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const finish = useCallback((cancelled: boolean) => {
    const current = dragRef.current;
    dragRef.current = null;
    if (!current) {
      return;
    }
    if (cancelled || !current.moved || !onCommit) {
      setDraft(null);
      return;
    }
    onCommit(current.order)
      .catch((error: unknown) => console.error('Unable to save the model order:', error))
      .finally(() => setDraft(null));
  }, [onCommit]);

  const gripProps = useCallback((value: string) => ({
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a convenience; moves over the rows still arrive without it.
      }
      dragRef.current = { value, order: values, moved: false };
      setDraft(dragRef.current);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const current = dragRef.current;
      if (!current) {
        return;
      }
      const target = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest(`[${MODEL_ROW_ATTRIBUTE}]`)
        ?.getAttribute(MODEL_ROW_ATTRIBUTE);
      if (!target) {
        return;
      }
      const order = moveModelBefore(current.order, current.value, target);
      if (order !== current.order) {
        dragRef.current = { ...current, order, moved: true };
        setDraft(dragRef.current);
      }
    },
    onPointerUp: () => finish(false),
    onPointerCancel: () => finish(true),
  }), [finish, values]);

  return {
    order: draft?.order ?? values,
    draggingValue: draft?.value ?? null,
    gripProps,
  };
}
