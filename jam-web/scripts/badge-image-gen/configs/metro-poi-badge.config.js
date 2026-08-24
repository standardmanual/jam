/**
 * 지하철역 POI 배지 이미지 설정 — JAM METRO 디자인 (2026-08-24 개편)
 * 디자인 출처: Figma https://www.figma.com/design/UXcBEgFagmO5ARwH5F0mMW/?node-id=3-20
 *   (빨강 라운드 배경 + 파란 원 + Jam 로고 + METRO 워드마크 + 하단 파란 밴드에 역명, 720x719)
 *
 * 이전 디자인(subway-poi-badge, 340x340 3중 원)을 대체한다 — 디자인·텍스트 위치·크기가 전부
 * 달라져 기존 config를 수정하지 않고 새 config로 분리했다.
 *
 * 대상: public.poi.category='transit' 중 이름이 '역'으로 끝나는 POI에 연결된 public.badges
 *       (929개, 2026-08-24 기준)
 */
const { fetchAllRows } = require('../lib/fetch-all-rows')

module.exports = {
  name: 'metro-poi-badge',

  // Figma 원본 좌표계 (아래 text 값들은 전부 이 기준). 실제 출력 크기는 outputSize로 축소.
  // Figma 그룹은 720x719지만 출력을 정사각형으로 맞추기 위해 배경을 1px 늘려 720x720으로 둔다
  canvas: { width: 720, height: 720 },
  outputSize: 256,

  background: {
    type: 'svg-file',
    // Figma 노드(3:20)의 배경 요소를 원본 좌표 그대로 조립한 SVG.
    // (Figma가 내려주는 asset URL은 7일 만료라 svg-url 대신 파일로 캐시)
    path: 'scripts/badge-image-gen/backgrounds/metro-poi-badge.svg',
  },

  text: {
    template: '{{name}}',
    // Figma 텍스트 노드 3:19 ("국제금융센터·부산은행역") 좌표 그대로
    x: 28,
    y: 572,
    width: 667,
    height: 81,
    fontSize: 68.082,
    color: '#FFFFFF',
    fontWeight: 700,
    align: 'center',
    // 폰트 실제 advance width로 폭을 재서, 디자인이 정한 68.082px을 최대한 그대로 유지한다.
    // (근사치 모드였다면 한글 글자폭을 1em으로 과대 계산해 불필요하게 축소됐다)
    measure: 'font',
    autoShrink: true,
    minFontSize: 34,
  },

  font: {
    name: 'Pretendard Bold',
    weight: 700,
    cacheFile: 'Pretendard-Bold.ttf',
    url: 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/alternative/Pretendard-Bold.ttf',
  },

  /**
   * poi(category='transit') 중 이름이 '역'으로 끝나는 것 ↔ badges를 linked_badge_id로 조인.
   * 소프트삭제된 배지(deleted_at IS NOT NULL)는 제외한다.
   */
  async dataSource(supabase) {
    const pois = await fetchAllRows(() =>
      supabase
        .from('poi')
        .select('name, linked_badge_id')
        .eq('category', 'transit')
        .like('name', '%역')
        .not('linked_badge_id', 'is', null)
        .order('name')
    )

    const aliveBadges = await fetchAllRows(() =>
      supabase.from('badges').select('id').eq('type', 'poi').is('deleted_at', null).order('id')
    )
    const alive = new Set(aliveBadges.map((b) => b.id))

    return pois
      .filter((p) => alive.has(p.linked_badge_id))
      .map((p) => ({ id: p.linked_badge_id, name: p.name }))
  },

  outputDir: 'badges/poi/metro',

  updateSqlTemplate: `-- 지하철역 POI 배지 이미지(JAM METRO 디자인) 반영
-- scripts/badge-image-gen/generate.js metro-poi-badge 실행 결과
UPDATE public.badges b
SET image_url = '{{imagePathPrefix}}/' || b.id || '.png'
FROM public.poi p
WHERE p.linked_badge_id = b.id
  AND p.category = 'transit'
  AND p.name LIKE '%역'
  AND b.deleted_at IS NULL;`,
}
