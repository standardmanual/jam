import React from 'react';

/** ModalToast — centered modal variant of Toast (backdrop + centered card), for emphasis moments (badge earned, mission complete) vs the bottom-anchored Toast for passive status. */
export function ModalToast({ message, type = 'success', open = true, onDismiss }) {
  if (!open) return null;
  const icons = { success: 'check', error: 'x', info: 'info' };
  return (
    <div
      onClick={onDismiss}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: 240, textAlign: 'center' }}
      >
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={`https://unpkg.com/lucide-static@latest/icons/${icons[type]}.svg`} alt="" style={{ width: 26, height: 26 }} />
        </div>
        <p style={{ margin: 0, fontSize: 16, color: 'var(--color-text)' }}>{message}</p>
      </div>
    </div>
  );
}
