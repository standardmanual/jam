function BadgeShapeBox({ index, size = 56, iconSize = 22 }) {
  const { badgeShapes } = window.mockData;
  const shapeId = badgeShapes[index % badgeShapes.length];
  const colors = ['var(--color-tag-1)', 'var(--color-tag-2)', 'var(--color-tag-3)', 'var(--color-tag-4)', 'var(--color-tag-5)', 'var(--color-tag-6)', 'var(--color-tag-7)', 'var(--color-tag-8)'];
  return (
    <div style={{ width: size, height: size, aspectRatio: '1', background: colors[index % colors.length], clipPath: `url(#${shapeId})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <img src="https://unpkg.com/lucide-static@latest/icons/medal.svg" style={{ width: iconSize, height: iconSize }} />
    </div>
  );
}
window.BadgeShapeBox = BadgeShapeBox;

function TodayScreen({ onOpenBadge }) {
  const { Card, RarityBadge } = window.JAMShopifyDesignSystem_f8de83;
  const { badges, shortcuts } = window.mockData;
  return (
    <div style={{ padding: '24px 16px 96px', display: 'flex', flexDirection: 'column', gap: 24, background: 'var(--color-bg)', minHeight: '100%' }}>
      <div>
        <img src="../../assets/logo/jam-logo-black.png" alt="JAM!" style={{ height: 24 }} />
        <p style={{ margin: '16px 0 4px', fontSize: 14, color: 'var(--color-text-secondary)' }}>오늘도 좋은 하루예요</p>
        <h1 style={{ margin: 0, fontSize: 'var(--text-h2)', fontWeight: 400 }}>시현님</h1>
      </div>
      <Card tone="tint">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="https://unpkg.com/lucide-static@latest/icons/activity.svg" style={{ width: 18, height: 18 }} />
            <span style={{ fontSize: 14 }}>Strava 연동됨</span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>8월 13일 09:12</span>
        </div>
      </Card>
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-h4)', fontWeight: 400 }}>최근 획득 배지</h2>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)' }}>전체보기 &gt;</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {badges.slice(0, 2).map((b, i) => (
            <Card key={b.id} tone="white" onClick={() => onOpenBadge && onOpenBadge(b)} style={{ cursor: 'pointer' }}>
              <div style={{ height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <window.BadgeShapeBox index={i} />
              </div>
              <p style={{ margin: '8px 0 4px', fontSize: 14 }}>{b.name}</p>
              <RarityBadge rarity={b.rarity} />
            </Card>
          ))}
        </div>
      </section>
      <section>
        <h2 style={{ margin: '0 0 16px', fontSize: 'var(--text-h4)', fontWeight: 400 }}>바로가기</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {shortcuts.map((s) => (
            <Card key={s.title} tone="white">
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{s.title}</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-secondary)' }}>{s.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
window.TodayScreen = TodayScreen;
