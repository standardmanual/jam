function ProfileScreen() {
  const { Card, Button } = window.JAMShopifyDesignSystem_f8de83;
  const { badges } = window.mockData;
  return (
    <div style={{ padding: '24px 16px 96px', background: 'var(--color-bg)', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-surface-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="https://unpkg.com/lucide-static@latest/icons/user.svg" style={{ width: 28, height: 28, opacity: 0.5 }} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--text-h3)', fontWeight: 400 }}>시현</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>@sihyun_run</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 24, margin: '24px 0' }}>
        <div><p style={{ margin: 0, fontSize: 'var(--text-h4)' }}>128</p><p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>배지</p></div>
        <div><p style={{ margin: 0, fontSize: 'var(--text-h4)' }}>3,240</p><p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>JAM 포인트</p></div>
        <div><p style={{ margin: 0, fontSize: 'var(--text-h4)' }}>52</p><p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>팔로워</p></div>
      </div>
      <Card tone="tint" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="https://unpkg.com/lucide-static@latest/icons/activity.svg" style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 14 }}>Strava 연동됨</span>
        </div>
      </Card>
      <h2 style={{ margin: '0 0 16px', fontSize: 'var(--text-h4)', fontWeight: 400 }}>대표 배지</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 24 }}>
        {badges.map((b) => (
          <div key={b.id} style={{ aspectRatio: '1', borderRadius: 'var(--radius-card)', background: '#fff', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="https://unpkg.com/lucide-static@latest/icons/medal.svg" style={{ width: 22, height: 22, opacity: 0.5 }} />
          </div>
        ))}
      </div>
      <Button variant="secondary" fullWidth>프로필 편집</Button>
    </div>
  );
}
window.ProfileScreen = ProfileScreen;
