function BadgesScreen({ onBack, onOpenDetail }) {
  const { TopNav, Card, RarityBadge } = window.JAMShopifyDesignSystem_f8de83;
  const { badges } = window.mockData;
  return (
    <div style={{ minHeight: '100%', background: 'var(--color-bg)' }}>
      <TopNav title="배지" onBack={onBack} />
      <div style={{ padding: '16px 16px 96px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {badges.map((b, i) => (
          <Card key={b.id} tone="white" onClick={() => onOpenDetail && onOpenDetail(b)} style={{ cursor: 'pointer' }}>
            <div style={{ height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <window.BadgeShapeBox index={i} />
            </div>
            <p style={{ margin: '8px 0 4px', fontSize: 14 }}>{b.name}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <RarityBadge rarity={b.rarity} />
              <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>{b.date}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
window.BadgesScreen = BadgesScreen;
