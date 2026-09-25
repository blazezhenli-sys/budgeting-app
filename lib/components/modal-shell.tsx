"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

type Props = {
  title: string;
  subtitle?: string;
  size?: "medium" | "large";
  onClose: () => void;
  children: ReactNode;
};

export function ModalShell({ title, subtitle, size = "medium", onClose, children }: Props) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`modal-shell modal-shell--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-shell__header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <button type="button" className="secondary" onClick={onClose} aria-label={`Close ${title}`}>
            Close
          </button>
        </div>
        <div className="modal-shell__body">{children}</div>
      </div>
    </div>
  );
}
