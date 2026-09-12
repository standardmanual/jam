/**
 * 미슐랭 POI 체크인 배지 이미지 설정 — JAM MICHELIN 디자인 (2026-09-12)
 * 디자인 출처: Figma https://www.figma.com/design/UXcBEgFagmO5ARwH5F0mMW/?node-id=15-127
 *   (골드/레드 미쉐린 가이드 라벨 + 상단 "MICHELIN GUIDE" 아치 텍스트 + 하단 Jam 로고, 823.87x825.30)
 *
 * 대상: public.poi.category='michelin' POI에 연결된 public.badges (티켓 20260912_1025)
 * 기존 metro-poi-badge.config.js와 동일한 프레임워크·패턴을 따른다.
 */
const { fetchAllRows } = require('../lib/fetch-all-rows')

module.exports = {
  name: 'michelin-poi-badge',

  // Figma 원본 좌표계 그대로. 실제 출력 크기는 outputSize로 축소.
  canvas: { width: 823.87, height: 825.299 },
  outputSize: 256,

  background: {
    type: 'svg-file',
    // Figma 노드(15:127)의 배경 요소(외곽선 3중 보더 + 상단 월계수 장식 + 하단 소용돌이 장식 +
    // 빨간 텍스트 배경판 + Jam 로고 + MICHELIN GUIDE 아치 텍스트)를 원본 좌표 그대로 조립한 SVG.
    // (Figma가 내려주는 asset URL은 7일 만료라 svg-url 대신 파일로 캐시)
    path: 'scripts/badge-image-gen/backgrounds/michelin-poi-badge.svg',
  },

  text: {
    template: '{{name}}',
    // Figma 텍스트 노드 15:113(레이어명 'POI') 좌표 그대로
    x: 82,
    y: 403.999,
    width: 665,
    height: 76,
    fontSize: 107.2,
    color: '#F4ECCA',
    fontWeight: 900,
    align: 'center',
    // 폰트 실제 advance width로 폭을 재서 디자인이 정한 크기를 최대한 유지한다.
    measure: 'font',
    autoShrink: true,
    minFontSize: 40,
  },

  font: {
    name: 'Pretendard Black',
    weight: 900,
    cacheFile: 'Pretendard-Black.ttf',
    url: 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/alternative/Pretendard-Black.ttf',
  },

  /**
   * poi(category='michelin') ↔ badges를 linked_badge_id로 조인.
   * 소프트삭제된 배지(deleted_at IS NOT NULL)는 제외한다.
   * mountain·transit과 달리 다대일 연결(동명 POI) 사례가 없어 dedupe가 필요 없다
   * (마이그레이션 164에서 42곳 전부 이름 유일함을 확인 후 1:1 생성).
   */
  async dataSource(supabase) {
    const pois = await fetchAllRows(() =>
      supabase
        .from('poi')
        .select('name, category, linked_badge_id')
        .eq('category', 'michelin')
        .not('linked_badge_id', 'is', null)
        .order('name')
    )

    const aliveBadges = await fetchAllRows(() =>
      supabase.from('badges').select('id').eq('type', 'checkin').eq('category', 'michelin').is('deleted_at', null).order('id')
    )
    const alive = new Set(aliveBadges.map((b) => b.id))

    return pois
      .filter((p) => alive.has(p.linked_badge_id))
      .map((p) => ({ id: p.linked_badge_id, name: p.name, category: p.category }))
  },

  outputDir: 'badges/poi/michelin',

  updateSqlTemplate: `-- 미슐랭 POI 체크인 배지 이미지(JAM MICHELIN 디자인) 반영
-- scripts/badge-image-gen/generate.js michelin-poi-badge 실행 결과
UPDATE public.badges b
SET image_url = '{{imagePathPrefix}}/' || b.id || '.png'
FROM public.poi p
WHERE p.linked_badge_id = b.id
  AND p.category = 'michelin'
  AND b.deleted_at IS NULL;`,
}
