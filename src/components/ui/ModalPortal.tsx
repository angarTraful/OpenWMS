import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
}

/**
 * ModalPortal teleports modal dialogues directly to document.body.
 * This guarantees:
 * 1. Modals are never trapped inside parent containers with CSS transform/filter/overflow.
 * 2. Fixed positioning (inset-0) is always relative to the true browser viewport.
 * 3. The modal is always perfectly centered on screen, regardless of page scroll or container height.
 * 4. Background scrolling is locked while the modal is open.
 */
export const ModalPortal: React.FC<ModalPortalProps> = ({ children }) => {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  return createPortal(children, document.body);
};
