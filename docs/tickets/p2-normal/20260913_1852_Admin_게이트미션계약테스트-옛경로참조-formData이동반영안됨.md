---
id: 20260913_1852
category: Admin
priority: P2
status: CLOSED
created: 2026-09-13
closed: 2026-09-14
---

# [Admin] 게이트미션 계열 선택지 계약 테스트가 옛 파일 경로를 참조해 실패

## 배경 / 문제 정의

티켓 20260913_1819(쉐이더 랩 재생 기능 제거) 게이트 리뷰 중 `npx vitest run` 전체 실행에서
`src/app/admin/gate-missions/__tests__/gate-family-options-contract.test.ts`(티켓
20260910_2055 AC5 회귀 테스트) 3건이 실패함을 발견했다. 이번 티켓과 무관한 파일이라
범위 밖 발견물로 분리한다.

## 원인

이 테스트는 `page.tsx` 소스 코드를 정규식으로 대조하는 계약 테스트인데, 실제 계열
조립 로직(`.filter((f) => !!f.familyKey || f.adminCategory === 'jam')`,
`familyKey: (f.familyKey ?? f.key)`, `adminCategory: f.adminCategory`)이 어느 시점에
`src/app/admin/gate-missions/page.tsx`에서 `src/app/admin/gate-missions/formData.ts`로
옮겨졌다(`git log`상 관련 최근 커밋: `887e8065`·`2d28f31b`, 정확한 이동 시점은 착수 시
`git log -p`로 재확인 필요).

**실제 기능 회귀는 아니다** — `formData.ts:53-60`에 로직이 그대로 살아 있고 내용도
정확하다(직접 대조 확인). 다만 테스트가 낡은 파일을 보고 있어 앞으로 이 로직이 실제로
깨져도 이 계약 테스트가 감지하지 못하는 상태다.

## 상세 요구사항

- `gate-family-options-contract.test.ts`의 `codeOf('src/app/admin/gate-missions/page.tsx')`를
  `formData.ts`(또는 로직이 실제로 위치한 파일)로 갱신
- 3개 테스트 케이스(필터 조건, familyKey 폴백, adminCategory 전달)가 새 위치 기준으로
  정확히 매칭되는지 확인
- 리팩터링 이력상 이 로직이 또 다른 파일로 옮겨질 수 있으므로, 가능하면 테스트가
  구현 파일 경로가 아니라 로직이 있는 모듈을 안정적으로 찾을 수 있는 방식인지도 함께 검토

## 참고

- 발견 경위: 티켓 20260913_1819 게이트 리뷰(conservative-reviewer)의 sideFinding
- 관련 원본 테스트 의도: 티켓 20260910_2055 AC5 (JAM! 카테고리 배지가 family_key 없이도
  게이트 미션 계열 선택지에 노출돼야 함)

---
## 완료 기록

### 구현 내용 요약
같은 근본 원인(테스트가 옛 파일 경로 `page.tsx`를 참조)을 보고한 4개 티켓
(20260913_1852·20260912_2116·20260911_2137·20260912_1105)을 하나의 작업으로 묶어 처리했다.

착수 전 `formData.ts`의 실제 로직(`.filter((f) => !!f.familyKey || f.adminCategory === 'jam')`,
`familyKey: (f.familyKey ?? f.key)`, `adminCategory: f.adminCategory`)을 직접 대조해
**실제 기능(JAM! 카테고리 라벨 구분)은 정상 동작 중임을 먼저 확인**했다 — 20260912_1105가
우려했던 "테스트만 실패인지, 실제 기능도 미동작인지"에 대한 답은 **테스트만 실패**였다.
`page.tsx`(목록 페이지)는 티켓 20260911_2035(폼이 new/[id] 페이지로 분리)로 계열 조립 로직을
더 이상 갖고 있지 않고, `familyResult.badges`를 정합성 검사(`checkGateMissionConsistency`)
용도로만 쓴다 — 계열 드롭다운 로직은 폼 전용 `loadGateMissionFormData`(`formData.ts`)로
완전히 이전됐다.

**수정**: `gate-family-options-contract.test.ts`의 `codeOf('.../page.tsx')`를
`codeOf('.../formData.ts')`로 변경. 테스트 안내 주석도 이 이전 경위를 반영해 갱신했다.

### 변경된 파일
```
jam-web/src/app/admin/gate-missions/__tests__/gate-family-options-contract.test.ts
```

### 테스트 결과
- [x] `npx vitest run src/app/admin/gate-missions/__tests__/gate-family-options-contract.test.ts` — 3/3 통과
- [x] `npx eslint` (변경 파일 한정) — 에러 0건

### 배포 정보
- 배포일: 2026-09-14
- 환경: staging
- 커밋: (staging 직접 commit)

### 주요 의사결정 / 핵심 메모
- 0.1절 "경미 수정" 기준(변경 1개 파일, diff 10줄 이내, 원인-결과 1:1 명확)에 해당해
  jam-developer 위임·게이트 리뷰 없이 오케스트레이터가 직접 처리했다.
- 4개 중복 보고 티켓을 각각 별도로 고치지 않고 이 티켓 하나로 통합 처리 — 나머지 3건
  (20260912_2116, 20260911_2137, 20260912_1105)은 이 티켓을 참조해 CLOSED 처리한다.

### 잔여 이슈
- 없음
