/**
 * 유저 상세 «트라이브» 구역의 변경 양식 (티켓 20261021_1247 3회)
 *
 * 고정하는 것
 *  - 영향 미리 보기: 바꿀 트라이브를 고르면 `GET /api/admin/users/{id}/tribe?newTribeId=`를 읽어 «취소되는 미션 N개»와 이름 목록(없으면 «취소되는 미션이 없어요»)을 보인다.
 *    읽지 못하면 확정을 막고(영향을 모른 채 바꾸지 않는다) «다시 불러오기»로 풀 수 있다. 연달아 고를 때 늦게 온 옛 응답이 새 선택을 덮지 않는다.
 *  - 확정 조건: 바꿀 트라이브·사유·(영향 미리 보기 완료)가 있어야 하고, 사유가 «기타»면 메모가 있어야 한다. 메모 상한은 props(lib 상수)로 받는다.
 *  - 확인창: «트라이브를 바꿀까요?»에 옛 → 새 트라이브, 이미 가진 배지·잼·챕터는 그대로, 취소되는 미션 수, 유저에게 알림이 감, 다시 바꾸면 되돌린다는 점을 알린다.
 *  - 확정: `POST` 본문 `{ newTribeId, reasonCode, memo? }`(메모는 앞뒤 공백을 지우고 비면 키를 뺀다). 성공이면 성공 문구·양식 비움·`router.refresh()`.
 *    실패(409·400·403·404·500·네트워크)는 API의 `error` 문구를 그대로 보이고(403은 영어 «Forbidden»이라 한국어 문구로 바꾼다) 확인창을 닫고 입력을 그대로 둔다. 새로고침하지 않는다.
 *  - 진행 중에는 입력과 버튼을 잠그고 중복 제출을 막는다.
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `onboarding-logout.test.tsx`와 같은 방식을 쓴다: `react`의 `useState`·`useRef`를
 * 호출 순서로 칸을 잡는 작은 저장소로 바꿔 끼우고, 컴포넌트를 함수로 불러 나온 요소 트리에서 핸들러를 꺼내 부른 뒤 다시 그린다.
 * `fetch`는 모의다 — 공용 DB를 바꾸는 요청(POST)을 실제로 보내지 않는다. 하위 컴포넌트(Radix Select·AlertDialog)는 렌더하지 않고 props만 본다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/admin/users/[id]/UserTribeChangeForm.test.tsx"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isValidElement, type ReactElement } from 'react'

const hooks = vi.hoisted(() => ({
  store: [] as unknown[],
  cursor: 0,
}))

const mocks = vi.hoisted(() => ({
  router: { refresh: vi.fn() },
  fetch: vi.fn(),
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++
      if (!(index in hooks.store)) {
        hooks.store[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      const set = (next: unknown) => {
        hooks.store[index] = typeof next === 'function' ? (next as (prev: unknown) => unknown)(hooks.store[index]) : next
      }
      return [hooks.store[index], set]
    },
    useRef: (initial: unknown) => {
      const index = hooks.cursor++
      if (!(index in hooks.store)) hooks.store[index] = { current: initial }
      return hooks.store[index]
    },
  }
})

vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))

import { UserTribeChangeForm } from './UserTribeChangeForm'
import { Select, SelectTrigger } from '@/components/admin/ui/select'
import { Textarea } from '@/components/admin/ui/textarea'
import { AlertDialog } from '@/components/admin/ui/alert-dialog'

type El = ReactElement<Record<string, unknown>>

const USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const T2 = '22222222-2222-4222-8222-222222222222'
const T3 = '33333333-3333-4333-8333-333333333333'

const PROPS = {
  userId: USER,
  currentTribeName: '낭만 미식가',
  options: [
    { id: T2, name: '아스팔트 레인저' },
    { id: T3, name: '숲속의 갱단' },
  ],
  reasons: [
    { value: 'wrong_pick', label: '유저가 잘못 골랐어요' },
    { value: 'user_request', label: '유저가 옮기길 원해요' },
    { value: 'ops_fix', label: '운영 정정' },
    { value: 'other', label: '기타' },
  ],
  memoRequiredReason: 'other',
  memoMaxLength: 200,
}

// ─────────────────────────────────────────────────────────────────────────────
// 요소 트리 도구
// ─────────────────────────────────────────────────────────────────────────────

function walk(node: unknown, visit: (element: El) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit))
    return
  }
  if (!isValidElement(node)) return
  const element = node as El
  visit(element)
  for (const value of Object.values(element.props)) walk(value, visit)
}

function findAll(tree: unknown, predicate: (element: El) => boolean): El[] {
  const found: El[] = []
  walk(tree, (element) => {
    if (predicate(element)) found.push(element)
  })
  return found
}

/** 요소 트리의 글. 닫힌 확인창은 DOM에 그려지지 않으므로 글에 넣지 않는다 */
function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) {
    const element = node as El
    if (element.type === AlertDialog && element.props.open !== true) return ''
    return textOf(element.props.children)
  }
  return ''
}

/** 비동기 연쇄(fetch → JSON 읽기 → 상태 갱신)가 끝나기를 기다린다 */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function draw(): El {
  hooks.cursor = 0
  return UserTribeChangeForm(PROPS) as unknown as El
}

const selectNamed = (tree: El, label: string) =>
  findAll(
    tree,
    (e) => e.type === Select && findAll(e, (x) => x.type === SelectTrigger && x.props['aria-label'] === label).length > 0
  )[0]
const buttonText = (tree: El, label: string) => findAll(tree, (e) => e.type === 'button' && textOf(e) === label)[0]
const memoField = (tree: El) => findAll(tree, (e) => e.type === Textarea)[0]
const dialog = (tree: El) => findAll(tree, (e) => e.type === AlertDialog)[0]
const alerts = (tree: El) => findAll(tree, (e) => e.type === 'div' && e.props.role === 'alert').map(textOf)
const statuses = (tree: El) => findAll(tree, (e) => e.type === 'div' && e.props.role === 'status').map(textOf)

const chooseTribe = (tree: El, id: string) => (selectNamed(tree, '바꿀 트라이브').props.onValueChange as (v: string) => void)(id)
const chooseReason = (tree: El, value: string) => (selectNamed(tree, '사유').props.onValueChange as (v: string) => void)(value)
const typeMemo = (tree: El, value: string) => (memoField(tree).props.onChange as (e: { target: { value: string } }) => void)({ target: { value } })
const press = (element: El) => (element.props.onClick as () => unknown)()
/** 누르고, 이어지는 비동기 연쇄가 끝나기를 기다린다 */
const pressAndSettle = async (element: El) => {
  press(element)
  await settle()
}

// ─────────────────────────────────────────────────────────────────────────────
// fetch 모의
// ─────────────────────────────────────────────────────────────────────────────

/** `json`이 undefined면 본문이 JSON이 아닌 응답(서버 오류 페이지 등)이다 */
function fakeResponse(status: number, json?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => (json === undefined ? Promise.reject(new SyntaxError('not json')) : Promise.resolve(json)),
  } as unknown as Response
}

const previewBody = (missions: Array<{ id: string; title: string }>) => ({
  history: [],
  preview: { newTribeId: T2, cancelledMissions: missions },
})

const MISSIONS = [
  { id: 'm1', title: '아스팔트 챌린지' },
  { id: 'm2', title: '낭만 러닝 크루' },
]

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const postCalls = () => mocks.fetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
const getCalls = () => mocks.fetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method !== 'POST')

/** 미리 보기 GET은 `previewResponse`, 확정 POST는 `postResponse`를 돌려준다 */
function setFetch(opts: { previewResponse?: () => Promise<Response>; postResponse?: () => Promise<Response> }) {
  mocks.fetch.mockImplementation((_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? (opts.postResponse ?? (() => Promise.resolve(fakeResponse(200, { ok: true }))))()
      : (opts.previewResponse ?? (() => Promise.resolve(fakeResponse(200, previewBody(MISSIONS)))))()
  )
}

/** 바꿀 트라이브를 골라 미리 보기를 읽는다 */
async function pickTribe(id = T2): Promise<El> {
  chooseTribe(draw(), id)
  await settle()
  return draw()
}

/** 확정 조건을 모두 채운 상태(트라이브 T2, 사유 «유저가 잘못 골랐어요», 미리 보기 완료)로 간다 */
async function fillAll(): Promise<El> {
  await pickTribe()
  chooseReason(draw(), 'wrong_pick')
  return draw()
}

beforeEach(() => {
  hooks.store.length = 0
  hooks.cursor = 0
  mocks.router.refresh.mockReset()
  mocks.fetch.mockReset()
  setFetch({})
  vi.stubGlobal('fetch', mocks.fetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─────────────────────────────────────────────────────────────────────────────
// 시험
// ─────────────────────────────────────────────────────────────────────────────

describe('처음 상태', () => {
  it('바꿀 트라이브와 사유 선택 상자, 메모 입력, 잠긴 «트라이브 바꾸기» 버튼이 있고 확인창은 닫혀 있다', () => {
    const tree = draw()

    expect(selectNamed(tree, '바꿀 트라이브')).toBeDefined()
    expect(selectNamed(tree, '사유')).toBeDefined()
    expect(memoField(tree)).toBeDefined()
    expect(buttonText(tree, '트라이브 바꾸기').props.disabled).toBe(true)
    expect(dialog(tree).props.open).toBe(false)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('메모는 상한과 함께 보이고, «기타»가 아니면 선택이다', () => {
    const tree = draw()

    expect(memoField(tree).props.maxLength).toBe(200)
    expect(textOf(tree)).toContain('메모 (선택)')
    expect(textOf(tree)).toContain('0/200')
  })

  it('선택 상자에는 받은 트라이브와 사유가 그대로 들어 있다', () => {
    const tree = draw()
    const tribeOptions = findAll(selectNamed(tree, '바꿀 트라이브'), (e) => e.props.value !== undefined && typeof e.props.children === 'string')
    const reasonOptions = findAll(selectNamed(tree, '사유'), (e) => e.props.value !== undefined && typeof e.props.children === 'string')

    expect(tribeOptions.map((e) => e.props.children)).toEqual(['아스팔트 레인저', '숲속의 갱단'])
    expect(reasonOptions.map((e) => e.props.children)).toEqual(['유저가 잘못 골랐어요', '유저가 옮기길 원해요', '운영 정정', '기타'])
  })
})

describe('영향 미리 보기', () => {
  it('트라이브를 고르면 GET으로 읽고, 읽는 동안에는 «확인하고 있어요»를 보인다', async () => {
    const pending = deferred<Response>()
    setFetch({ previewResponse: () => pending.promise })

    chooseTribe(draw(), T2)
    const loading = draw()

    expect(getCalls()).toHaveLength(1)
    expect(getCalls()[0][0]).toBe(`/api/admin/users/${USER}/tribe?newTribeId=${T2}`)
    expect(textOf(loading)).toContain('취소되는 미션을 확인하고 있어요')
    expect(buttonText(loading, '트라이브 바꾸기').props.disabled).toBe(true)

    pending.resolve(fakeResponse(200, previewBody(MISSIONS)))
    await settle()
    expect(textOf(draw())).not.toContain('확인하고 있어요')
  })

  it('취소되는 미션이 있으면 «취소되는 미션 N개»와 이름 목록을 보인다', async () => {
    const tree = await pickTribe()
    const t = textOf(tree)

    expect(t).toContain('취소되는 미션 2개')
    expect(t).toContain('아스팔트 챌린지')
    expect(t).toContain('낭만 러닝 크루')
  })

  it('이름을 읽지 못한 미션(빈 이름)도 한 줄로 보인다', async () => {
    setFetch({ previewResponse: () => Promise.resolve(fakeResponse(200, previewBody([{ id: 'm1', title: '' }]))) })
    const tree = await pickTribe()

    expect(textOf(tree)).toContain('취소되는 미션 1개')
    expect(textOf(tree)).toContain('이름을 읽지 못한 미션')
  })

  it('취소되는 미션이 없으면 «취소되는 미션이 없어요»를 보인다', async () => {
    setFetch({ previewResponse: () => Promise.resolve(fakeResponse(200, previewBody([]))) })
    const tree = await pickTribe()

    expect(textOf(tree)).toContain('취소되는 미션이 없어요')
    expect(textOf(tree)).not.toContain('취소되는 미션 0개')
  })

  it('읽지 못하면(API 오류) 그 문구를 보이고 확정을 막는다 — 빈 목록으로 보이지 않는다', async () => {
    setFetch({
      previewResponse: () =>
        Promise.resolve(fakeResponse(500, { error: '트라이브 변경 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' })),
    })
    const tree = await pickTribe()
    chooseReason(tree, 'wrong_pick')
    const after = draw()

    expect(textOf(after)).toContain('트라이브 변경 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(textOf(after)).not.toContain('취소되는 미션이 없어요')
    expect(buttonText(after, '트라이브 바꾸기').props.disabled).toBe(true)
  })

  it('읽다가 네트워크 오류가 나면 기존 어드민 패턴의 문구를 보이고 확정을 막는다', async () => {
    mocks.fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const tree = await pickTribe()

    expect(textOf(tree)).toContain('네트워크 오류로 취소되는 미션을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
    expect(buttonText(tree, '트라이브 바꾸기').props.disabled).toBe(true)
  })

  it('응답 모양이 다르면(미리 보기 없음) 빈 목록이 아니라 읽지 못함이다', async () => {
    setFetch({ previewResponse: () => Promise.resolve(fakeResponse(200, { history: [] })) })
    const tree = await pickTribe()

    expect(textOf(tree)).toContain('취소되는 미션을 불러오지 못했어요')
    expect(textOf(tree)).not.toContain('취소되는 미션이 없어요')
  })

  it('«다시 불러오기»를 누르면 같은 트라이브로 다시 읽고, 성공하면 확정 조건이 풀린다', async () => {
    let calls = 0
    setFetch({
      previewResponse: () =>
        ++calls === 1
          ? Promise.resolve(fakeResponse(500, { error: '트라이브 변경 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }))
          : Promise.resolve(fakeResponse(200, previewBody(MISSIONS))),
    })
    const failed = await pickTribe()
    chooseReason(failed, 'wrong_pick')

    press(buttonText(draw(), '다시 불러오기'))
    await settle()
    const tree = draw()

    expect(getCalls()).toHaveLength(2)
    expect(textOf(tree)).toContain('취소되는 미션 2개')
    expect(buttonText(tree, '트라이브 바꾸기').props.disabled).toBe(false)
  })

  it('연달아 고르면 늦게 온 옛 응답이 새 선택의 결과를 덮지 않는다', async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    const queue = [first, second]
    setFetch({ previewResponse: () => queue.shift()!.promise })

    chooseTribe(draw(), T2)
    chooseTribe(draw(), T3)
    second.resolve(fakeResponse(200, previewBody([{ id: 'm9', title: '숲속 새벽 미션' }])))
    await settle()
    first.resolve(fakeResponse(200, previewBody(MISSIONS)))
    await settle()
    const tree = draw()

    expect(textOf(tree)).toContain('숲속 새벽 미션')
    expect(textOf(tree)).not.toContain('아스팔트 챌린지')
    expect(textOf(tree)).toContain('취소되는 미션 1개')
  })
})

describe('확정 조건', () => {
  it('바꿀 트라이브·사유·미리 보기가 모두 있어야 «트라이브 바꾸기»가 열린다', async () => {
    const picked = await pickTribe()
    expect(buttonText(picked, '트라이브 바꾸기').props.disabled).toBe(true) // 사유 없음

    chooseReason(picked, 'wrong_pick')
    expect(buttonText(draw(), '트라이브 바꾸기').props.disabled).toBe(false)
  })

  it('사유만 고르고 트라이브를 고르지 않으면 잠겨 있다', () => {
    chooseReason(draw(), 'wrong_pick')
    expect(buttonText(draw(), '트라이브 바꾸기').props.disabled).toBe(true)
  })

  it('«기타»를 고르면 메모가 필수가 되고, 비었거나 공백뿐이면 잠겨 있다', async () => {
    await pickTribe()
    chooseReason(draw(), 'other')
    const other = draw()

    expect(textOf(other)).toContain('메모 (필수)')
    expect(buttonText(other, '트라이브 바꾸기').props.disabled).toBe(true)

    typeMemo(other, '   ')
    expect(buttonText(draw(), '트라이브 바꾸기').props.disabled).toBe(true)

    typeMemo(draw(), '카톡으로 요청')
    expect(buttonText(draw(), '트라이브 바꾸기').props.disabled).toBe(false)
  })

  it('«기타»가 아닌 사유는 메모 없이도 열린다', async () => {
    const tree = await fillAll()
    expect(textOf(tree)).toContain('메모 (선택)')
    expect(buttonText(tree, '트라이브 바꾸기').props.disabled).toBe(false)
  })

  it('메모 글자 수를 상한과 함께 보인다', async () => {
    const tree = draw()
    typeMemo(tree, '가나다')
    expect(textOf(draw())).toContain('3/200')
  })
})

describe('확인창', () => {
  it('«트라이브 바꾸기»를 누르면 열리고, 누르기 전에는 POST가 없다', async () => {
    const tree = await fillAll()
    expect(dialog(tree).props.open).toBe(false)

    press(buttonText(tree, '트라이브 바꾸기'))
    const open = draw()

    expect(dialog(open).props.open).toBe(true)
    expect(postCalls()).toHaveLength(0)
  })

  it('옛 → 새 트라이브, 배지·잼·챕터 유지, 취소되는 미션 수, 알림, 되돌리는 법을 알린다', async () => {
    const tree = await fillAll()
    press(buttonText(tree, '트라이브 바꾸기'))
    const t = textOf(dialog(draw()))

    expect(t).toContain('트라이브를 바꿀까요?')
    expect(t).toContain('낭만 미식가 → 아스팔트 레인저')
    expect(t).toContain('이미 가진 배지·잼·챕터는 그대로예요.')
    expect(t).toContain('참가 중인 트라이브 미션 2개가 취소돼요.')
    expect(t).toContain('바꾼 뒤 유저에게 알림이 가요.')
    expect(t).toContain('되돌릴 때는 다시 바꾸면 돼요.')
  })

  it('취소되는 미션이 없으면 확인창에서도 «취소되는 미션이 없어요»라고 알린다', async () => {
    setFetch({ previewResponse: () => Promise.resolve(fakeResponse(200, previewBody([]))) })
    const tree = await fillAll()
    press(buttonText(tree, '트라이브 바꾸기'))
    const t = textOf(dialog(draw()))

    expect(t).toContain('취소되는 미션이 없어요')
    expect(t).not.toContain('미션 0개')
  })

  it('«취소»를 누르면 닫히고 입력은 그대로다', async () => {
    const tree = await fillAll()
    press(buttonText(tree, '트라이브 바꾸기'))
    press(buttonText(draw(), '취소'))
    const closed = draw()

    expect(dialog(closed).props.open).toBe(false)
    expect(selectNamed(closed, '바꿀 트라이브').props.value).toBe(T2)
    expect(selectNamed(closed, '사유').props.value).toBe('wrong_pick')
    expect(postCalls()).toHaveLength(0)
  })

  it('바깥을 눌러 닫으려는 요청(onOpenChange false)에도 닫힌다', async () => {
    const tree = await fillAll()
    press(buttonText(tree, '트라이브 바꾸기'))
    ;(dialog(draw()).props.onOpenChange as (open: boolean) => void)(false)

    expect(dialog(draw()).props.open).toBe(false)
  })
})

describe('확정(POST)', () => {
  async function openDialog(): Promise<void> {
    const tree = await fillAll()
    press(buttonText(tree, '트라이브 바꾸기'))
  }

  it('본문 { newTribeId, reasonCode }로 POST하고, 메모가 없으면 memo 키를 뺀다', async () => {
    await openDialog()
    await pressAndSettle(buttonText(draw(), '바꾸기'))

    expect(postCalls()).toHaveLength(1)
    const [url, init] = postCalls()[0] as [string, RequestInit]
    expect(url).toBe(`/api/admin/users/${USER}/tribe`)
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({ newTribeId: T2, reasonCode: 'wrong_pick' })
  })

  it('메모는 앞뒤 공백을 지워 함께 보낸다', async () => {
    await pickTribe()
    chooseReason(draw(), 'other')
    typeMemo(draw(), '  유저 요청 카톡  ')
    press(buttonText(draw(), '트라이브 바꾸기'))
    await pressAndSettle(buttonText(draw(), '바꾸기'))

    const [, init] = postCalls()[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ newTribeId: T2, reasonCode: 'other', memo: '유저 요청 카톡' })
  })

  it('성공이면 성공 문구를 보이고 양식을 비우고 확인창을 닫고 구역을 새로 읽는다(refresh 한 번)', async () => {
    setFetch({
      postResponse: () =>
        Promise.resolve(
          fakeResponse(200, { ok: true, changeId: 'c1', fromTribeId: 'f', toTribeId: T2, toTribeName: '아스팔트 레인저', cancelledMissions: MISSIONS })
        ),
    })
    await openDialog()
    await pressAndSettle(buttonText(draw(), '바꾸기'))
    const tree = draw()

    expect(statuses(tree)).toEqual(['트라이브를 바꿨어요. 취소된 미션은 2개예요.'])
    expect(alerts(tree)).toEqual([])
    expect(dialog(tree).props.open).toBe(false)
    expect(selectNamed(tree, '바꿀 트라이브').props.value).toBe('')
    expect(selectNamed(tree, '사유').props.value).toBe('')
    expect(memoField(tree).props.value).toBe('')
    expect(textOf(tree)).not.toContain('취소되는 미션')
    expect(buttonText(tree, '트라이브 바꾸기').props.disabled).toBe(true)
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1)
  })

  it('성공 응답에 취소 목록이 없으면 건수 없이 «트라이브를 바꿨어요.»만 보인다', async () => {
    setFetch({ postResponse: () => Promise.resolve(fakeResponse(200, { ok: true })) })
    await openDialog()
    await pressAndSettle(buttonText(draw(), '바꾸기'))

    expect(statuses(draw())).toEqual(['트라이브를 바꿨어요.'])
  })

  it('다음에 다른 트라이브를 고르면 성공 문구가 사라진다', async () => {
    await openDialog()
    await pressAndSettle(buttonText(draw(), '바꾸기'))
    expect(statuses(draw())).toHaveLength(1)

    chooseTribe(draw(), T3)
    await settle()
    expect(statuses(draw())).toEqual([])
  })

  describe.each([
    [409, '트라이브를 아직 고르지 않은 유저예요. 유저가 고르기 화면에서 직접 골라요.'],
    [409, '고를 수 없는 트라이브예요. 활성 상태인 트라이브인지 확인해 주세요.'],
    [409, '이미 이 트라이브를 고른 유저예요. 다른 트라이브를 골라 주세요.'],
    [400, '사유가 "기타"일 때는 메모를 적어 주세요'],
    [404, '해당 유저를 찾지 못했어요. 유저 UUID가 맞는지 확인해 주세요.'],
    [500, '트라이브를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.'],
  ])('%i 응답', (status, message) => {
    it(`API가 돌려준 문구 «${message}»를 그대로 보이고, 확인창을 닫고, 입력을 유지하고, 새로고침하지 않는다`, async () => {
      setFetch({ postResponse: () => Promise.resolve(fakeResponse(status, { error: message })) })
      await openDialog()
      await pressAndSettle(buttonText(draw(), '바꾸기'))
      const tree = draw()

      expect(alerts(tree)).toEqual([message])
      expect(statuses(tree)).toEqual([])
      expect(dialog(tree).props.open).toBe(false)
      expect(selectNamed(tree, '바꿀 트라이브').props.value).toBe(T2)
      expect(selectNamed(tree, '사유').props.value).toBe('wrong_pick')
      expect(mocks.router.refresh).not.toHaveBeenCalled()
    })
  })

  it('403은 영어 «Forbidden»을 그대로 보이지 않고 한국어 안내로 바꾼다', async () => {
    setFetch({ postResponse: () => Promise.resolve(fakeResponse(403, { error: 'Forbidden' })) })
    await openDialog()
    await pressAndSettle(buttonText(draw(), '바꾸기'))
    const tree = draw()

    expect(alerts(tree)).toEqual(['이 작업을 할 권한이 없어요. 어드민 계정으로 로그인했는지 확인해 주세요.'])
    expect(textOf(tree)).not.toContain('Forbidden')
    expect(mocks.router.refresh).not.toHaveBeenCalled()
  })

  it('본문이 JSON이 아닌 서버 오류는 상태 코드를 알리는 문구로 보인다', async () => {
    setFetch({ postResponse: () => Promise.resolve(fakeResponse(502)) })
    await openDialog()
    await pressAndSettle(buttonText(draw(), '바꾸기'))

    expect(alerts(draw())).toEqual(['트라이브를 바꾸지 못했어요. 서버가 502 오류로 응답했어요. 잠시 후 다시 시도해 주세요.'])
  })

  it('네트워크 오류는 기존 어드민 패턴의 문구로 보이고 입력을 유지한다', async () => {
    setFetch({ postResponse: () => Promise.reject(new TypeError('Failed to fetch')) })
    await openDialog()
    await pressAndSettle(buttonText(draw(), '바꾸기'))
    const tree = draw()

    expect(alerts(tree)).toEqual(['네트워크 오류로 트라이브를 바꾸지 못했어요. 연결을 확인하고 다시 시도해 주세요.'])
    expect(dialog(tree).props.open).toBe(false)
    expect(selectNamed(tree, '사유').props.value).toBe('wrong_pick')
    expect(mocks.router.refresh).not.toHaveBeenCalled()
  })

  it('실패한 뒤에도 잠금이 풀려 다시 시도할 수 있다', async () => {
    let calls = 0
    setFetch({
      postResponse: () =>
        ++calls === 1
          ? Promise.resolve(fakeResponse(500, { error: '트라이브를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.' }))
          : Promise.resolve(fakeResponse(200, { ok: true, cancelledMissions: [] })),
    })
    await openDialog()
    await pressAndSettle(buttonText(draw(), '바꾸기'))
    expect(buttonText(draw(), '트라이브 바꾸기').props.disabled).toBe(false)

    press(buttonText(draw(), '트라이브 바꾸기'))
    await pressAndSettle(buttonText(draw(), '바꾸기'))

    expect(postCalls()).toHaveLength(2)
    expect(alerts(draw())).toEqual([])
    expect(statuses(draw())).toEqual(['트라이브를 바꿨어요. 취소된 미션은 0개예요.'])
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1)
  })

  it('다시 시도하면 이전 오류 문구는 지워진다', async () => {
    let calls = 0
    setFetch({
      postResponse: () =>
        ++calls === 1
          ? Promise.resolve(fakeResponse(409, { error: '이미 이 트라이브를 고른 유저예요. 다른 트라이브를 골라 주세요.' }))
          : new Promise<Response>(() => {}),
    })
    await openDialog()
    await pressAndSettle(buttonText(draw(), '바꾸기'))
    expect(alerts(draw())).toHaveLength(1)

    press(buttonText(draw(), '트라이브 바꾸기'))
    press(buttonText(draw(), '바꾸기'))
    expect(alerts(draw())).toEqual([])
  })
})

describe('진행 중 잠금과 중복 제출 방지', () => {
  it('요청이 끝나기 전에는 입력·선택·버튼이 잠기고 확정 버튼은 «바꾸는 중»이다', async () => {
    const pending = deferred<Response>()
    setFetch({ postResponse: () => pending.promise })
    const tree = await fillAll()
    press(buttonText(tree, '트라이브 바꾸기'))
    press(buttonText(draw(), '바꾸기'))
    const locked = draw()

    expect(selectNamed(locked, '바꿀 트라이브').props.disabled).toBe(true)
    expect(selectNamed(locked, '사유').props.disabled).toBe(true)
    expect(memoField(locked).props.disabled).toBe(true)
    expect(buttonText(locked, '트라이브 바꾸기').props.disabled).toBe(true)
    const confirm = buttonText(locked, '바꾸는 중')
    expect(confirm.props.disabled).toBe(true)
    expect(buttonText(locked, '취소').props.disabled).toBe(true)

    pending.resolve(fakeResponse(200, { ok: true, cancelledMissions: [] }))
    await settle()
    expect(buttonText(draw(), '트라이브 바꾸기').props.disabled).toBe(true) // 양식이 비워져 다시 잠긴다
  })

  it('요청 중에 확정을 다시 눌러도 POST는 한 번뿐이다', async () => {
    const pending = deferred<Response>()
    setFetch({ postResponse: () => pending.promise })
    const tree = await fillAll()
    press(buttonText(tree, '트라이브 바꾸기'))
    const confirm = buttonText(draw(), '바꾸기')

    press(confirm)
    press(confirm) // 같은 틱에 한 번 더 — 상태가 갱신되기 전에도 막혀야 한다
    press(buttonText(draw(), '바꾸는 중')) // 다시 그린 뒤의 버튼도 막혀야 한다
    await settle()

    expect(postCalls()).toHaveLength(1)
    pending.resolve(fakeResponse(200, { ok: true, cancelledMissions: [] }))
    await settle()
    expect(postCalls()).toHaveLength(1)
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1)
  })

  it('요청 중에는 바깥을 눌러도 확인창이 닫히지 않는다', async () => {
    const pending = deferred<Response>()
    setFetch({ postResponse: () => pending.promise })
    const tree = await fillAll()
    press(buttonText(tree, '트라이브 바꾸기'))
    press(buttonText(draw(), '바꾸기'))
    ;(dialog(draw()).props.onOpenChange as (open: boolean) => void)(false)

    expect(dialog(draw()).props.open).toBe(true)

    pending.resolve(fakeResponse(200, { ok: true, cancelledMissions: [] }))
    await settle()
    expect(dialog(draw()).props.open).toBe(false)
  })

  it('조건이 안 맞는 상태에서 확정 핸들러가 불려도 POST하지 않는다', async () => {
    // 사유를 고르지 않아 «트라이브 바꾸기»가 잠긴 상태다. 확인창 안의 «바꾸기» 핸들러를 직접 불러도 POST하지 않는다
    await pickTribe()
    await pressAndSettle(buttonText(draw(), '바꾸기'))

    expect(postCalls()).toHaveLength(0)
  })
})
