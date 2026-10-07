/**
 * imageRender.client — 시간 제한·프리셋 읽기·서버 전용 import 금지 검증 (티켓 20261007_0945)
 * 실행: cd jam-web && npx vitest run src/lib/admin/opsInbox/__tests__/imageRender.client.test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { brandLetterJSvgMarkup, fetchPreset, renderPresetToPngBlob, withTimeout } from '../imageRender.client'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('withTimeout', () => {
  it('제한 안에 끝나면 값을 돌려준다', async () => {
    await expect(withTimeout(Promise.resolve(3), 100, '시간 초과')).resolves.toBe(3)
  })

  it('제한을 넘기면 던진다', async () => {
    vi.useFakeTimers()
    const pending = withTimeout(new Promise<number>(() => {}), 1000, '시간 초과')
    const assertion = expect(pending).rejects.toThrow('시간 초과')
    await vi.advanceTimersByTimeAsync(1001)
    await assertion
  })

  it('원래 작업이 실패하면 그 오류를 던진다', async () => {
    await expect(withTimeout(Promise.reject(new Error('원인')), 100, '시간 초과')).rejects.toThrow('원인')
  })
})

describe('fetchPreset', () => {
  it('프리셋 단건 API를 읽는다', async () => {
    const preset = { id: 'p', stageRatio: '1:1', layers: [] }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ preset }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchPreset('p')).resolves.toEqual(preset)
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/admin/asset-generator/presets/p')
  })

  it('404·500·모양 불량·네트워크 오류는 한국어 메시지로 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    await expect(fetchPreset('p')).rejects.toThrow('프리셋을 찾을 수 없어요.')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    await expect(fetchPreset('p')).rejects.toThrow('프리셋을 불러오지 못했어요')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"preset":{}}', { status: 200 })))
    await expect(fetchPreset('p')).rejects.toThrow('프리셋을 불러오지 못했어요')
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('x'))))
    await expect(fetchPreset('p')).rejects.toThrow('네트워크')
  })
})

describe('renderPresetToPngBlob', () => {
  it('글꼴 로드가 실패하면 PNG를 만들지 않고 던진다', async () => {
    const preset = {
      id: 'p',
      stageRatio: '1:1',
      layers: [
        {
          type: 'text',
          id: 'a',
          content: 'x',
          font: { family: 'Noto Sans KR', weight: 700 },
          sizePct: 10,
          letterSpacing: 0,
          lineHeight: 1.2,
          align: 'center',
          color: '#fff',
          xPct: 50,
          yPct: 50,
          rotationDeg: 0,
          opacityPct: 100,
        },
      ],
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ preset }), { status: 200 })))
    const canvas = {
      width: 1,
      height: 1,
      getContext: () =>
        new Proxy({} as Record<string, unknown>, {
          get: (target, prop: string) =>
            prop === 'createLinearGradient' || prop === 'createRadialGradient'
              ? () => ({ addColorStop: () => {} })
              : (target[prop] ?? (() => {})),
          set: (target, prop: string, value) => {
            target[prop] = value
            return true
          },
        }),
    }
    const deps = {
      canvasFactory: () => canvas as never,
      imageLoader: async () => canvas as never,
      fontLoader: async () => {
        throw new Error('폰트 시간 초과')
      },
      loadBase: async () => canvas as never,
    }
    await expect(renderPresetToPngBlob({ presetId: 'p', bg: '#000000', end: '#ffffff', seed: 1 }, deps)).rejects.toThrow(
      '폰트 시간 초과'
    )
  })
})

describe('브랜드 글자', () => {
  it('J 마크업은 어드민 화면과 같은 path를 쓴다', () => {
    const viewport = readFileSync(join(process.cwd(), 'src/app/admin/asset-generator/AssetGeneratorViewport.tsx'), 'utf8')
    const d = /<path d="([^"]+)"/.exec(brandLetterJSvgMarkup())![1]
    expect(viewport).toContain(d)
  })
})

describe('서버 전용 모듈을 가져오지 않는다', () => {
  const FILES = [
    'src/lib/admin/opsInbox/imageRender.client.ts',
    'src/lib/asset-generator/renderPreset.ts',
    'src/components/admin/ops/imageClient.ts',
  ]
  it.each(FILES)('%s', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8')
    const imports = source.split('\n').filter((line) => /^\s*(import|export)\b.*\bfrom\b/.test(line))
    for (const line of imports) {
      expect(line).not.toMatch(/opsInbox\/image['"]|scripts\/|serverCanvas|\.mjs|@napi-rs|supabase\/server|server-only/)
    }
  })
})
