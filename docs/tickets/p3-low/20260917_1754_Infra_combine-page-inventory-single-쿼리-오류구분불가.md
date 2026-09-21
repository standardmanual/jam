---
id: 20260917_1754
category: Infra
priority: P3
status: CLOSED
created: 2026-09-17
closed: 2026-09-21
---

# [Infra] `/combine` page.tsx 인벤토리 조회 `.single()`이 무인벤토리와 쿼리 오류를 구분 못함

## 배경 / 문제 정의

티켓 `20260917_1655`(믹스하기 화면 리뉴얼) 게이트 리뷰 중 발견된 범위 밖 이슈. `jam-web/src/app/(main)/combine/page.tsx`에서 유저 인벤토리를 조회할 때 `.single()`을 쓰는데, 이 방식은 "유저가 아직 인벤토리를 만들지 않은 정상 상태"와 "쿼리 자체가 실패한 오류 상태"를 구분하지 못한다. 코드 주석에도 이 한계가 이미 명시돼 있다(무인벤토리도 error로 잡힘, 실제 오류와 구분 못 함, 최소 가시성만 확보).

## 상세 요구사항

### 서비스/코드베이스 관점
- `.single()` 대신 `.maybeSingle()`로 바꾸거나, 별도 존재 여부 확인 쿼리를 앞에 둬서 "무인벤토리(정상)"와 "쿼리 오류(비정상)"를 구분한다.
- 구분되면 오류 로깅(`console.error`)도 실제 오류일 때만 발생하도록 정리한다.

## 구현 계획
파일: `jam-web/src/app/(main)/combine/page.tsx`. 단순 쿼리 방식 교체라 영향 범위는 작다.

### 수용 기준
1. 무인벤토리 유저가 `/combine`에 접속해도 오류 로그가 남지 않는다.
2. 실제 DB 쿼리 오류가 발생하면 오류 로그가 남는다.

---
## 완료 기록

### 구현 내용 요약
`combine/page.tsx`의 인벤토리 조회를 `.single()`에서 `.maybeSingle()`로 바꿨다. 무인벤토리는 error 없이 data null로 오고, 실제 쿼리 오류만 error로 잡혀 `console.error`가 실제 오류일 때만 남는다. 주석과 로그 문구에서 「무인벤토리 포함」 표현을 없앴다.

### 변경된 파일
```
jam-web/src/app/(main)/combine/page.tsx
```

### 테스트 결과
- [x] `scripts/verify.sh` 전체 통과: lint · typecheck · test · ds:check · slop · scripts-test · contract · team-doc (42초)
- [ ] 수용 기준 1·2(무인벤토리 접속 시 로그 없음, 실제 오류 시 로그 있음)는 로그인·DB가 필요한 화면이라 실렌더로 확인하지 않았다. `.maybeSingle()`의 반환 규약(0행이면 data null·error null)에 근거한다.

### 배포 정보
- 배포일: 2026-09-21 (staging, 경미 수정·문서 경로 — 카리나 직접 처리, 리뷰 브랜치 없음)
- 환경: staging
- 커밋: 정리 묶음 커밋(티켓 8건 한 커밋)

### 주요 의사결정 / 핵심 메모
- `invRaw`는 이후 `as { id: string } | null`로 다뤄지고 있어 null 반환에 대한 후속 코드 변경은 필요 없었다.
- 파일 1개·2줄 변경이고 원인과 수정이 명확해 jam-work 0.1절 경미 수정 경로로 처리했다.

### 잔여 이슈
- 없음
