/**
 * 산 POI 배지 이미지 설정
 * 디자인 출처: Figma https://www.figma.com/design/Ywem5JUcvGdfCcNPQxx1qb/JAM?node-id=1-9
 *   (짙은 녹색 원 + 골드 태양광선 + 산 이름 텍스트, 340x340)
 *
 * 대상: public.poi.category='mountain'에 연결된 public.badges (847개, 2026-08-06 기준)
 */
const { fetchAllRows } = require('../lib/fetch-all-rows')

module.exports = {
  name: 'mountain-poi-badge',

  // Figma 원본 좌표계 (아래 text 값들은 전부 이 기준). 실제 출력 크기는 outputSize로 축소.
  canvas: { width: 340, height: 340 },
  outputSize: 256,

  background: {
    type: 'svg-file',
    // Figma get_design_context로 받은 원본 배경 SVG를 로컬에 캐시해둔 파일.
    // (Figma API가 내려주는 asset URL은 단기 만료라 svg-url 대신 svg-file로 고정)
    path: 'scripts/badge-image-gen/backgrounds/mountain-poi-badge.svg',
  },

  text: {
    template: '{{name}}',
    // Figma 메타데이터 기준 텍스트 박스(top-left 좌표): x=40 y=53 width=258 height=86
    x: 40,
    y: 53,
    width: 258,
    height: 86,
    fontSize: 36,
    color: '#FFFFFF',
    fontWeight: 700,
    align: 'center',
    // 산 이름은 대부분 2~5자로 짧아 Figma 기본 크기(36)로는 여백이 많이 남아 작아 보임 →
    // 짧을수록 확대(최대 150% = 54)하고, 혹시 긴 이름이면 축소(최소 18)하도록 양방향 스케일링.
    // 그래도 minFontSize에서 안 들어가면 2줄 중앙정렬로 자동 전환 (subway-poi-badge와 동일 엔진 로직)
    autoShrink: true,
    minFontSize: 18,
    autoGrow: true,
    maxFontSize: 54,
  },

  font: {
    name: 'Pretendard Bold',
    weight: 700,
    cacheFile: 'Pretendard-Bold.ttf',
    url: 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/alternative/Pretendard-Bold.ttf',
  },

  /** poi(category='mountain') ↔ badges를 linked_badge_id로 조인해 산 이름 목록을 가져온다 */
  async dataSource(supabase) {
    const rows = await fetchAllRows(() =>
      supabase
        .from('poi')
        .select('name, linked_badge_id')
        .eq('category', 'mountain')
        .not('linked_badge_id', 'is', null)
        .order('name')
    )
    return rows.map((r) => ({ id: r.linked_badge_id, name: r.name }))
  },

  outputDir: 'badges/poi/mountain',

  updateSqlTemplate: `-- 산 POI 배지 이미지 반영 (scripts/badge-image-gen/generate.js mountain-poi-badge 실행 결과)
UPDATE public.badges
SET image_url = '{{imagePathPrefix}}/' || id || '.png'
WHERE id IN (
  SELECT linked_badge_id FROM public.poi
  WHERE category = 'mountain' AND linked_badge_id IS NOT NULL
);`,
}
