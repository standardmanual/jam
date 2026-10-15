import React from 'react';
import { Button } from '../buttons/Button.jsx';

/* Default icon — generic empty box */
const DefaultIcon = () => (
  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={1.5}
    strokeLinecap="round" strokeLinejoin="round" width={48} height={48} aria-hidden="true">
    <rect x="8" y="16" width="32" height="24" rx="3" />
    <path d="M8 22h32" />
    <path d="M19 22v-6a5 5 0 0 1 10 0v6" />
    <circle cx="24" cy="32" r="2" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * EmptyState — zero-content placeholder for lists, search results, errors, and onboarding.
 *
 * All props are optional — render just title for a minimal state; add description,
 * icon, and action progressively. role="status" announces dynamic content changes
 * to screen readers; omit via rest spread override for purely static contexts.
 *
 * action: { label: string, onClick: () => void }
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
  style = {},
  ...rest
}) {
  const showIcon = icon !== null; /* null explicitly hides icon; undefined shows default */
  const resolvedIcon = icon ?? <DefaultIcon />;

  return (
    <div
      role="status"
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--layout-element-gap)',
        padding: 'var(--layout-section-gap) var(--layout-card-padding)',
        textAlign: 'center',
        ...style,
      }}
      {...rest}
    >
      {showIcon && (
        <div style={{
          color: 'var(--muted)',
          opacity: 0.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {resolvedIcon}
        </div>
      )}

      {(title || description) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
          {title && (
            <p style={{
              margin: 0,
              fontSize: 'var(--text-2xl)',
              fontWeight: 500,
              lineHeight: 'var(--text-2xl--line-height)',
              color: 'var(--foreground)',
            }}>
              {title}
            </p>
          )}
          {description && (
            <p style={{
              margin: 0,
              fontSize: 'var(--text-base)',
              lineHeight: 'var(--text-base--line-height)',
              color: 'var(--muted)',
            }}>
              {description}
            </p>
          )}
        </div>
      )}

      {action && (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
