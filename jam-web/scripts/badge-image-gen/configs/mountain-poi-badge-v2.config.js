/**
 * 산 POI 배지 이미지 설정 — JAM MOUNTAIN 디자인 (2026-08-24 개편)
 * 디자인 출처: Figma https://www.figma.com/design/UXcBEgFagmO5ARwH5F0mMW/?node-id=4-41
 *   (짙은 녹색 원 + 베이지 테두리 + MOUNTAIN 아치 + Jam 로고 + 나무 3그루 + 산 이름, 681.32x681.32)
 *
 * 이전 디자인(mountain-poi-badge, 340x340)을 대체한다.
 * outputDir을 이전과 동일하게 두어 파일만 덮어쓰므로 `badges.image_url` UPDATE가 필요 없다
 * — DB를 먼저 바꿔 배포 전까지 이미지가 깨졌던 [[20260824_020]]의 문제를 구조적으로 피한다.
 *
 * 대상: public.poi.category='mountain'에 연결된 public.badges (847개, 2026-08-24 기준)
 */
const { fetchAllRows } = require('../lib/fetch-all-rows')
const { dedupeByBadgeId } = require('../lib/dedupe-by-badge-id')

module.exports = {
  name: 'mountain-poi-badge-v2',

  // Figma 원본 좌표계 (아래 text 값들은 전부 이 기준). 실제 출력 크기는 outputSize로 축소.
  canvas: { width: 681.32, height: 681.32 },
  outputSize: 256,

  background: {
    type: 'svg-file',
    // Figma 노드 4:41의 Layer_1 전체 SVG에 Jam 로고(5:2)를 원본 좌표로 합성한 파일.
    // (Figma가 내려주는 asset URL은 7일 만료라 svg-url 대신 파일로 캐시)
    path: 'scripts/badge-image-gen/backgrounds/mountain-poi-badge-v2.svg',
  },

  text: {
    template: '{{name}}',
    // Figma 텍스트 노드 4:38 좌표 그대로 (2줄까지 들어가는 높이)
    x: 188.32,
    y: 450.32,
    width: 308,
    height: 142,
    fontSize: 59.222,
    color: '#FFFFFF',
    fontWeight: 700,
    align: 'center',
    // 폰트 실제 advance width로 폭을 재서 디자인이 정한 59.222px을 그대로 유지한다
    measure: 'font',
    autoShrink: true,
    minFontSize: 30,
    // 산 이름은 2~5자(3자가 93%)라 원본 크기로는 텍스트 영역에 여백이 많이 남는다.
    // 이전 산 배지 작업([[20260806_006]])과 동일하게 짧을수록 최대 150%까지 키운다.
    autoGrow: true,
    maxFontSize: 88.8,
  },

  font: {
    name: 'Pretendard Bold',
    weight: 700,
    cacheFile: 'Pretendard-Bold.ttf',
    url: 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/alternative/Pretendard-Bold.ttf',
  },

  /** poi(category='mountain') ↔ badges를 linked_badge_id로 조인. 소프트삭제 배지는 제외 */
  async dataSource(supabase) {
    const pois = await fetchAllRows(() =>
      supabase
        .from('poi')
        .select('name, linked_badge_id')
        .eq('category', 'mountain')
        .not('linked_badge_id', 'is', null)
        .order('name')
    )

    // badges.type='poi'는 마이그레이션 103([[20260826_004]])에서 'checkin'으로 이름이 바뀌었다
    // (이번 티켓 20260830_1252에서 발견·수정 — metro-poi-badge.config.js와 동일한 버그)
    const aliveBadges = await fetchAllRows(() =>
      supabase.from('badges').select('id').eq('type', 'checkin').is('deleted_at', null).order('id')
    )
    const alive = new Set(aliveBadges.map((b) => b.id))

    const rows = pois
      .filter((p) => alive.has(p.linked_badge_id))
      .map((p) => ({ id: p.linked_badge_id, name: p.name }))

    // 현재(2026-08-30 기준) mountain 카테고리에서 badge id 중복 연결은 없지만, metro-poi-badge에서
    // 발견된 것과 동일한 다대일 연결 사고를 예방하기 위해 방어적으로 dedupe한다([[20260830_1252]]).
    return dedupeByBadgeId(rows)
  },

  // 이전 디자인과 동일 경로 — 파일을 덮어쓰므로 image_url 변경이 필요 없다
  outputDir: 'badges/poi/mountain',

  updateSqlTemplate: `-- 산 POI 배지 이미지(JAM MOUNTAIN 디자인) 경로 확인용 — 경로가 이전과 동일하므로
-- 실제로는 실행할 필요가 없다 (파일만 교체). 멱등하므로 실행해도 무해하다.
UPDATE public.badges b
SET image_url = '{{imagePathPrefix}}/' || b.id || '.png'
FROM public.poi p
WHERE p.linked_badge_id = b.id
  AND p.category = 'mountain'
  AND b.deleted_at IS NULL
  AND b.image_url IS DISTINCT FROM '{{imagePathPrefix}}/' || b.id || '.png';`,
}
