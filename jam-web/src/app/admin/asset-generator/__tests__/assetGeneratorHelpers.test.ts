import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageLayerConfig, OverlayLayerConfig, TextLayerConfig } from '@/lib/asset-generator'
import {
  INITIAL_RIBBON_LAYER,
  buildExportFileName,
  buildFontLoadKey,
  buildGoogleFontWeightCssUrl,
  clampDurationSeconds,
  computeEffectiveStartColor,
  computeInitialImageWidthPct,
  createImageLayer,
  createTextLayer,
  deselectIfRemoved,
  generateRandomSeed,
  isSystemDefaultFont,
  loadFontInBrowser,
  moveImageLayer,
  removeImageLayer,
  resolveStageSize,
  SYSTEM_DEFAULT_FONT,
} from '../assetGeneratorHelpers'

function makeImageLayer(id: string, assetUrl = `blob:${id}`): ImageLayerConfig {
  return {
    type: 'image',
    id,
    assetUrl,
    xPct: 50,
    yPct: 50,
    widthPct: 30,
    rotationDeg: 0,
    opacityPct: 100,
  }
}

function makeTextLayer(id: string): TextLayerConfig {
  return {
    type: 'text',
    id,
    content: '',
    font: { ...SYSTEM_DEFAULT_FONT },
    sizePct: 10,
    letterSpacing: 0,
    lineHeight: 1.2,
    align: 'center',
    color: '#111111',
    xPct: 50,
    yPct: 50,
    rotationDeg: 0,
    opacityPct: 100,
  }
}

describe('resolveStageSize (티켓 20260924_2156, 원본 applyAspect 302줄과 동일해야 한다)', () => {
  it('1:1은 1280 × 1280', () => {
    expect(resolveStageSize('1:1')).toEqual({ width: 1280, height: 1280 })
  })

  it('4:5는 1024 × 1280', () => {
    expect(resolveStageSize('4:5')).toEqual({ width: 1024, height: 1280 })
  })

  it('9:16은 720 × 1280 (반올림)', () => {
    expect(resolveStageSize('9:16')).toEqual({ width: 720, height: 1280 })
  })
})

describe('computeEffectiveStartColor (PRD §6 컬러 규칙)', () => {
  it('연결이 켜져 있으면 배경색을 따른다', () => {
    expect(
      computeEffectiveStartColor({ linkStartToBackground: true, backgroundColor: '#111111', startColor: '#222222' })
    ).toBe('#111111')
  })

  it('연결이 꺼져 있으면 직접 고른 시작 색을 쓴다', () => {
    expect(
      computeEffectiveStartColor({ linkStartToBackground: false, backgroundColor: '#111111', startColor: '#222222' })
    ).toBe('#222222')
  })
})

describe('clampDurationSeconds (원본 readSeconds 515줄과 동일해야 한다)', () => {
  it('1~60 사이 값은 반올림만 한다', () => {
    expect(clampDurationSeconds(12.4)).toBe(12)
    expect(clampDurationSeconds(12.6)).toBe(13)
  })

  it('0 이하이거나 숫자가 아니면 기본값 5초', () => {
    expect(clampDurationSeconds(0)).toBe(5)
    expect(clampDurationSeconds(-3)).toBe(5)
    expect(clampDurationSeconds(Number.NaN)).toBe(5)
  })

  it('1보다 작으면 1로, 60보다 크면 60으로 자른다', () => {
    expect(clampDurationSeconds(0.2)).toBe(1)
    expect(clampDurationSeconds(120)).toBe(60)
  })
})

describe('generateRandomSeed', () => {
  it('주입한 난수 함수를 그대로 써서 0~1e9 사이 정수를 만든다', () => {
    expect(generateRandomSeed(() => 0)).toBe(0)
    expect(generateRandomSeed(() => 0.999999)).toBe(999999000)
  })
})

describe('buildExportFileName (원본 fileName 503줄과 동일해야 한다)', () => {
  it('비율의 콜론을 x로 바꾸고 타임스탬프·확장자를 붙인다', () => {
    const date = new Date(2026, 8, 24, 9, 5, 3) // 2026-09-24 09:05:03 (로컬 시각)
    expect(buildExportFileName('4:5', 'png', date)).toBe('jam-asset_4x5_20260924-090503.png')
  })
})

describe('INITIAL_RIBBON_LAYER (원본 state 초깃값 161~167줄과 값이 같아야 한다)', () => {
  it('기본값이 프로토타입과 일치한다', () => {
    expect(INITIAL_RIBBON_LAYER).toEqual({
      type: 'ribbon',
      source: { kind: 'letter', letter: 'J' },
      sizePct: 22,
      blurPct: 0,
      rotationDeg: 0,
      followPath: false,
      direction: 'h',
      backgroundColor: '#ff1a00',
      startColor: '#ff1a00',
      endColor: '#ff4dff',
      linkStartToBackground: true,
      irregularityPct: 35,
      seed: 7,
      speed: 1500,
      gap: 14,
      count: 260,
    })
  })
})

describe('createImageLayer (레이어 식별 재작업, 티켓 20260924_2157)', () => {
  it('빈 문자열이 아닌 id를 발급하고 order 필드는 없다', () => {
    const layer = createImageLayer('blob:a')
    expect(typeof layer.id).toBe('string')
    expect(layer.id.length).toBeGreaterThan(0)
    expect(layer).not.toHaveProperty('order')
  })

  it('원본 크기를 받으면 스테이지 짧은 변 대비 %로 환산해 widthPct에 넣고 heightPct는 없다', () => {
    const layer = createImageLayer('blob:a', { naturalWidth: 540, stageShortSide: 1080 })
    expect(layer.widthPct).toBe(50)
    expect(layer).not.toHaveProperty('heightPct')
    expect(layer.overlayEnabled).toBe(false)
    expect(layer.overlayColor).toBe('#ffffff')
  })

  it('원본 크기를 못 받으면 기본 30%로 시작한다', () => {
    expect(createImageLayer('blob:a').widthPct).toBe(30)
    expect(createImageLayer('blob:a', { naturalWidth: 0, stageShortSide: 1080 }).widthPct).toBe(30)
  })

  it('호출할 때마다 서로 다른 id를 발급한다', () => {
    const a = createImageLayer('blob:a')
    const b = createImageLayer('blob:a')
    expect(a.id).not.toBe(b.id)
  })
})

describe('moveImageLayer (id 기반 스왑, 티켓 20260924_2157 재작업)', () => {
  it('경계: 맨 위 레이어를 위로 이동하면 원본을 그대로 돌려준다', () => {
    const layers = [makeImageLayer('a'), makeImageLayer('b'), makeImageLayer('c')]
    const result = moveImageLayer(layers, 'a', 'up')
    expect(result).toBe(layers)
  })

  it('경계: 맨 아래 레이어를 아래로 이동하면 원본을 그대로 돌려준다', () => {
    const layers = [makeImageLayer('a'), makeImageLayer('b'), makeImageLayer('c')]
    const result = moveImageLayer(layers, 'c', 'down')
    expect(result).toBe(layers)
  })

  it('존재하지 않는 id는 원본을 그대로 돌려준다', () => {
    const layers = [makeImageLayer('a'), makeImageLayer('b')]
    const result = moveImageLayer(layers, 'z', 'up')
    expect(result).toBe(layers)
  })

  it('스왑: 맨 아래 레이어를 위로 이동하면 바로 위 레이어와 자리를 바꾼다', () => {
    const layers = [makeImageLayer('a'), makeImageLayer('b'), makeImageLayer('c')]
    const result = moveImageLayer(layers, 'c', 'up')
    expect(result.map((l) => l.id)).toEqual(['a', 'c', 'b'])
  })

  it('스왑 뒤에도 선택된 레이어는 같은 레이어 객체를 그대로 가리킨다', () => {
    // 재현(리뷰 재작업 사유): A·B·C 중 가운데 B(id='b')를 선택한 상태에서 맨 아래 C를 위로
    // 이동하면, 이전(인덱스 기반) 구현은 선택 인덱스 1이 이제 C를 가리켜 버그가 났다.
    // id 기반에서는 selectedId='b'가 배열 위치와 무관하므로 문제가 생기지 않는다.
    const b = makeImageLayer('b')
    const layers = [makeImageLayer('a'), b, makeImageLayer('c')]
    const selectedId = 'b'
    const result = moveImageLayer(layers, 'c', 'up')
    const selectedAfterMove = result.find((l) => l.id === selectedId)
    expect(selectedAfterMove).toBe(b)
  })
})

describe('removeImageLayer (순수 배열 제거, 티켓 20260924_2157 재작업)', () => {
  it('id가 일치하는 레이어만 제거한다', () => {
    const layers = [makeImageLayer('a'), makeImageLayer('b'), makeImageLayer('c')]
    const result = removeImageLayer(layers, 'b')
    expect(result.map((l) => l.id)).toEqual(['a', 'c'])
  })

  it('존재하지 않는 id를 지우려 하면 배열 내용이 그대로다', () => {
    const layers = [makeImageLayer('a')]
    const result = removeImageLayer(layers, 'z')
    expect(result.map((l) => l.id)).toEqual(['a'])
  })
})

describe('deselectIfRemoved (삭제된 레이어가 선택돼 있었으면 해제, 티켓 20260924_2157 재작업)', () => {
  it('삭제한 레이어가 선택돼 있었으면 선택을 해제한다', () => {
    expect(deselectIfRemoved('b', 'b')).toBeNull()
  })

  it('삭제한 레이어가 선택된 레이어가 아니면 선택을 그대로 둔다', () => {
    expect(deselectIfRemoved('b', 'c')).toBe('b')
  })

  it('아무것도 선택돼 있지 않았으면 그대로 null이다', () => {
    expect(deselectIfRemoved(null, 'c')).toBeNull()
  })
})

describe('createTextLayer (티켓 20260924_2158)', () => {
  it('빈 문자열이 아닌 id를 발급하고 글자 내용은 빈 문자열로 시작한다', () => {
    const layer = createTextLayer()
    expect(typeof layer.id).toBe('string')
    expect(layer.id.length).toBeGreaterThan(0)
    expect(layer.content).toBe('')
  })

  it('호출할 때마다 서로 다른 id를 발급한다', () => {
    const a = createTextLayer()
    const b = createTextLayer()
    expect(a.id).not.toBe(b.id)
  })

  it('기본 글꼴은 시스템 기본이다', () => {
    const layer = createTextLayer()
    expect(isSystemDefaultFont(layer.font)).toBe(true)
  })
})

describe('isSystemDefaultFont (티켓 20260924_2158)', () => {
  it('SYSTEM_DEFAULT_FONT의 family와 같으면 true', () => {
    expect(isSystemDefaultFont({ family: SYSTEM_DEFAULT_FONT.family })).toBe(true)
  })

  it('구글 폰트명이면 false', () => {
    expect(isSystemDefaultFont({ family: 'Roboto' })).toBe(false)
  })
})

describe('moveImageLayer·removeImageLayer (오버레이 혼합 목록 제네릭화, 티켓 20260924_2158 재작업)', () => {
  it('이미지·텍스트가 섞인 목록에서도 id로 이동한다', () => {
    const layers: OverlayLayerConfig[] = [makeImageLayer('img-a'), makeTextLayer('text-b'), makeImageLayer('img-c')]
    const result = moveImageLayer(layers, 'text-b', 'up')
    expect(result.map((l) => l.id)).toEqual(['text-b', 'img-a', 'img-c'])
  })

  it('이미지·텍스트가 섞인 목록에서도 id로 제거한다', () => {
    const layers: OverlayLayerConfig[] = [makeImageLayer('img-a'), makeTextLayer('text-b')]
    const result = removeImageLayer(layers, 'text-b')
    expect(result.map((l) => l.id)).toEqual(['img-a'])
    expect(result[0].type).toBe('image')
  })
})

describe('굵기 포함 구글 폰트 URL·키 (티켓 20260925_0148)', () => {
  it('요청한 굵기를 wght에 넣는다', () => {
    expect(buildGoogleFontWeightCssUrl({ family: 'Roboto', weight: 700 })).toBe(
      'https://fonts.googleapis.com/css2?family=Roboto:wght@700&display=swap'
    )
  })

  it('공백이 든 패밀리명은 +로, 특수문자는 인코딩한다', () => {
    expect(buildGoogleFontWeightCssUrl({ family: ' Noto Sans KR ', weight: 100 })).toBe(
      'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100&display=swap'
    )
    expect(buildGoogleFontWeightCssUrl({ family: 'M PLUS 1p', weight: 900 })).toContain('family=M+PLUS+1p:wght@900')
  })

  it('폰트 로드 키는 같은 패밀리라도 굵기가 다르면 달라진다', () => {
    expect(buildFontLoadKey({ family: 'Roboto', weight: 400 })).not.toBe(buildFontLoadKey({ family: 'Roboto', weight: 700 }))
    expect(buildFontLoadKey({ family: 'Roboto', weight: 700 })).toBe(buildFontLoadKey({ family: 'Roboto', weight: 700 }))
  })
})

describe('loadFontInBrowser 굵기 반영 (티켓 20260925_0148, 가짜 document)', () => {
  type Listener = () => void
  interface FakeLink {
    rel: string
    href: string
    sheet: object | null
    attrs: Record<string, string>
    listeners: Record<string, Listener[]>
    removed: boolean
    setAttribute(name: string, value: string): void
    getAttribute(name: string): string | undefined
    addEventListener(type: string, fn: Listener): void
    fire(type: string): void
    remove(): void
  }
  let links: FakeLink[]
  let fontsLoad: ReturnType<typeof vi.fn>
  let fontsCheck: ReturnType<typeof vi.fn>

  function makeLink(): FakeLink {
    const link: FakeLink = {
      rel: '',
      href: '',
      sheet: null,
      attrs: {},
      listeners: {},
      removed: false,
      setAttribute(name, value) {
        link.attrs[name] = value
      },
      getAttribute: (name) => link.attrs[name],
      addEventListener(type, fn) {
        ;(link.listeners[type] ??= []).push(fn)
      },
      fire(type) {
        if (type === 'load') link.sheet = {}
        ;(link.listeners[type] ?? []).forEach((fn) => fn())
      },
      remove() {
        link.removed = true
        links = links.filter((l) => l !== link)
      },
    }
    return link
  }

  beforeEach(() => {
    vi.useFakeTimers()
    links = []
    fontsLoad = vi.fn(async () => [])
    fontsCheck = vi.fn(() => true)
    vi.stubGlobal('document', {
      head: {
        querySelector: (selector: string) => {
          const match = /\[([\w-]+)="(.*)"\]$/.exec(selector)
          if (!match) return null
          return links.find((l) => l.attrs[match[1]] === match[2].replace(/\\"/g, '"')) ?? null
        },
        appendChild: (link: FakeLink) => {
          links.push(link)
        },
      },
      createElement: () => makeLink(),
      fonts: { load: fontsLoad, check: fontsCheck },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('굵기 700이면 wght@700 스타일시트를 삽입하고, 그 굵기로 로드·확인한다', async () => {
    const done = loadFontInBrowser({ family: 'Roboto', weight: 700 })
    expect(links).toHaveLength(1)
    expect(links[0].href).toBe('https://fonts.googleapis.com/css2?family=Roboto:wght@700&display=swap')
    links[0].fire('load')
    await done
    expect(fontsLoad).toHaveBeenCalledWith('700 16px "Roboto"')
    expect(fontsCheck).toHaveBeenCalledWith('700 16px "Roboto"')
  })

  it('같은 굵기는 <link>를 다시 만들지 않고, 다른 굵기는 별도로 삽입한다', async () => {
    const first = loadFontInBrowser({ family: 'Roboto', weight: 700 })
    links[0].fire('load')
    await first
    await loadFontInBrowser({ family: 'Roboto', weight: 700 }) // 이미 파싱된 시트라 바로 끝난다
    expect(links).toHaveLength(1)

    const other = loadFontInBrowser({ family: 'Roboto', weight: 400 })
    expect(links).toHaveLength(2)
    expect(links[1].href).toContain('wght@400')
    links[1].fire('load')
    await other
  })

  it('시스템 기본 글꼴은 아무것도 요청하지 않는다', async () => {
    await loadFontInBrowser({ family: SYSTEM_DEFAULT_FONT.family, weight: 700 })
    expect(links).toHaveLength(0)
    expect(fontsLoad).not.toHaveBeenCalled()
  })

  it('스타일시트 요청이 실패하면(그 굵기 파일이 없는 경우 포함) 굵기를 담은 오류로 끝나고 <link>를 지워 재시도할 수 있다', async () => {
    const failed = loadFontInBrowser({ family: 'Bungee', weight: 700 })
    const assertion = expect(failed).rejects.toThrow('굵기 700')
    links[0].fire('error')
    await assertion
    expect(links).toHaveLength(0)

    const retry = loadFontInBrowser({ family: 'Bungee', weight: 700 })
    expect(links).toHaveLength(1) // 새로 삽입된다
    links[0].fire('load')
    await retry
  })

  it('로드 뒤에도 그 굵기가 확인되지 않으면 오류로 끝난다', async () => {
    fontsCheck.mockReturnValue(false)
    const done = loadFontInBrowser({ family: 'Roboto', weight: 700 })
    const assertion = expect(done).rejects.toThrow('굵기 700')
    links[0].fire('load')
    await assertion
  })
})

describe('computeInitialImageWidthPct (티켓 20260926_1741)', () => {
  it('슬라이더 범위(1~200)로 제한한다', () => {
    expect(computeInitialImageWidthPct({ naturalWidth: 5000, stageShortSide: 1000 })).toBe(200)
    expect(computeInitialImageWidthPct({ naturalWidth: 1, stageShortSide: 1000 })).toBe(1)
  })

  it('값이 올바르지 않으면 null을 돌려준다', () => {
    expect(computeInitialImageWidthPct({ naturalWidth: -1, stageShortSide: 1000 })).toBeNull()
    expect(computeInitialImageWidthPct({ naturalWidth: 100, stageShortSide: 0 })).toBeNull()
  })
})
