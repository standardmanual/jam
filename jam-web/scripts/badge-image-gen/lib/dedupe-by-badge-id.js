/**
 * POI ↔ badges 조인 결과에서 같은 badges.id가 여러 POI 행에 연결된 경우를 걸러낸다
 * (티켓 20260830_1252 게이트 리뷰 발견 — metro-poi-badge.config.js의 category 필터를
 * `train_subway`에서 `train_subway, transit`로 확장하면서, 강남역/선릉역/수서역 3개 배지가
 * train_subway POI("강남역")와 transit POI("강남역 신분당선") 양쪽에 linked_badge_id로
 * 동시 연결돼 있어 같은 badge id가 두 번 반환되던 버그).
 *
 * 다대일(POI 여러 개 → badge 1개) 연결이 있으면 processing 순서상 나중 행이 같은 파일명
 * ({badge.id}.png)에 덮어써 먼저 처리된 올바른 이미지를 잘못된 텍스트로 깨뜨릴 수 있다.
 * 이 헬퍼는 그런 케이스를 항상 1건으로 정리하고, 무엇이 버려졌는지 console.warn으로
 * 남긴다(CLI stdout·API 라우트 서버 로그 양쪽에서 보이도록).
 *
 * @param {{ id: string, name: string, category?: string }[]} rows
 * @param {string[]} [categoryPriority] 낮은 인덱스가 우선(유지). 미지정 category는 최하 우선순위.
 *   생략하면 먼저 등장한 행(입력 순서)을 유지한다.
 * @returns {{ id: string, name: string, category?: string }[]}
 */
function dedupeByBadgeId(rows, categoryPriority) {
  const priorityOf = (category) => {
    if (!categoryPriority) return 0
    const idx = categoryPriority.indexOf(category)
    return idx === -1 ? categoryPriority.length : idx
  }

  const byId = new Map()
  for (const row of rows) {
    const existing = byId.get(row.id)
    if (!existing) {
      byId.set(row.id, row)
      continue
    }
    // 우선순위가 더 높은(숫자가 작은) 쪽을 유지. 동률이면 먼저 들어온 쪽을 유지한다.
    if (priorityOf(row.category) < priorityOf(existing.category)) {
      byId.set(row.id, row)
    }
  }

  const duplicateIds = new Set()
  for (const row of rows) {
    const kept = byId.get(row.id)
    if (kept !== row) duplicateIds.add(row.id)
  }
  if (duplicateIds.size > 0) {
    for (const id of duplicateIds) {
      const kept = byId.get(id)
      const dropped = rows.filter((r) => r.id === id && r !== kept)
      console.warn(
        `[dedupe-by-badge-id] badge ${id}가 POI ${rows.filter((r) => r.id === id).length}개에 연결돼 있어 ` +
          `"${kept.name}"(${kept.category ?? 'unknown'})만 유지하고 ${dropped
            .map((d) => `"${d.name}"(${d.category ?? 'unknown'})`)
            .join(', ')}은(는) 제외합니다.`
      )
    }
  }

  return Array.from(byId.values())
}

module.exports = { dedupeByBadgeId }
