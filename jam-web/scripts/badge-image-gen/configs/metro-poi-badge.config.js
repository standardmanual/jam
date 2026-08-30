/**
 * 지하철역 POI 배지 이미지 설정 — JAM METRO 디자인 (2026-08-24 개편)
 * 디자인 출처: Figma https://www.figma.com/design/UXcBEgFagmO5ARwH5F0mMW/?node-id=3-20
 *   (빨강 라운드 배경 + 파란 원 + Jam 로고 + METRO 워드마크 + 하단 파란 밴드에 역명, 720x719)
 *
 * 이전 디자인(subway-poi-badge, 340x340 3중 원)을 대체한다 — 디자인·텍스트 위치·크기가 전부
 * 달라져 기존 config를 수정하지 않고 새 config로 분리했다.
 *
 * 대상: public.poi.category IN ('train_subway','transit') POI에 연결된 public.badges
 *
 * 2026-08-24에 지하철역 934개를 transit(대중교통)에서 train_subway로 분리했다([[20260824_023]]).
 * 그 전에는 `category='transit' AND name LIKE '%역'`으로 걸러냈다.
 * 그때 이름이 '역'으로 끝나지 않는 22개(버스정류장·리무진·정류소 등)는 새 텍스트 레이아웃이
 * 맞지 않는다는 이유로 의도적으로 제외되어 category='transit'에 남아있었는데, 이번에
 * 사용자 승인 하에 이 22개도 동일 METRO 디자인으로 채우기로 하여 category 필터에 transit을
 * 추가한다([[20260830_1252]]). transit에는 linked_badge_id가 없는 POI(문 배지 미연결)도 섞여
 * 있으나 아래 dataSource가 linked_badge_id IS NOT NULL로 걸러내므로 실제로는 이 22개만 추가된다.
 *
 * 단, 강남역·선릉역·수서역 3개 배지는 train_subway POI("강남역")와 transit POI("강남역
 * 신분당선" 등) 양쪽에 동시에 linked_badge_id로 연결돼 있다(게이트 리뷰 발견,
 * [[20260830_1252]]). dedupeByBadgeId로 badge id 기준 1건만 남기고, train_subway 쪽
 * 이름("강남역")을 우선한다 — 이미 934개 배치로 정확히 생성·배포된 이미지를 뒤에 처리되는
 * transit 중복 행("강남역 신분당선")이 같은 파일명에 덮어써 깨뜨리는 사고를 막기 위함이다.
 */
const { fetchAllRows } = require('../lib/fetch-all-rows')
const { dedupeByBadgeId } = require('../lib/dedupe-by-badge-id')

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
   * poi(category IN ('train_subway','transit')) ↔ badges를 linked_badge_id로 조인.
   * 소프트삭제된 배지(deleted_at IS NOT NULL)는 제외한다.
   *
   * badges.type='poi'는 마이그레이션 103([[20260826_004]])에서 'checkin'으로 이름이
   * 바뀌었다 — 이 config는 그 이후 재실행된 적이 없어 'poi' 리터럴이 남아있었고, 이대로
   * 실행하면 aliveBadges가 0건이 되어 대상이 전부 걸러지는 버그였다(이번 티켓에서 발견·수정).
   */
  async dataSource(supabase) {
    const pois = await fetchAllRows(() =>
      supabase
        .from('poi')
        .select('name, category, linked_badge_id')
        .in('category', ['train_subway', 'transit'])
        .not('linked_badge_id', 'is', null)
        .order('name')
    )

    const aliveBadges = await fetchAllRows(() =>
      supabase.from('badges').select('id').eq('type', 'checkin').is('deleted_at', null).order('id')
    )
    const alive = new Set(aliveBadges.map((b) => b.id))

    const rows = pois
      .filter((p) => alive.has(p.linked_badge_id))
      .map((p) => ({ id: p.linked_badge_id, name: p.name, category: p.category }))

    // badge id 기준 다대일 연결(강남역·선릉역·수서역 등) 정리 — train_subway 이름을 우선한다.
    return dedupeByBadgeId(rows, ['train_subway', 'transit'])
  },

  outputDir: 'badges/poi/metro',

  updateSqlTemplate: `-- 지하철역/버스정류장 등 대중교통 POI 배지 이미지(JAM METRO 디자인) 반영
-- scripts/badge-image-gen/generate.js metro-poi-badge 실행 결과
UPDATE public.badges b
SET image_url = '{{imagePathPrefix}}/' || b.id || '.png'
FROM public.poi p
WHERE p.linked_badge_id = b.id
  AND p.category IN ('train_subway', 'transit')
  AND b.deleted_at IS NULL;`,
}
