function DropsScreen({ onBack }) {
  const { TopNav, Card, RarityBadge, Button } = window.JAMShopifyDesignSystem_f8de83;
  const { drops } = window.mockData;
  return (
    <div style={{ minHeight: '100%', background: 'var(--color-bg)' }}>
      <TopNav title="드랍" onBack={onBack} />
      <div style={{ padding: '16px 16px 96px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)' }}>근처에 아이템이 떨어졌어요</p>
        {drops.map((d) => (
          <Card key={d.id} tone="white" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-card)', background: 'var(--color-surface-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img src="https://unpkg.com/lucide-static@latest/icons/package.svg" style={{ width: 20, height: 20 }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14 }}>{d.name}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-secondary)' }}>{d.distance}</p>
            </div>
            <RarityBadge rarity={d.rarity} />
          </Card>
        ))}
        <Button variant="primary" fullWidth>지금 드랍할까요?</Button>
      </div>
    </div>
  );
}
window.DropsScreen = DropsScreen;
