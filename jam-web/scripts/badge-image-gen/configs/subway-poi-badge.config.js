/**
 * 지하철역 POI 배지 이미지 설정
 * 디자인 출처: Figma https://www.figma.com/design/Ywem5JUcvGdfCcNPQxx1qb/JAM?node-id=1-9
 *   (파랑/흰색/주황 3중 원 + 역명 텍스트, 340x340)
 *
 * 대상: public.poi.category='transit'에 연결된 public.badges (978개, 2026-08-06 기준)
 */
const { fetchAllRows } = require('../lib/fetch-all-rows')

module.exports = {
  name: 'subway-poi-badge',

  // Figma 원본 좌표계 (아래 text 값들은 전부 이 기준). 실제 출력 크기는 outputSize로 축소.
  canvas: { width: 340, height: 340 },
  outputSize: 256,

  background: {
    type: 'svg-file',
    // Figma get_design_context로 받은 원본 배경 SVG를 로컬에 캐시해둔 파일.
    // (Figma API가 내려주는 asset URL은 단기 만료라 svg-url 대신 svg-file로 고정)
    path: 'scripts/badge-image-gen/backgrounds/subway-poi-badge.svg',
  },

  text: {
    template: '{{name}}',
    x: 45,
    y: 148,
    width: 249,
    height: 43,
    fontSize: 36,
    color: '#FFFFFF',
    fontWeight: 700,
    align: 'center',
    // 역명 길이가 제각각이라(예: "학동·증심사입구역") 폭 초과 시 자동으로 축소
    autoShrink: true,
    minFontSize: 18,
  },

  font: {
    name: 'Pretendard Bold',
    weight: 700,
    cacheFile: 'Pretendard-Bold.ttf',
    url: 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/alternative/Pretendard-Bold.ttf',
  },

  /** poi(category='transit') ↔ badges를 linked_badge_id로 조인해 역명 목록을 가져온다 */
  async dataSource(supabase) {
    const rows = await fetchAllRows(() =>
      supabase
        .from('poi')
        .select('name, linked_badge_id')
        .eq('category', 'transit')
        .not('linked_badge_id', 'is', null)
        .order('name')
    )
    return rows.map((r) => ({ id: r.linked_badge_id, name: r.name }))
  },

  outputDir: 'badges/poi/transit',

  updateSqlTemplate: `-- 지하철역 POI 배지 이미지 반영 (scripts/badge-image-gen/generate.js subway-poi-badge 실행 결과)
UPDATE public.badges
SET image_url = '{{imagePathPrefix}}/' || id || '.png'
WHERE id IN (
  SELECT linked_badge_id FROM public.poi
  WHERE category = 'transit' AND linked_badge_id IS NOT NULL
);`,
}
