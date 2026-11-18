'use client';

import clsx from 'clsx';
import { MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

const TRIGGER_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;

function focusableItems(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'));
}

/**
 * Table wrappers scroll horizontally, and `overflow-x: auto` also clips vertically, so an
 * absolutely positioned menu is cut off. Rendering into `body` with fixed positioning escapes it.
 */
function RowActionsPanel({
  triggerRef,
  className,
  onClose,
  children,
}: {
  triggerRef: RefObject<HTMLButtonElement>;
  className?: string;
  onClose: (shouldRestoreFocus: boolean) => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Never painted: the layout effect replaces it before the browser draws the first frame.
  const [position, setPosition] = useState<CSSProperties>({ top: 0, right: 0 });

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const triggerRect = trigger.getBoundingClientRect();
    const panelHeight = panel.offsetHeight;
    const spaceBelow = window.innerHeight - triggerRect.bottom - TRIGGER_GAP_PX - VIEWPORT_MARGIN_PX;
    const spaceAbove = triggerRect.top - TRIGGER_GAP_PX - VIEWPORT_MARGIN_PX;
    const shouldOpenUp = panelHeight > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.max(shouldOpenUp ? spaceAbove : spaceBelow, 0);

    setPosition({
      top: shouldOpenUp
        ? triggerRect.top - TRIGGER_GAP_PX - Math.min(panelHeight, maxHeight)
        : triggerRect.bottom + TRIGGER_GAP_PX,
      right: Math.max(document.documentElement.clientWidth - triggerRect.right, VIEWPORT_MARGIN_PX),
      maxHeight,
    });
    focusableItems(panel)[0]?.focus({ preventScroll: true });
  }, [triggerRef]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose(false);
    }
    // A fixed panel would detach from its row as the page moves, so it closes instead of drifting.
    function handleScroll(event: Event): void {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose(false);
    }
    function handleResize(): void {
      onClose(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [onClose, triggerRef]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onClose(true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    event.preventDefault();
    const items = focusableItems(event.currentTarget);
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(currentIndex + step + items.length) % items.length]?.focus();
  }

  return createPortal(
    <div
      ref={panelRef}
      style={position}
      onClick={() => onClose(false)}
      onKeyDown={handleKeyDown}
      className={clsx(
        'fixed z-40 overflow-y-auto rounded-card border border-surface-border bg-white text-left shadow-overlay [&_a:focus-visible]:bg-brand-tint [&_a:focus-visible]:outline-none [&_button:focus-visible]:bg-brand-tint [&_button:focus-visible]:outline-none',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

export function RowActionsMenu({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const close = useCallback((shouldRestoreFocus: boolean): void => {
    setIsOpen(false);
    if (shouldRestoreFocus) triggerRef.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="rounded-lg p-2 text-ink-muted hover:bg-brand-tint hover:text-brand-navy"
        aria-label={label}
        aria-expanded={isOpen}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {isOpen ? (
        <RowActionsPanel triggerRef={triggerRef} className={className} onClose={close}>
          {children}
        </RowActionsPanel>
      ) : null}
    </>
  );
}
