"use client"

import { useEffect, useRef, useState } from "react"
import p5 from "p5"
import { isMobile as isMobileDevice } from "react-device-detect"

type Renderer = p5 | p5.Graphics
type P5WithControls = p5 & {
  resetGame?: () => void
  activateGyro?: () => Promise<boolean>
  setIntroOverlay?: (value: boolean) => void
}
interface Obstacle {
  x: number
  y: number
  speed: number
  size: number
  drift: number
}

interface HudState {
  gameOver: boolean
  score: number
  bestScore: number
}

const BEST_SCORE_KEY = "p5-animation-best-score"

export default function P5Animation() {
  const containerRef = useRef<HTMLDivElement>(null)
  const p5InstanceRef = useRef<p5 | null>(null)
  const [hudState, setHudState] = useState<HudState>({ gameOver: false, score: 0, bestScore: 0 })
  const [hasStarted, setHasStarted] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!containerRef.current) return

    const readSessionBest = () => {
      try {
        const raw = sessionStorage.getItem(BEST_SCORE_KEY)
        const numeric = raw ? Number(raw) : 0
        return Number.isFinite(numeric) ? numeric : 0
      } catch (error) {
        console.warn("Unable to read session best score", error)
        return 0
      }
    }

    const writeSessionBest = (value: number) => {
      try {
        sessionStorage.setItem(BEST_SCORE_KEY, value.toString())
      } catch (error) {
        console.warn("Unable to persist session best score", error)
      }
    }

    const normalizeScore = (value: number) => {
      if (!Number.isFinite(value)) return 0
      return Number(value.toFixed(1))
    }

    let isMounted = true
    const updateHud = (partial: Partial<HudState>) => {
      if (!isMounted) return
      setHudState((prev) => ({ ...prev, ...partial }))
    }

    const initialBestScore = normalizeScore(readSessionBest())
    updateHud({ bestScore: initialBestScore })

    const sketch = (p: p5) => {
      const segments: Array<{ x: number; y: number; easeFactor: number }> = []
      const numSegments = 5
      let headImage: p5.Image | null = null
      let patternImage: p5.Image | null = null
      let gyroX = 0
      let gyroY = 0
      let useGyro = false
      let flowOffset = 0
      let maskBuffer: p5.Graphics | null = null
      let patternBuffer: p5.Graphics | null = null
      let yearImage: p5.Image | null = null
      let backgroundTexture: p5.Image | null = null
      let obstacleImage: p5.Image | null = null
      let gyroDebugText = ""
      let mouseDebugText = ""
      let introOverlayActive = true
      const obstacles: Obstacle[] = []
      let obstacleSpawnTimer = 0
      let nextObstacleDelay = 1200
      let score = 0
      let bestScore = initialBestScore
      let roundStartTime = 0
      let lastHudScore = -1
      let gameOver = false

      const getHeadAngle = () => {
        if (segments.length < 2) return 0
        const head = segments[0]
        const neck = segments[1]
        return Math.atan2(head.y - neck.y, head.x - neck.x)
      }

      const initSegments = (canvasWidth: number, canvasHeight: number) => {
        segments.length = 0
        for (let i = 0; i < numSegments; i += 1) {
          segments.push({
            x: canvasWidth / 2,
            y: canvasHeight / 2,
            easeFactor: 0.16 - i * 0.004,
          })
        }
      }

      const setupGyroSensor = () => {
        if (typeof DeviceOrientationEvent !== "undefined") {
          if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
            ;(DeviceOrientationEvent as any)
              .requestPermission()
              .then((response: string) => {
                if (response === "granted") {
                  window.addEventListener("deviceorientation", handleOrientation)
                  useGyro = true
                  console.log("Gyro permission granted; sensor active.")
                }
              })
              .catch((error: Error) => {
                console.error("Gyro permission denied:", error)
                console.log("Gyro permission denied; sensor inactive.")
              })
          } else {
            window.addEventListener("deviceorientation", handleOrientation)
            useGyro = true
          }
        }
      }

      const handleOrientation = (event: DeviceOrientationEvent) => {
        const beta = event.beta || 0
        const gamma = event.gamma || 0

        const clampedBeta = Math.max(-90, Math.min(90, beta))
        const clampedGamma = Math.max(-90, Math.min(90, gamma))

        gyroX = p.map(clampedGamma, -90, 90, 0, p.width)
        gyroY = p.map(clampedBeta, -90, 90, 0, p.height)
        gyroDebugText = `β:${clampedBeta.toFixed(1)} γ:${clampedGamma.toFixed(1)} | x:${gyroX.toFixed(1)} y:${gyroY.toFixed(1)}`
      }

      const drawFlowingLines = () => {
        p.stroke(255, 255, 255)
        p.strokeWeight(1)

        const spacing = 80 // 線の間隔
        const lineLength = 40 // 線の長さ
        const speed = introOverlayActive ? 0.18 : 0.5 // オーバーレイ時はゆっくり流す
        const miniLineCount = 4
        const miniSpacing = spacing / (miniLineCount + 1)
        const miniLength = lineLength * 0.6

        const normalizedOffset = flowOffset % spacing

        for (let y = -spacing; y < p.height + spacing; y += spacing) {
          const baseY = y + normalizedOffset
          p.line(0, baseY, lineLength, baseY)
          p.line(p.width - lineLength, baseY, p.width, baseY)

          for (let i = 1; i <= miniLineCount; i += 1) {
            const innerY = baseY + i * miniSpacing
            p.line(0, innerY, miniLength, innerY)
            p.line(p.width - miniLength, innerY, p.width, innerY)
          }
        }

        flowOffset += speed
      }

      const drawScreenTexture = () => {
        if (!backgroundTexture) return
        p.push()
        p.blendMode(p.SCREEN)
        p.imageMode(p.CENTER)
        p.tint(255, 180)

        const canvasAspect = p.width / p.height
        const textureAspect = backgroundTexture.width / backgroundTexture.height
        let drawWidth = p.width
        let drawHeight = p.height

        if (textureAspect > canvasAspect) {
          drawWidth = textureAspect * p.height
        } else {
          drawHeight = p.width / textureAspect
        }

        p.image(backgroundTexture, p.width / 2, p.height / 2, drawWidth, drawHeight)
        p.pop()
        p.noTint()
        p.blendMode(p.BLEND)
      }

      const spawnObstacle = () => {
        if (!obstacleImage) return
        const size = p.random(40, 80)
        obstacles.push({
          x: p.random(size / 2, p.width - size / 2),
          y: -size,
          speed: p.random(1.2, 2.4),
          size,
          drift: p.random(-0.4, 0.4),
        })
      }

      const resetGame = () => {
        obstacles.length = 0
        obstacleSpawnTimer = 0
        nextObstacleDelay = p.random(900, 1600)
        score = 0
        roundStartTime = p.millis()
        lastHudScore = -1
        gameOver = false
        initSegments(p.width, p.height)
        updateHud({ gameOver: false, score: 0, bestScore: normalizeScore(bestScore) })
      }

      const setIntroOverlayState = (value: boolean) => {
        introOverlayActive = value
        if (value) {
          obstacles.length = 0
        } else {
          obstacleSpawnTimer = 0
          nextObstacleDelay = p.random(900, 1600)
        }
      }

      ;(p as any).resetGame = resetGame
      ;(p as any).activateGyro = setupGyroSensor
      ;(p as any).setIntroOverlay = setIntroOverlayState

      const updateObstacles = () => {
        if (!obstacleImage || introOverlayActive) return

        if (!gameOver) {
          obstacleSpawnTimer += p.deltaTime
          if (obstacleSpawnTimer >= nextObstacleDelay) {
            spawnObstacle()
            obstacleSpawnTimer = 0
            nextObstacleDelay = p.random(900, 1600)
          }
        }

        const head = segments[0]
        const headRadius = 80

        p.push()
        p.imageMode(p.CENTER)
        p.tint(255, 220)

        for (let i = obstacles.length - 1; i >= 0; i -= 1) {
          const obstacle = obstacles[i]
          if (!gameOver) {
            obstacle.y += obstacle.speed
            obstacle.x += obstacle.drift
          }

          const imgWidth = obstacle.size * (obstacleImage.width / obstacleImage.height)
          p.image(obstacleImage, obstacle.x, obstacle.y, imgWidth, obstacle.size)

          if (!gameOver && head) {
            const distance = p.dist(head.x, head.y, obstacle.x, obstacle.y)
            const obstacleRadius = obstacle.size * 0.45
            if (distance < headRadius + obstacleRadius) {
              gameOver = true
              triggerVibration()
              const roundedScore = normalizeScore(score)
              score = roundedScore
              if (roundedScore > bestScore) {
                bestScore = roundedScore
                writeSessionBest(bestScore)
              }
              updateHud({ gameOver: true, score: roundedScore, bestScore: normalizeScore(bestScore) })
            }
          }

          if (!gameOver && obstacle.y - obstacle.size / 2 > p.height + 50) {
            obstacles.splice(i, 1)
          }
        }

        p.pop()
        p.noTint()
      }

      const triggerVibration = (pattern: number | number[] = 200) => {
        if (typeof window === "undefined") return
        const nav = window.navigator
        if (!nav?.vibrate) return
        nav.vibrate(pattern)
      }

      const drawBodyStroke = (
        renderer: Renderer,
        options: { color?: string; gradient?: boolean } = {},
      ) => {
        if (segments.length < 2) return

        const { color = "#FFB301", gradient = false } = options

        renderer.strokeWeight(320)
        renderer.strokeCap(p.ROUND)

        if (!gradient) {
          renderer.stroke(color)
          for (let i = segments.length - 1; i > 0; i -= 1) {
            const curr = segments[i]
            const prev = segments[i - 1]
            renderer.line(curr.x, curr.y, prev.x, prev.y)
          }
          return
        }

        const startColor = p.color("#f9c217")
        const endColor = p.color("#ff9e1f")
        const denom = Math.max(segments.length - 1, 1)

        for (let i = segments.length - 1; i > 0; i -= 1) {
          const t = 1 - i / denom
          const blend = p.lerpColor(startColor, endColor, t)

          renderer.stroke(blend)

          const curr = segments[i]
          const prev = segments[i - 1]
          renderer.line(curr.x, curr.y, prev.x, prev.y)
        }
      }

      p.preload = () => {
        headImage = p.loadImage(
          "/head.png",
          () => {},
          () => console.error("Failed to load /head.png"),
        )
        patternImage = p.loadImage(
          "/pattern.png",
          () => {},
          () => console.error("Failed to load /pattern.png"),
        )
        yearImage = p.loadImage(
          "/2025.png",
          () => {},
          () => console.error("Failed to load /2025.png"),
        )
        backgroundTexture = p.loadImage(
          "/noita-digital-zcx5ztIjQAM-unsplash.jpg",
          () => {},
          () => console.error("Failed to load /noita-digital-zcx5ztIjQAM-unsplash.png"),
        )
        obstacleImage = p.loadImage(
          "/2026.png",
          () => {},
          () => console.error("Failed to load /2026.png"),
        )
      }

      p.setup = () => {
        const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 800
        const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 600
        const canvasWidth = isMobileDevice ? viewportWidth : 800
        const canvasHeight = viewportHeight

        p.createCanvas(canvasWidth, canvasHeight)
        maskBuffer = p.createGraphics(canvasWidth, canvasHeight)
        patternBuffer = p.createGraphics(canvasWidth, canvasHeight)
        resetGame()
      }

      p.draw = () => {
        p.background("#ff7d76")
        drawScreenTexture()
        drawFlowingLines()

        if (!gameOver) {
          const elapsedSeconds = Math.max(0, (p.millis() - roundStartTime) / 1000)
          score = elapsedSeconds
          const roundedElapsed = normalizeScore(elapsedSeconds)
          if (roundedElapsed !== lastHudScore) {
            lastHudScore = roundedElapsed
            updateHud({ score: roundedElapsed })
          }
        }

        updateObstacles()

        if (!segments.length) return

        if (!gameOver) {
          let targetX: number
          let targetY: number

          if (useGyro) {
            targetX = gyroX
            targetY = gyroY
          } else {
            targetX = Number.isFinite(p.mouseX) && p.mouseX >= 0 ? p.mouseX : p.width / 2
            targetY = Number.isFinite(p.mouseY) && p.mouseY >= 0 ? p.mouseY : p.height / 2

            mouseDebugText = `mouse x:${targetX.toFixed(1)} y:${targetY.toFixed(1)} : gyroX ${gyroX} gyroY ${gyroY}`
          }

          segments[0].x += (targetX - segments[0].x) * segments[0].easeFactor
          segments[0].y += (targetY - segments[0].y) * segments[0].easeFactor

          for (let i = 1; i < segments.length; i += 1) {
            const prev = segments[i - 1]
            const curr = segments[i]

            curr.x += (prev.x - curr.x) * curr.easeFactor
            curr.y += (prev.y - curr.y) * curr.easeFactor
          }
        }

        drawBodyStroke(p, { gradient: true })

        // if (!gameOver && (useGyro || mouseDebugText || gyroDebugText)) {
        //   p.push()
        //   p.noStroke()
        //   p.fill(0, 0, 0, 120)
        //   const overlayHeight = !useGyro && gyroDebugText ? 72 : 48
        //   p.rect(16, 16, 360, overlayHeight, 8)
        //   p.fill(255)
        //   p.textSize(16)
        //   p.textAlign(p.LEFT, p.CENTER)
        //   const primaryText = useGyro
        //     ? gyroDebugText || "Waiting for gyro..."
        //     : mouseDebugText || "mouse inactive"
        //   p.text(primaryText, 32, 40)
        //   if (!useGyro && gyroDebugText) {
        //     p.textSize(14)
        //     p.fill(255, 220)
        //     p.text(gyroDebugText, 32, 64)
        //   }
        //   p.pop()
        // }

        if (headImage) {
          const imgW = 320
          const imgH = 324
          const wobble = Math.sin(p.frameCount * 0.08) * p.radians(4)
          const headAngle = getHeadAngle()

          const offsetRadius = 0
          const offsetX = Math.cos(headAngle) * offsetRadius
          const offsetY = Math.sin(headAngle) * offsetRadius

          p.push()
          p.translate(segments[0].x + offsetX, segments[0].y + offsetY)
          p.rotate(headAngle + wobble + p.HALF_PI)
          p.imageMode(p.CENTER)
          p.tint(255, 230)
          p.image(headImage, 0, 0, imgW, imgH)
          p.pop()
        }
      }

      p.windowResized = () => {
        const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 800
        const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 600
        const canvasWidth = isMobileDevice ? viewportWidth : 800
        const canvasHeight = viewportHeight
        p.resizeCanvas(canvasWidth, canvasHeight)
        initSegments(canvasWidth, canvasHeight)
        maskBuffer?.resizeCanvas(canvasWidth, canvasHeight)
        patternBuffer?.resizeCanvas(canvasWidth, canvasHeight)
      }

      const originalRemove = (p as any).remove?.bind(p)

      ;(p as any).remove = () => {
        if (typeof window !== "undefined") {
          window.removeEventListener("deviceorientation", handleOrientation)
        }
        originalRemove?.()
      }
    }

    const p5Instance = new p5(sketch, containerRef.current)
    p5InstanceRef.current = p5Instance

    return () => {
      isMounted = false
      p5Instance.remove()
    }
  }, [])

  const handleStartClick = async () => {
    const instance = p5InstanceRef.current as P5WithControls | null
    try {
      if (isMobileDevice) {
        console.log("Requesting gyro activation on start...")
        await instance?.activateGyro?.()
      } else {
        console.log("Non-mobile device detected; skipping gyro activation.")
      }
      instance?.resetGame?.()
    } finally {
      setHasStarted(true)
    }
  }

  const handleRetryClick = () => {
    const instance = p5InstanceRef.current as P5WithControls | null
    instance?.resetGame?.()
  }

  useEffect(() => {
    const instance = p5InstanceRef.current as P5WithControls | null
    instance?.setIntroOverlay?.(!hasStarted)
  }, [hasStarted])

  const formattedHudScore = hudState.score.toFixed(1)
  const formattedHudBest = hudState.bestScore.toFixed(1)

  return (
    <>
      <div className="relative h-screen w-full">
        <div ref={containerRef} className="mx-auto h-full w-full max-w-screen md:max-w-200" />
      {!hasStarted && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-12 text-center text-white bg-[#f5c70a]">
          <div className="space-y-2">
            <img
              src="/title.png"
              alt="Escape From 2026"
              className="mx-auto w-full title-pulse"
            />
          </div>
          <button
            type="button"
            onClick={handleStartClick}
            className="rounded-full bg-white px-12 py-3 text-lg font-bold uppercase tracking-[0.3em] text-black transition hover:bg-white/90"
          >
            Start
          </button>
        </div>
      )}
        {hudState.gameOver && (
          <div className="absolute inset-0 z-10 overflow-hidden">
            <div className="absolute inset-0">
              <img src="/newyear.gif" alt="New Year celebration" className="h-full w-full object-cover" />
              <div className="absolute inset-0 " />
            </div>
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 -translate-y-18">
              <img
                src="/newyear-title.png"
                alt="Happy New Year"
                className="happy-fade w-[60vw] object-contain drop-shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
              />
            </div>
            <div className="relative z-20 flex h-[calc(100vh-72px)] flex-col items-center justify-end gap-6 px-6 pb-16 text-center text-black">
              <div className="bg-white/30 backdrop-blur-sm rounded-md p-2">
                <p className="text-2xl font-bold tracking-[0.4em] ">GAME OVER</p>
                <p className="mt-2 text-lg text-black">
                  Score {formattedHudScore}s
                </p>
                <p className="text-sm text-black">
                  Best {formattedHudBest}s</p>
              </div>
              <button
                type="button"
                onClick={handleRetryClick}
                className="rounded-full bg-white px-12 py-3 text-lg font-semibold uppercase tracking-[0.3em] text-black transition hover:bg-white/90"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
        .happy-fade {
          opacity: 0;
          animation: happyFade 1.6s ease forwards 0.3s;
        }
        .title-pulse {
          animation: titlePulse 2s cubic-bezier(0.42, 0, 0.58, 1) infinite;
        }
        @keyframes happyFade {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes titlePulse {
          0% {
            transform: scale(0.96);
          }
          50% {
            transform: scale(1.04);
          }
          100% {
            transform: scale(0.96);
          }
        }
      `}</style>
    </>
  )
}
