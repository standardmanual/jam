---
id: 20260906_2329
category: Infra
priority: P2
status: CLOSED
created: 2026-09-06
closed: 2026-09-08
---

# [Infra] DS 매니페스트가 1줄로 minify돼 diff 리뷰가 불가능하다

## 배경 / 문제 정의

`jam-web/scripts/ds-manifest-sync.mjs:164`가 `JSON.stringify(manifest)`를 **들여쓰기 인자
없이** 호출한다. 종전 `_ds_manifest.json`은 사람이 정렬해 둔 pretty-print 상태였는데,
티켓 20260906_2140의 첫 커밋(`5d6e0f00`)에서 이 스크립트가 처음 돌면서 **1148줄 → 1줄**로
통째 재작성됐다.

내용 자체는 정상이었다(신규 컴포넌트 2개 + 토큰 5개 추가). 문제는 **앞으로 매니페스트
diff를 사람이 읽을 수 없다**는 점이다. 컴포넌트를 하나 추가하든 스무 개를 지우든 diff가
「1줄 삭제 / 1줄 추가」로만 보여, 리뷰어가 무엇이 바뀌었는지 확인할 방법이 없다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `ds-manifest-sync.mjs:164`를 `JSON.stringify(manifest, null, 2)`로 바꾼다
- 바꾼 뒤 스크립트를 한 번 돌려 `_ds_manifest.json`을 pretty-print로 되돌린다
  (그 커밋 하나는 다시 전면 재작성 diff가 되지만, 이후로는 의미 있는 diff가 나온다)
- 개행 문자와 파일 끝 개행이 저장소 컨벤션과 맞는지 확인한다

## 구현 계획

한 줄 수정 + 매니페스트 재생성. `npm run ds:manifest`가 idempotent한지(두 번 돌려도
diff가 안 생기는지) 확인할 것.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`ds-manifest-sync.mjs:164`의 `JSON.stringify(manifest)`를 `JSON.stringify(manifest, null, 2)`로
수정했다. 다만 스크립트의 `--write`는 소스 코드 스캔 결과(`changes` 배열)가 비어 있으면
파일 쓰기 자체를 건너뛰는 구조라(158-159행), 지금처럼 매니페스트 **내용**이 이미 최신인
상태에서는 `--write`를 줘도 pretty-print 재작성이 일어나지 않는다 — 실행해서 직접 확인했다.
그래서 이번 1회는 매니페스트를 읽어 같은 포맷(`JSON.stringify(x, null, 2) + '\n'`)으로
수동 재작성했다. 이후로는 스크립트가 실제 변경을 감지할 때마다 같은 포맷으로 쓰므로
정상 경로로 돌아간다.

### 변경된 파일
```
jam-web/scripts/ds-manifest-sync.mjs
jam-web/design-system/_ds_manifest.json
```

### 테스트 결과
- [x] `node scripts/ds-manifest-sync.mjs`(dry-run) 및 `--write` 재실행 — 둘 다 "manifest 가
      이미 최신입니다" 반환, 추가 diff 없음(idempotent 확인)
- [x] 파일 끝 개행 1개(`}\n`)로 저장소 컨벤션과 일치함을 `xxd`로 직접 확인
- [x] `npx tsc --noEmit` — 오류 0건
- [ ] 컴포넌트 하나를 추가/삭제했을 때 diff가 해당 줄만 보임 — 별도 검증 안 함(JSON
      pretty-print의 자명한 성질이라 실제 컴포넌트 추가/삭제가 생기는 다음 DS 작업에서
      자연히 확인될 것)

### 배포 정보
- 배포일: 2026-09-08
- 환경: staging
- 커밋: (아래 커밋 참조)

### 주요 의사결정 / 핵심 메모
**`--write`가 스킵하는 문제는 이 티켓 범위 밖으로 남긴다** — "소스와 매니페스트 내용이
같으면 쓰지 않는다"는 동작 자체는 의도된 설계(불필요한 재작성 방지)이고, 이번처럼
"포맷만 바꾸고 싶다"는 요구는 스크립트가 원래 다루는 시나리오가 아니다. 매번 수동
재작성이 필요한 것도 아니고(포맷 변경은 일회성), 스크립트에 `--force-write` 같은 옵션을
추가하는 것은 이번 한 줄 수정의 범위를 넘어선다고 판단했다.

### 잔여 이슈
-
