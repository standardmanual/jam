---
id: "20261007_1552"
category: Admin
priority: P2
status: CLOSED
created: 2026-10-07
closed: 2026-11-09
parent: "20261006_1806"
---

# [Admin] 서버 렌더 이미지 내려받기가 https 요청의 리다이렉트를 따라가 http·내부 주소로 넘어갈 수 있다

> 상위: 20261006_1806 ⑥-B(20261007_1601)의 게이트 주의(보안) 발견물. 이번 정책(https만·시간·크기 상한) 범위 밖이라 분리했다.

## 핵심 요약

- 요구사항: `jam-web/scripts/asset-generator/loadLayerImage.mjs`의 `downloadImage`(84줄 근처)가 리다이렉트를 따라갈 때도 https만 허용하고 내부 주소(사설 IP·링크 로컬)로 넘어가지 않게 한다.
- 문제: `fetch`의 기본 동작은 리다이렉트를 따라간다. https 주소로 요청해도 응답이 http나 내부 주소로 리다이렉트하면 ⑥-B의 「https만」 검사를 우회한다. 시간(15초)·크기(5MB) 상한은 리다이렉트 이후에도 적용되므로 피해 범위는 제한된다.
- 구현 계획: `redirect: 'manual'`로 받아 최대 횟수(예: 3회) 안에서 각 단계의 주소를 같은 규칙(https만, 사설 IP·링크 로컬 거부)으로 검사하거나, 리다이렉트를 허용하지 않고 오류로 멈춘다(정책은 착수 때 사용자에게 묻는다. 서비스 저장소 주소가 리다이렉트하는 일이 없는지 확인한다). 테스트는 `loadLayerImage.test.ts`의 `fetchImpl` 스텁에 리다이렉트 응답을 더한다.
- 관련 파일: `jam-web/scripts/asset-generator/loadLayerImage.mjs`, `jam-web/scripts/asset-generator/__tests__/loadLayerImage.test.ts`, `docs/service/prd/asset-generator/PRD.md` §8(URL 보호 규칙).

## 완료 조건

- [ ] https 주소가 http나 내부 주소로 리다이렉트하면 오류로 멈춘다(테스트).
- [ ] 정상 https 이미지와 로컬 파일 경로는 기존대로 동작한다.
- [ ] `scripts/verify.sh`가 통과한다.

---
## 완료 기록

### 구현 내용 요약
서버 렌더가 이미지를 내려받는 `downloadImage`(`loadLayerImage.mjs`)가 `fetch` 기본값으로 리다이렉트를 따라가 https 검사를 우회해 http·내부 주소로 넘어갈 수 있었다. `fetch`에 `redirect: "manual"`을 주고 3xx 또는 `opaqueredirect` 응답은 한국어 오류로 멈추게 했다. 오류 문구에는 쿼리·해시를 싣지 않는다. 정상 https 이미지와 로컬 파일 경로는 그대로다. 정책은 티켓이 허용한 두 선택지 중 «리다이렉트 전면 거부»로 정했다.

### 변경된 파일
```
jam-web/scripts/asset-generator/loadLayerImage.mjs
jam-web/scripts/asset-generator/__tests__/loadLayerImage.test.ts
docs/service/prd/asset-generator/PRD.md
```

### 테스트 결과
- [x] `loadLayerImage.test.ts` 15건 통과(리다이렉트 코드 4종 x 위치 3종, `opaqueredirect`, 쿼리 토큰 미노출 2건 추가).
- [x] CI verify는 test·lint·typecheck 통과, spacing만 실패(staging 기존 문제, 이번 push에서 티켓 20261109_1448로 수정).

### 배포 정보
- 배포일: 2026-11-09
- 환경: staging
- 커밋: 머지 커밋(해시는 push 뒤 git log 참고)

### 실행 지표
| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 | jam-developer, jam-reviewer (경로 ③, 채원 생략: admin) | 91,529 | 92,376 / 27,716 | 44분 31초 | 46 |
| 합계 |  | 91,529 | 92,376 / 27,716 | 44분 31초 | 46 |

### 주요 의사결정 / 핵심 메모
- 티켓은 정책을 착수 때 사용자에게 묻도록 했으나 구현 실행에서 물을 수 없어 «전면 거부»로 정했다. 단계별 검증(최대 3회 추적)이 필요하면 후속으로 확장한다.
- 서비스 저장소(Supabase 공개 저장소) 실제 이미지 주소가 3xx를 돌려주는지는 확인하지 못했다(없는 경로에서 HTTP 400만 확인). 3xx를 돌려주는 환경이면 이제 오류가 되고, 오류 문구가 직접 입력을 안내한다.
- 게이트 판정 WARN: 완료 조건 «verify 통과»가 staging 기존 spacing 실패 때문에 미충족이었다.

### 잔여 이슈
- 정상 https 이미지가 3xx를 돌려주지 않는지 실제 파일 주소로 확인하는 일.
