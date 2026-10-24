import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
  onClose?: () => void;
  isDirty?: boolean;
  confirmOnClose?: boolean;
  confirmMessage?: string;
}

/**
 * Global stack of active modal IDs to support nesting and reference counting.
 * Solves:
 * 1. Nested/sequential modals capturing 'overflow: hidden' as originalOverflow and locking body scroll forever.
 * 2. Rapid modal opening/closing causing race conditions in cleanup.
 * 3. Inline onClose arrow functions re-running the scroll lock effect on every parent render.
 * 4. Escape key closing all open modals simultaneously.
 * 5. Self-healing DOM check ensuring body/html overflow is NEVER stuck when 0 modals are mounted.
 */
const activeModalStack: string[] = [];
let originalBodyOverflow: string | null = null;
let originalHtmlOverflow: string | null = null;

function lockScroll(id: string) {
  if (typeof document === 'undefined') return;

  // On first modal, snapshot initial styles before modifying
  if (activeModalStack.length === 0) {
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;

    // Never save 'hidden' as initial overflow if it was leaked previously
    originalBodyOverflow = bodyOverflow && bodyOverflow !== 'hidden' ? bodyOverflow : '';
    originalHtmlOverflow = htmlOverflow && htmlOverflow !== 'hidden' ? htmlOverflow : '';

    document.body.style.overflow = 'hidden';
  }

  // Add to top of stack if not already present
  const index = activeModalStack.indexOf(id);
  if (index !== -1) {
    activeModalStack.splice(index, 1);
  }
  activeModalStack.push(id);
}

function unlockScroll(id: string) {
  if (typeof document === 'undefined') return;

  const index = activeModalStack.indexOf(id);
  if (index !== -1) {
    activeModalStack.splice(index, 1);
  }

  // If no modals left in stack, restore styles or remove inline property
  if (activeModalStack.length === 0) {
    if (originalBodyOverflow) {
      document.body.style.overflow = originalBodyOverflow;
    } else {
      document.body.style.removeProperty('overflow');
    }

    if (originalHtmlOverflow) {
      document.documentElement.style.overflow = originalHtmlOverflow;
    } else {
      document.documentElement.style.removeProperty('overflow');
    }

    originalBodyOverflow = null;
    originalHtmlOverflow = null;
  }

  // Self-healing check: after DOM updates, verify if any modal portal container really exists
  setTimeout(() => {
    if (typeof document === 'undefined') return;
    const portalsInDom = document.querySelectorAll('[data-modal-portal="true"]');
    if (portalsInDom.length === 0) {
      activeModalStack.length = 0;
      document.body.style.removeProperty('overflow');
      document.documentElement.style.removeProperty('overflow');
      originalBodyOverflow = null;
      originalHtmlOverflow = null;
    }
  }, 0);
}

/**
 * Public failsafe utility to clean up any stuck scroll locks when no modals are in the DOM.
 */
export function resetGlobalScrollLockIfNoModals() {
  if (typeof document === 'undefined') return;
  const portalsInDom = document.querySelectorAll('[data-modal-portal="true"]');
  if (portalsInDom.length === 0) {
    activeModalStack.length = 0;
    document.body.style.removeProperty('overflow');
    document.documentElement.style.removeProperty('overflow');
    originalBodyOverflow = null;
    originalHtmlOverflow = null;
  }
}

/**
 * ModalPortal teleports modal dialogues directly to document.body.
 * Guarantees:
 * 1. Modals are never trapped inside parent containers with CSS transform/filter/overflow.
 * 2. Fixed positioning (inset-0) is always relative to the true browser viewport.
 * 3. Close on backdrop click (click outside) & Escape key press (topmost modal only).
 * 4. Confirmation safety check if form/process has unsaved data (isDirty/confirmOnClose).
 * 5. Robust modal stacking & scrollbar lock reference counting with self-healing cleanup.
 */
export const ModalPortal: React.FC<ModalPortalProps> = ({
  children,
  onClose,
  isDirty = false,
  confirmOnClose = false,
  confirmMessage = '¿Está seguro de cerrar esta ventana? Se perderán los datos o cambios no guardados.',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string>('');

  if (!idRef.current) {
    idRef.current = 'modal_' + Math.random().toString(36).slice(2, 10);
  }

  // Keep references to latest callbacks and flags so effects don't constantly re-run
  const propsRef = useRef({ onClose, isDirty, confirmOnClose, confirmMessage });
  propsRef.current = { onClose, isDirty, confirmOnClose, confirmMessage };

  const attemptClose = useCallback(() => {
    const current = propsRef.current;
    if (!current.onClose) return;

    if (current.isDirty || current.confirmOnClose) {
      if (window.confirm(current.confirmMessage)) {
        current.onClose();
      }
    } else {
      current.onClose();
    }
  }, []);

  // Scroll lock effect: runs ONLY on mount and unmount (empty dependency array)
  useEffect(() => {
    const modalId = idRef.current;
    lockScroll(modalId);

    return () => {
      unlockScroll(modalId);
    };
  }, []);

  // Keyboard handler: only the topmost modal responds to Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const isTopmost = activeModalStack[activeModalStack.length - 1] === idRef.current;
        if (isTopmost && propsRef.current.onClose) {
          e.stopPropagation();
          attemptClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [attemptClose]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!propsRef.current.onClose) return;
    const target = e.target as HTMLElement;

    // Detect click directly on backdrop (fixed inset-0 element or backdrop class/data attribute)
    if (
      target === containerRef.current ||
      target.classList.contains('fixed') ||
      target.getAttribute('data-backdrop') === 'true'
    ) {
      attemptClose();
    }
  };

  return createPortal(
    <div
      ref={containerRef}
      data-modal-portal="true"
      onClick={handleContainerClick}
      className="contents"
    >
      {children}
    </div>,
    document.body
  );
};

