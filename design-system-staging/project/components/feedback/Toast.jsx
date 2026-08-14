import React, { useEffect, useState } from 'react';

/** Toast — bottom-anchored transient message. type: success | error | info */
export function Toast({ message, type = 'info', open = true, onDismiss }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(open), 10); return () => clearTimeout(t); }, [open]);
  if (!open) return null;
  const icons = { success: 'check', error: 'x', info: 'info' };
  return (
    <div
      onClick={onDismiss}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 'var(--radius-pill)',
        background: 'var(--color-bg-inverse)', color: 'var(--color-black)', fontSize: 14, boxShadow: 'inset 0 0 0 1px var(--color-border)',
        transform: visible ? 'translateY(0)' : 'translateY(8px)', opacity: visible ? 1 : 0, transition: 'all 200ms ease', cursor: 'pointer',
      }}
    >
      <img src={`https://unpkg.com/lucide-static@latest/icons/${icons[type]}.svg`} alt="" style={{ width: 16, height: 16, filter: 'invert(1)' }} />
      <span>{message}</span>
    </div>
  );
}
