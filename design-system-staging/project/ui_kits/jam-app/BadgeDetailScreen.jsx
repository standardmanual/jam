function BadgeDetailScreen({ badge, onBack }) {
  const { TopNav, Card, RarityBadge, Button } = window.JAMShopifyDesignSystem_f8de83;
  if (!badge) return null;
  const shapeIndex = badge.id % window.mockData.badgeShapes.length;
  return (
    <div style={{ minHeight: '100%', background: 'var(--color-primary)' }}>
      <TopNav title="배지 상세" onBack={onBack} />
      <div style={{ padding: '24px 16px 96px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <ShapeTag shape={shapeByRarity[badge.rarity]} colorIndex={colorByRarity[badge.rarity]} style={{ width: 120, height: 120 }}>
            <img src="https://unpkg.com/lucide-static@latest/icons/medal.svg" style={{ width: 44, height: 44 }} />
          </ShapeTag>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 'var(--text-h3)', fontWeight: 400, color: 'var(--color-white)' }}>{badge.name}</h1>
            <RarityBadge rarity={badge.rarity} />
          </div>
        </div>

        <Card tone="white">
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            {badge.date}에 획득했어요. 이 배지는 목표 거리를 완주한 러너에게 주어져요.
          </p>
        </Card>

        <div style={{ display: 'flex', gap: 12 }}>
          <Card tone="white" style={{ flex: 1, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-h4)' }}>1,204</p>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-secondary)' }}>누적 획득자</p>
          </Card>
          <Card tone="white" style={{ flex: 1, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-h4)' }}>300</p>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-secondary)' }}>JAM 포인트</p>
          </Card>
        </div>

        <section>
          <h2 style={{ margin: '0 0 12px', fontSize: 'var(--text-h4)', fontWeight: 400, color: 'var(--color-white)' }}>획득 조건</h2>
          <Card tone="white" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="https://unpkg.com/lucide-static@latest/icons/target.svg" style={{ width: 20, height: 20, opacity: 0.6 }} />
            <p style={{ margin: 0, fontSize: 14 }}>누적 42.195km 완주하기</p>
          </Card>
        </section>

        <Button variant="secondary" surface="dark" fullWidth>이 배지 공유하기</Button>
      </div>
    </div>
  );
}
window.BadgeDetailScreen = BadgeDetailScreen;
