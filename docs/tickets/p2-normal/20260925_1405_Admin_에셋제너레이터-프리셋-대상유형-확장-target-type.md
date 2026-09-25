---
id: "20260925_1405"
category: Admin
priority: P2
status: OPEN
created: 2026-09-25
closed:
parent: "20260925_1404"
specs:
  - "docs/specs/prd/asset-generator/PRD.md"
---

# [Admin] 에셋 제너레이터 프리셋 대상 유형 확장(target_type)

> 상위 티켓 [20260925_1404](20260925_1404_Feature_에셋제너레이터-2차-미션컬렉션홈피드확장-윤진신규기획-상위.md)
> 하위 1번. 기획 경위·결정 기록·리스크는 상위 티켓 참고.

## 핵심 요약

- 요구사항: `asset_presets.target_type`의 CHECK 제약을 `'badge'` 단일값에서
  `'badge'|'mission'|'collection'|'home_feed'` 4개로 확장한다. 프리셋 저장 화면(`PresetPanel.tsx`)에
  대상 유형 선택 UI를 추가하고, "프리셋 불러오기" 목록이 현재 작업 중인 콘텐츠 유형으로 필터링되게
  한다. 프리셋 하나는 유형 하나에만 속한다(공용 프리셋 아님, 상위 티켓 결정 2).
- 구현 계획: 마이그레이션 파일(`jam-web/supabase/migrations/`, CHECK 제약 확장, 재실행 가능·되돌림
  SQL 포함)을 작성한다(실행은 승인 후 메인 세션). `PresetPanel.tsx`·`presetSerialize.ts`·프리셋 API
  (`/api/admin/asset-generator/presets`)에 `target_type` 값을 다루는 로직을 추가한다. 이 티켓
  자체는 미션·컬렉션·홈피드의 제작·적용 화면을 만들지 않는다(뒤 하위 티켓 몫) — 프리셋 저장·목록
  단계에서 유형을 고를 수 있는 것까지만.
- 관련 파일: `jam-web/supabase/migrations/185_asset_presets.sql`(참고, CHECK 원본),
  `jam-web/src/app/admin/asset-generator/PresetPanel.tsx`, `jam-web/src/lib/asset-generator/presetSerialize.ts`,
  `jam-web/src/app/api/admin/asset-generator/presets/route.ts`

## 배경 / 문제 정의

지금 프리셋은 배지 전용(`target_type` CHECK가 `'badge'` 한 값)이라, 미션·컬렉션·홈피드 프리셋을
저장할 자리가 없다. 유형별로 프리셋을 나누는 이유는 PRD §6 원칙(컬러는 컨텐츠 단위로 정한다)과
맞고, 4종이 같은 프리셋 목록을 공유하면 운영자가 매번 "이 프리셋이 어느 콘텐츠용인지" 기억해야
하는 부담이 생기기 때문이다(상위 티켓 결정 2).

## 완료 조건
- `asset_presets.target_type` CHECK 제약이 4개 값을 허용한다(마이그레이션 파일, 실행은 승인 후).
- 프리셋 저장 화면에서 대상 유형을 골라 저장할 수 있고, 불러오기 목록이 현재 유형으로 필터링된다.
- 기존 배지 프리셋(마이그레이션 185로 만든 것들)이 `target_type='badge'`로 그대로 동작한다(회귀
  없음).
- `scripts/verify.sh` 통과.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
