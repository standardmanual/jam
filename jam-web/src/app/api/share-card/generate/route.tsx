import { ImageResponse } from '@vercel/og'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { BadgeRow, UserActivityBadgeRow } from '@/types/database'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  let badgeId: string
  try {
    const body = await request.json() as { badgeId?: string }
    if (!body.badgeId || typeof body.badgeId !== 'string') {
      return NextResponse.json({ error: 'badgeId required' }, { status: 400 })
    }
    badgeId = body.badgeId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [{ data: badge }, { data: earnedRow }] = await Promise.all([
    supabase.from('badges').select('*').eq('id', badgeId).single(),
    supabase
      .from('user_activity_badges')
      .select('*')
      .eq('user_id', user.id)
      .eq('badge_id', badgeId)
      .maybeSingle(),
  ])

  if (!badge) {
    return NextResponse.json({ error: 'Badge not found' }, { status: 404 })
  }

  const badgeRow = badge as BadgeRow
  const earned = earnedRow as UserActivityBadgeRow | null

  // 획득하지 않은 배지는 공유 불가
  if (!earned) {
    return NextResponse.json({ error: 'Badge not earned' }, { status: 403 })
  }

  const earnedDate = new Date(earned.earned_at).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const rarityColorMap: Record<string, string> = {
    common: '#9CA3AF',
    rare: '#60A5FA',
    legendary: '#A855F7',
    mythic: '#F59E0B',
  }

  const rarityLabelMap: Record<string, string> = {
    common: 'COMMON',
    rare: 'RARE',
    legendary: 'LEGEND',
    mythic: 'MYTHIC',
  }

  const rarityColor = rarityColorMap[badgeRow.rarity] ?? '#9CA3AF'
  const rarityLabel = rarityLabelMap[badgeRow.rarity] ?? badgeRow.rarity.toUpperCase()

  const imageResponse = new ImageResponse(
    (
      <div
        style={{
          width: '1080px',
          height: '1080px',
          background: '#0A0A0A',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* 배경 장식 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `radial-gradient(ellipse at 50% 50%, ${rarityColor}15 0%, transparent 70%)`,
          }}
        />

        {/* JAM! 로고 */}
        <div
          style={{
            position: 'absolute',
            top: '60px',
            left: '60px',
            color: '#AEEA00',
            fontSize: '52px',
            fontWeight: 900,
            letterSpacing: '-2px',
          }}
        >
          JAM!
        </div>

        {/* 희귀도 */}
        <div
          style={{
            position: 'absolute',
            top: '60px',
            right: '60px',
            color: rarityColor,
            fontSize: '24px',
            fontWeight: 700,
            letterSpacing: '3px',
            border: `2px solid ${rarityColor}50`,
            padding: '8px 20px',
            borderRadius: '8px',
          }}
        >
          {rarityLabel}
        </div>

        {/* 배지 이미지 */}
        <div
          style={{
            width: '360px',
            height: '360px',
            borderRadius: '48px',
            background: '#1A1A1A',
            border: `3px solid ${rarityColor}40`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '48px',
            boxShadow: `0 0 60px ${rarityColor}30`,
          }}
        >
          {badgeRow.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={badgeRow.image_url}
              alt={badgeRow.name}
              style={{ width: '320px', height: '320px', objectFit: 'contain', borderRadius: '40px' }}
            />
          ) : (
            <span style={{ fontSize: '180px' }}>🏅</span>
          )}
        </div>

        {/* 배지 이름 */}
        <div
          style={{
            color: '#FFFFFF',
            fontSize: '56px',
            fontWeight: 900,
            textAlign: 'center',
            marginBottom: '20px',
            padding: '0 80px',
            lineHeight: 1.2,
          }}
        >
          {badgeRow.name}
        </div>

        {/* 획득 날짜 */}
        <div
          style={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: '28px',
            marginBottom: '48px',
          }}
        >
          {earnedDate} 획득
        </div>

        {/* 해시태그 */}
        <div
          style={{
            color: '#AEEA00',
            fontSize: '28px',
            fontWeight: 700,
            letterSpacing: '1px',
          }}
        >
          #JAM #JoinAndMove
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
    }
  )

  return imageResponse
}
