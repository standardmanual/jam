function InventoryScreen({ onBack }) {
  const { TopNav, Card, RarityBadge } = window.JAMShopifyDesignSystem_f8de83;
  const { inventory } = window.mockData;
  return (
    <div style={{ minHeight: '100%', background: 'var(--color-bg)' }}>
      <TopNav title="인벤토리" onBack={onBack} />
      <div style={{ padding: 16 }}>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-text-secondary)' }}>{inventory.length} / 50개 보관 중</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {inventory.map((it, i) => (
            <Card key={it.id} tone="white" padding={12}>
              <div style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <window.BadgeShapeBox index={i} size={48} iconSize={18} />
              </div>
              <p style={{ margin: '4px 0', fontSize: 11, textAlign: 'center', lineHeight: 1.3 }}>{it.name}</p>
              <div style={{ display: 'flex', justifyContent: 'center' }}><RarityBadge rarity={it.rarity} /></div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
window.InventoryScreen = InventoryScreen;
