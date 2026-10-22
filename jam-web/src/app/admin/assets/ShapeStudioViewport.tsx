'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import {
  buildGlyphSdf,
  computeGeometry,
  FRAGMENT_SHADER,
  GRANGE,
  GT,
  hexToRgb,
  REF,
  VERTEX_SHADER,
  VIDEO_SEC,
  type GlyphDefinition,
  type ShapeStudioState,
} from './shapeStudioConfig'

export interface ShapeStudioViewportHandle {
  exportPng: (size: number) => Promise<void>
  recordVideo: (longSide: number) => Promise<void>
  cancelVideo: () => void
  resetMotionTime: () => void
}

interface ShapeStudioViewportProps {
  state: ShapeStudioState
  glyphsMap: Record<string, GlyphDefinition>
  canUndo: boolean
  onUndo: () => void
  onSavePreset: () => void
  onLoadPresetClick: () => void
  onDropShapeFile: (file: File) => void
  onStatusChange: (status: string) => void
  onExportBusyChange: (busy: boolean) => void
  onVideoRecordingChange: (recording: boolean, label: string) => void
}

type UniformMap = Record<string, WebGLUniformLocation | null>

function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a')
  const url = URL.createObjectURL(blob)
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function pickVideoType(): string {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  if (typeof window === 'undefined' || !('MediaRecorder' in window)) return ''
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

const ShapeStudioViewport = forwardRef<ShapeStudioViewportHandle, ShapeStudioViewportProps>(
  function ShapeStudioViewport(
    {
      state,
      glyphsMap,
      canUndo,
      onUndo,
      onSavePreset,
      onLoadPresetClick,
      onDropShapeFile,
      onStatusChange,
      onExportBusyChange,
      onVideoRecordingChange,
    },
    ref
  ) {
    const stageRef = useRef<HTMLDivElement | null>(null)
    const artWrapRef = useRef<HTMLDivElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)

    const glRef = useRef<WebGLRenderingContext | null>(null)
    const programRef = useRef<WebGLProgram | null>(null)
    const uniformsRef = useRef<UniformMap>({})
    const glyphTexRef = useRef<WebGLTexture | null>(null)
    const glyphTexKeyRef = useRef<string | null>(null)

    const stateRef = useRef<ShapeStudioState>(state)
    const glyphsMapRef = useRef<Record<string, GlyphDefinition>>(glyphsMap)
    const sdfCacheRef = useRef<Record<string, Uint8Array>>({})

    const timeRef = useRef(0)
    const motionOffsetRef = useRef(0)
    const lastStampRef = useRef(0)
    const rafIdRef = useRef<number | null>(null)
    const exportingRef = useRef(false)
    const recAbortRef = useRef(false)
    const forceAnimateRef = useRef(false)

    const [canvasMeta, setCanvasMeta] = useState('PREVIEW')
    const [glError, setGlError] = useState<string | null>(null)

    const compileShader = useCallback((gl: WebGLRenderingContext, type: number, src: string) => {
      const s = gl.createShader(type)
      if (!s) throw new Error('셰이더 생성에 실패했습니다.')
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(s) ?? '셰이더 컴파일 오류'
        gl.deleteShader(s)
        throw new Error(info)
      }
      return s
    }, [])

    const initGL = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const gl =
        glRef.current ??
        canvas.getContext('webgl', {
          alpha: true,
          antialias: false,
          preserveDrawingBuffer: true,
          premultipliedAlpha: false,
        })
      if (!gl) {
        throw new Error('이 브라우저에서 WebGL을 사용할 수 없습니다. 하드웨어 가속을 켠 뒤 다시 열어주세요.')
      }
      glRef.current = gl

      const prog = gl.createProgram()
      if (!prog) throw new Error('WebGL 프로그램 생성에 실패했습니다.')
      gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
      gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(prog) ?? 'WebGL 링크 오류')
      }
      gl.useProgram(prog)
      programRef.current = prog

      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      )
      const loc = gl.getAttribLocation(prog, 'position')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

      const U: UniformMap = {}
      const names = [
        'Res',
        'Count',
        'Scale',
        'Rot',
        'Blend',
        'Warp',
        'Time',
        'Soft',
        'Ext',
        'Dir',
        'Flow',
        'Shift',
        'Contour',
        'Rim',
        'Grain',
        'GrainPx',
        'Seed',
        'BgAngle',
        'RimC',
        'BgA',
        'BgB',
        'BgMode',
        'Mode',
        'SpanFull',
        'RangeW',
        'Sdf',
        'Metal',
        'Vivid',
      ]
      for (const n of names) {
        U[n] = gl.getUniformLocation(prog, `u${n}`)
      }
      U.Geo = gl.getUniformLocation(prog, 'uGeo[0]')
      U.Rad = gl.getUniformLocation(prog, 'uRad[0]')
      U.C = gl.getUniformLocation(prog, 'uC[0]')
      uniformsRef.current = U
      glyphTexRef.current = null
      glyphTexKeyRef.current = null
    }, [compileShader])

    const uploadGlyph = useCallback((k: string) => {
      const gl = glRef.current
      if (!gl || glyphTexKeyRef.current === k) return
      const data = buildGlyphSdf(k, glyphsMapRef.current, sdfCacheRef.current)
      if (!glyphTexRef.current) {
        glyphTexRef.current = gl.createTexture()
      }
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, glyphTexRef.current)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.LUMINANCE,
        GT,
        GT,
        0,
        gl.LUMINANCE,
        gl.UNSIGNED_BYTE,
        data
      )
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      glyphTexKeyRef.current = k
    }, [])

    const draw = useCallback(() => {
      const gl = glRef.current
      const prog = programRef.current
      const canvas = canvasRef.current
      if (!gl || !prog || !canvas) return

      const s = stateRef.current
      const U = uniformsRef.current
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(prog)

      const g = computeGeometry(s, glyphsMapRef.current)
      if (g.glyph && s.glyph) {
        uploadGlyph(s.glyph)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, glyphTexRef.current)
        gl.uniform1i(U.Sdf, 0)
        gl.uniform1f(U.SpanFull, g.spanFull ?? 1)
        gl.uniform1f(U.RangeW, (GRANGE / GT) * (g.spanFull ?? 1))
      }
      gl.uniform1i(U.Mode, g.glyph ? 1 : 0)
      gl.uniform2f(U.Res, canvas.width, canvas.height)
      gl.uniform1i(U.Count, s.segments.length)
      gl.uniform4fv(U.Geo, g.geo)
      gl.uniform4fv(U.Rad, g.rad)
      gl.uniform1f(U.Ext, Math.max(g.ext, 0.1))
      gl.uniform1f(U.Scale, s.scale / 100)
      gl.uniform1f(U.Rot, (s.rotation * Math.PI) / 180)
      gl.uniform1f(U.Blend, s.metaball ? (s.merge / (REF / 2)) * g.fit : 0)
      gl.uniform1f(U.Warp, s.warp / 100)
      gl.uniform1f(U.Time, timeRef.current)
      gl.uniform1f(U.Soft, s.soft / 100)
      gl.uniform1f(U.Dir, (s.direction * Math.PI) / 180)
      gl.uniform1f(U.Flow, s.flow / 100)
      gl.uniform1f(U.Shift, s.shift / 100 + motionOffsetRef.current)
      gl.uniform1f(U.Metal, s.metal / 100)
      gl.uniform1f(U.Vivid, s.vivid / 100)
      gl.uniform1f(U.Contour, s.contour / 100)
      gl.uniform1f(U.Rim, s.rim / 100)
      gl.uniform1f(U.Grain, s.grain / 100)
      gl.uniform1f(U.GrainPx, Math.max(1, Math.round(canvas.height / 700)))
      gl.uniform1f(U.Seed, s.seed)
      gl.uniform1f(U.BgAngle, (s.bgAngle * Math.PI) / 180)
      gl.uniform3fv(U.C, new Float32Array(s.colors.slice(0, 5).flatMap(hexToRgb)))
      gl.uniform3fv(U.RimC, new Float32Array(hexToRgb(s.colors[5])))
      gl.uniform3fv(U.BgA, new Float32Array(hexToRgb(s.bgA)))
      gl.uniform3fv(U.BgB, new Float32Array(hexToRgb(s.bgB)))
      gl.uniform1i(U.BgMode, { gradient: 0, solid: 1, transparent: 2 }[s.bgMode])
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }, [uploadGlyph])

    const renderLoop = useCallback(
      function loop(stamp: number) {
        rafIdRef.current = null
        const isAnimating = stateRef.current.animate || forceAnimateRef.current
        if (isAnimating) {
          if (lastStampRef.current) {
            const dt =
              (Math.min((stamp - lastStampRef.current) / 1000, 0.1) * stateRef.current.speed) / 100
            timeRef.current += dt
            motionOffsetRef.current += dt * 0.06
          }
          lastStampRef.current = stamp
        } else {
          lastStampRef.current = 0
        }
        draw()
        if (isAnimating) {
          rafIdRef.current = requestAnimationFrame(loop)
        }
      },
      [draw]
    )

    const requestDraw = useCallback(() => {
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(renderLoop)
      }
    }, [renderLoop])

    const resizeStage = useCallback(() => {
      if (exportingRef.current) return
      const st = stageRef.current
      const wrap = artWrapRef.current
      const canvas = canvasRef.current
      if (!st || !wrap || !canvas) return

      const [a, b] = stateRef.current.ratio.split(':').map(Number)
      const cs = getComputedStyle(st)
      const maxW =
        st.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0')
      const maxH =
        st.clientHeight - parseFloat(cs.paddingTop || '0') - parseFloat(cs.paddingBottom || '0')
      const w = Math.max(100, Math.min(maxW, (maxH * a) / b))
      const h = (w * b) / a
      wrap.style.width = `${Math.round(w)}px`
      wrap.style.height = `${Math.round(h)}px`
      const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      setCanvasMeta(`PREVIEW · ${stateRef.current.ratio} · ${Math.round(w)} × ${Math.round(h)}`)
      requestDraw()
    }, [requestDraw])

    useEffect(() => {
      const canvas = canvasRef.current
      const stage = stageRef.current
      if (!canvas || !stage) return

      try {
        initGL()
        setGlError(null)
        onStatusChange('실시간 렌더링')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'WebGL 초기화 실패'
        setGlError(msg)
        onStatusChange('WebGL 사용할 수 없음')
      }

      const handleContextLost = (e: Event) => {
        e.preventDefault()
        programRef.current = null
        onStatusChange('GPU 연결 중단')
      }
      const handleContextRestored = () => {
        try {
          initGL()
          setGlError(null)
          onStatusChange('실시간 렌더링')
          requestDraw()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'WebGL 복구 실패'
          setGlError(msg)
        }
      }

      canvas.addEventListener('webglcontextlost', handleContextLost)
      canvas.addEventListener('webglcontextrestored', handleContextRestored)

      const ro = new ResizeObserver(() => resizeStage())
      ro.observe(stage)
      resizeStage()

      return () => {
        ro.disconnect()
        canvas.removeEventListener('webglcontextlost', handleContextLost)
        canvas.removeEventListener('webglcontextrestored', handleContextRestored)
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current)
          rafIdRef.current = null
        }
      }
    }, [initGL, onStatusChange, requestDraw, resizeStage])

    useEffect(() => {
      stateRef.current = state
      glyphsMapRef.current = glyphsMap
      resizeStage()
      requestDraw()
    }, [state, glyphsMap, resizeStage, requestDraw])

    useImperativeHandle(
      ref,
      () => ({
        resetMotionTime: () => {
          timeRef.current = 0
          motionOffsetRef.current = 0
          lastStampRef.current = 0
          requestDraw()
        },
        exportPng: async (size: number) => {
          const gl = glRef.current
          const prog = programRef.current
          const canvas = canvasRef.current
          if (!gl || !prog || !canvas || exportingRef.current) return

          exportingRef.current = true
          onExportBusyChange(true)
          try {
            const max = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number
            if (size > max) {
              throw new Error(`이 기기의 최대 출력 크기는 ${max}px입니다.`)
            }
            const [a, b] = stateRef.current.ratio.split(':').map(Number)
            const w = a >= b ? size : Math.round((size * a) / b)
            const h = a >= b ? Math.round((size * b) / a) : size
            const ow = canvas.width
            const oh = canvas.height
            let blob: Blob | null = null
            try {
              canvas.width = w
              canvas.height = h
              draw()
              if (gl.getError() !== gl.NO_ERROR) {
                throw new Error('GPU 출력에 실패했습니다. 더 작은 크기로 시도해주세요.')
              }
              blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
              if (!blob) throw new Error('PNG 생성에 실패했습니다.')
            } finally {
              canvas.width = ow
              canvas.height = oh
              draw()
            }
            downloadBlob(blob, `shape-studio-${Date.now()}.png`)
            toast(`${w} × ${h} PNG 저장 완료`)
          } catch (err) {
            toast(err instanceof Error ? err.message : 'PNG 저장에 실패했습니다.')
          } finally {
            exportingRef.current = false
            onExportBusyChange(false)
          }
        },
        recordVideo: async (longSide: number) => {
          const gl = glRef.current
          const prog = programRef.current
          const canvas = canvasRef.current
          if (!gl || !prog || !canvas || exportingRef.current) return

          const canvasWithStream = canvas as HTMLCanvasElement & {
            captureStream?: (frameRate?: number) => MediaStream
          }
          if (typeof window === 'undefined' || !('MediaRecorder' in window) || !canvasWithStream.captureStream) {
            toast('이 브라우저는 동영상 저장을 지원하지 않아요. Chrome에서 열어주세요.')
            return
          }
          const type = pickVideoType()
          if (!type) {
            toast('지원되는 동영상 형식이 없어요.')
            return
          }

          exportingRef.current = true
          recAbortRef.current = false
          onExportBusyChange(true)
          onVideoRecordingChange(true, `녹화 중 0 / ${VIDEO_SEC}초`)

          const [a, b] = stateRef.current.ratio.split(':').map(Number)
          let w = a >= b ? longSide : Math.round((longSide * a) / b)
          let h = a >= b ? Math.round((longSide * b) / a) : longSide
          w -= w % 2
          h -= h % 2

          const prev = {
            w: canvas.width,
            h: canvas.height,
            time: timeRef.current,
            motion: motionOffsetRef.current,
          }

          const chunks: BlobPart[] = []
          let stream: MediaStream | null = null
          let timer: ReturnType<typeof setInterval> | null = null

          try {
            forceAnimateRef.current = true
            timeRef.current = 0
            motionOffsetRef.current = 0
            lastStampRef.current = 0
            canvas.width = w
            canvas.height = h
            requestDraw()

            stream = canvasWithStream.captureStream(30)
            const recorder = new MediaRecorder(stream, {
              mimeType: type,
              videoBitsPerSecond: Math.round(w * h * 30 * 0.14),
            })
            recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) chunks.push(e.data)
            }
            const done = new Promise<void>((res) => {
              recorder.onstop = () => res()
            })
            recorder.start(500)
            const t0 = performance.now()
            await new Promise<void>((res) => {
              timer = setInterval(() => {
                const el = (performance.now() - t0) / 1000
                onVideoRecordingChange(
                  true,
                  `녹화 중 ${Math.min(VIDEO_SEC, Math.floor(el))} / ${VIDEO_SEC}초`
                )
                if (el >= VIDEO_SEC || recAbortRef.current) {
                  if (timer) clearInterval(timer)
                  res()
                }
              }, 200)
            })
            recorder.stop()
            await done

            if (recAbortRef.current) {
              toast('녹화를 취소했어요.')
            } else {
              const blob = new Blob(chunks, { type: type.split(';')[0] })
              if (!blob.size) throw new Error('녹화된 영상이 비어 있어요.')
              const isMp4 = type.startsWith('video/mp4')
              downloadBlob(blob, `shape-studio-${Date.now()}${isMp4 ? '.mp4' : '.webm'}`)
              toast(`${w} × ${h} · ${VIDEO_SEC}초 ${isMp4 ? 'MP4' : 'WebM'} 저장 완료`)
            }
          } catch (err) {
            toast(err instanceof Error ? err.message : '동영상 저장에 실패했어요.')
          } finally {
            if (timer) clearInterval(timer)
            if (stream) stream.getTracks().forEach((t) => t.stop())
            forceAnimateRef.current = false
            timeRef.current = prev.time
            motionOffsetRef.current = prev.motion
            canvas.width = prev.w
            canvas.height = prev.h
            exportingRef.current = false
            onExportBusyChange(false)
            onVideoRecordingChange(false, `동영상 저장 (${VIDEO_SEC}초)`)
            resizeStage()
            requestDraw()
          }
        },
        cancelVideo: () => {
          recAbortRef.current = true
        },
      }),
      [draw, onExportBusyChange, onVideoRecordingChange, requestDraw, resizeStage]
    )

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault()
      }
    }

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return
      e.preventDefault()
      onDropShapeFile(e.dataTransfer.files[0])
    }

    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#eceeea]">
        <div className="flex items-center justify-between gap-3 px-6 py-4">
          <span className="text-[11px] tracking-[0.3px] text-[#7f8582]">{canvasMeta}</span>
        </div>

        <div
          ref={stageRef}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDrop={handleDrop}
          className="flex min-h-[150px] flex-1 items-center justify-center overflow-hidden px-[30px] pt-1.5 pb-[18px]"
        >
          <div
            ref={artWrapRef}
            className="relative overflow-hidden rounded-[14px] bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)]"
            style={{
              backgroundImage:
                'linear-gradient(45deg,#e5e8e1 25%,transparent 25%),linear-gradient(-45deg,#e5e8e1 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e8e1 75%),linear-gradient(-45deg,transparent 75%,#e5e8e1 75%)',
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0,0 10px,10px -10px,-10px 0',
            }}
          >
            <canvas
              ref={canvasRef}
              aria-label="실시간 그라데이션 쉐입 미리보기"
              className="block h-full w-full"
            />
            {glError && (
              <div className="absolute inset-0 bg-[#f8f9f6] p-8 text-[#8b312f] break-keep wrap-break-word">
                {glError}
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 px-6 pb-[18px] text-[11px] text-[#7f8582]">
          <span className="hidden sm:inline break-keep wrap-break-word">
            <kbd className="mr-1 rounded border border-[#cdd4c9] bg-[#fafcf7] px-1.5 py-0.5 text-[10px]">
              Space
            </kbd>
            랜덤 &nbsp;
            <kbd className="mr-1 rounded border border-[#cdd4c9] bg-[#fafcf7] px-1.5 py-0.5 text-[10px]">
              ⌘/Ctrl Z
            </kbd>
            되돌리기
          </span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canUndo}
              onClick={onUndo}
              className="h-7 px-2.5 text-[11px] whitespace-nowrap"
            >
              되돌리기
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSavePreset}
              className="h-7 px-2.5 text-[11px] whitespace-nowrap"
            >
              설정 저장
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onLoadPresetClick}
              className="h-7 px-2.5 text-[11px] whitespace-nowrap"
            >
              불러오기
            </Button>
          </div>
        </footer>
      </div>
    )
  }
)

export default ShapeStudioViewport
