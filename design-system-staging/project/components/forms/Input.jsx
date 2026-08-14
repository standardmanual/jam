import React from 'react';

/** Input — text field, subtle grey border, moderate 8px radius (kept subdued next to the fully-pill buttons). */
export function Input({ placeholder = '', value, onChange, type = 'text' }) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      style={{
        width: '100%', height: 44, borderRadius: 'var(--radius-input)', border: '1px solid var(--color-border)',
        padding: '0 20px', fontSize: 16, fontFamily: 'var(--font-family-base)', color: 'var(--color-text)', background: 'var(--color-white)', boxSizing: 'border-box',
      }}
    />
  );
}
