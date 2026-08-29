---
id: 20260830_0039
category: Service
status: CLOSED
created: 2026-08-30
closed: 2026-08-30
---

# [Service] 드랍 단건 조회(`/api/drops/[dropId]`) poi_drops↔inventory_items FK 모호성 수정

## 배경 / 문제 정의
`jam-web/src/app/api/drops/[dropId]/route.ts`의 GET 핸들러가 `poi_drops`를 조회하며
`inventory_items ( serial_prefix, serial_number )`를 관계명 없이 임베드하고 있다.

`poi_drops`와 `inventory_items` 사이에는 FK가 두 개 공존한다:
- 레거시: `inventory_items.drop_id` → `poi_drops.id`
- 신규: `poi_drops.inventory_item_id` → `inventory_items.id`
  (108_item_identity_custody_model.sql, 티켓 20260829_2101 — 개체 정체성 모델)

관계명을 명시하지 않으면 PostgREST가 둘 중 하나를 특정하지 못해 `PGRST201`
(Could not embed because more than one relationship was found)을 던진다.

동일 패턴 버그가 `jam-web/src/app/api/drops/poi/[poiId]/route.ts`에도 있었고,
티켓 20260830_0026에서 `inventory_items!poi_drops_inventory_item_id_fkey ( serial_prefix, serial_number )`
로 관계명을 명시해 수정한 선례가 있다.

**착수 전 확인한 사실**: 이 GET 핸들러를 호출하는 클라이언트 코드는 현재 없다
(`jam-web/src` 전체 grep 결과, `PoiCarouselModal.tsx`는 `POST /api/drops/{id}/pickup`만
사용). 파일 자체 주석("실제로는 POI 기준 목록이 필요하므로 /api/drops/poi/[poiId] 참고")도
이 라우트가 대체되었음을 시사한다. 죽은 코드일 가능성이 높지만, 이번 티켓에서는 우선
20260830_0026과 동일하게 **관계명을 명시하는 방식으로 안전하게 수정**한다 — 호출부가
없다는 확신이 100%가 아니고(동적 fetch, 외부 연동 등 grep으로 못 잡는 경로 가능성),
관계명 명시는 부작용 없는 순수 수정이기 때문이다. 완전한 죽은 코드 삭제는 별도 판단이
필요하므로 이번 스코프에서 제외한다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `jam-web/src/app/api/drops/[dropId]/route.ts`의 `.select()` 구문에서
  `inventory_items`를 `inventory_items!poi_drops_inventory_item_id_fkey`로 관계명 명시
- 20260830_0026 수정과 동일하게, 왜 이 FK를 명시해야 하는지 주석으로 남김
- 회귀 확인: 해당 GET 핸들러가 실제로 200을 반환하는지 (PGRST201 재발 여부)

## 구현 계획
> `poi/[poiId]/route.ts`에 적용한 것과 동일한 패턴 — select 절의 `inventory_items` 뒤에
> `!poi_drops_inventory_item_id_fkey`만 추가한다. 로직 변경 없음, 순수 관계명 명시.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`jam-web/src/app/api/drops/[dropId]/route.ts`의 `.select()` 구문에서 `inventory_items`를
`inventory_items!poi_drops_inventory_item_id_fkey`로 관계명을 명시했다. 티켓 20260830_0026에서
`/api/drops/poi/[poiId]/route.ts`에 적용한 것과 동일한 패턴이며, 왜 이 FK를 명시해야 하는지
설명하는 주석도 동일하게 추가했다. 로직/응답 스키마 변경 없음.

### 변경된 파일
```
jam-web/src/app/api/drops/[dropId]/route.ts
```

### 테스트 결과
- [x] `npm run lint` — 에러 0건, 경고 26건(모두 이번 변경과 무관한 기존 경고, 대상 파일 관련 항목 없음)
- [x] 수정된 select 절을 service_role 클라이언트로 실제 DB에 직접 실행해 회귀 확인 —
  PGRST201 재발 없이 200 상당 응답(정상 data) 반환, `inventory_items.serial_prefix/serial_number`
  정상 포함 확인 (dropId: `491ba118-9cf8-4618-8041-46dfd5202415`로 검증, 테스트 스크립트는
  검증 후 삭제)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
해당 없음 (API 응답 필드 변경 없음)

### 배포 정보
- 배포일: 2026-08-30
- 환경: staging (jam-stage.vercel.app — Vercel이 staging 브랜치 push 시 자동 재배포)
- 커밋: 326fece50d76fab11c2627cd3fd4df5b481cffba (머지 커밋)
- 프로덕션(main) 승격은 별도 `/jam-ship` 절차·사용자 승인 필요, 이번 작업 범위 아님

### 주요 의사결정 / 핵심 메모
티켓 20260830_0026과 완전히 동일한 패턴의 재발 버그였다. 선택하지 않은 대안(라우트 자체 삭제)은
호출부 부재가 grep 확인만으로는 100% 확신할 수 없어 이번 스코프에서 제외했다(티켓 본문에 명시된
결정 그대로 따름).

### 잔여 이슈
- 이 GET 핸들러 자체가 호출부 없는 죽은 코드인지 여부는 별도 조사·판단 필요 (이번 티켓
  스코프 아님)
