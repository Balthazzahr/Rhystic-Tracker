import { useEffect, useRef } from 'react';

export interface ModalStackEntry {
  id: string;
  close: () => void;
  priority: number;
  timestamp: number;
}

class ModalStackManager {
  private stack: ModalStackEntry[] = [];
  private isListening = false;

  public register(id: string, close: () => void, priority: number = 10) {
    // Remove existing entry with the same ID if any
    this.stack = this.stack.filter((entry) => entry.id !== id);
    this.stack.push({
      id,
      close,
      priority,
      timestamp: Date.now() + performance.now(),
    });
    this.ensureListener();
  }

  public unregister(id: string) {
    this.stack = this.stack.filter((entry) => entry.id !== id);
    if (this.stack.length === 0) {
      this.removeListener();
    }
  }

  private ensureListener() {
    if (this.isListening) return;
    // Capture phase listener so Escape is intercepted before any other listener
    window.addEventListener('keydown', this.handleKeyDown, true);
    this.isListening = true;
  }

  private removeListener() {
    if (!this.isListening) return;
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.isListening = false;
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || this.stack.length === 0) return;

    // Find the topmost modal: highest priority, tie-broken by newest timestamp
    let topIndex = 0;
    for (let i = 1; i < this.stack.length; i++) {
      const cur = this.stack[i];
      const best = this.stack[topIndex];
      if (
        cur.priority > best.priority ||
        (cur.priority === best.priority && cur.timestamp >= best.timestamp)
      ) {
        topIndex = i;
      }
    }

    const topmost = this.stack[topIndex];
    if (topmost && typeof topmost.close === 'function') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      topmost.close();
    }
  };
}

export const modalStack = new ModalStackManager();

/**
 * Hook to automatically register a modal in the global Escape-key stack when open.
 * When Escape is pressed, only the topmost active modal receives the close signal.
 *
 * @param isOpen Whether the modal is currently active/open
 * @param onClose Callback to close the modal
 * @param priority Higher priority indicates a modal stacked visually on top of others
 */
export function useModalEscape(
  isOpen: boolean,
  onClose: () => void,
  priority: number = 10
) {
  const idRef = useRef<string>('');
  if (!idRef.current) {
    idRef.current = 'modal_' + Math.random().toString(36).substring(2, 9);
  }

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const id = idRef.current;
    modalStack.register(id, () => closeRef.current(), priority);
    return () => {
      modalStack.unregister(id);
    };
  }, [isOpen, priority]);
}
