"use client";

import { useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ className = "", ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`password-input-shell${className ? ` ${className}` : ""}`}>
      <input {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        title={visible ? "Ocultar senha" : "Mostrar senha"}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.3A10.8 10.8 0 0112 4c5.4 0 9 5.5 9 5.5a15.8 15.8 0 01-2.4 2.8M6.2 6.2A16.1 16.1 0 003 9.5S6.6 15 12 15c1 0 2-.2 2.9-.5" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5S6.6 4 12 4s9 5.5 9 5.5S17.4 15 12 15 3 9.5 3 9.5z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
        )}
      </button>
    </div>
  );
}
