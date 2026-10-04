import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
  onClose?: () => void;
  isDirty?: boolean;
  confirmOnClose?: boolean;
  confirmMessage?: string;
}

/**
 * ModalPortal teleports modal dialogues directly to document.body.
 * This guarantees:
 * 1. Modals are never trapped inside parent containers with CSS transform/filter/overflow.
 * 2. Fixed positioning (inset-0) is always relative to the true browser viewport.
 * 3. Close on backdrop click (click outside) & Escape key press.
 * 4. Confirmation safety check if form/process has unsaved data (isDirty/confirmOnClose).
 */
export const ModalPortal: React.FC<ModalPortalProps> = ({
  children,
  onClose,
  isDirty = false,
  confirmOnClose = false,
  confirmMessage = '¿Está seguro de cerrar esta ventana? Se perderán los datos o cambios no guardados.',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const attemptClose = () => {
    if (!onClose) return;
    if (isDirty || confirmOnClose) {
      if (window.confirm(confirmMessage)) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        attemptClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, isDirty, confirmOnClose, confirmMessage]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onClose) return;
    const target = e.target as HTMLElement;
    
    // Detect click directly on backdrop (fixed inset-0 element or backdrop class)
    if (
      target === containerRef.current ||
      target.classList.contains('fixed') ||
      target.getAttribute('data-backdrop') === 'true'
    ) {
      attemptClose();
    }
  };

  return createPortal(
    <div ref={containerRef} onClick={handleContainerClick} className="contents">
      {children}
    </div>,
    document.body
  );
};
