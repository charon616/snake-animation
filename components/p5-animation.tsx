"use client"

import { useEffect, useRef } from "react"
import p5 from "p5"

type Renderer = p5 | p5.Graphics

export default function P5Animation() {
  const containerRef = useRef<HTMLDivElement>(null)
  const p5InstanceRef = useRef<p5 | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!containerRef.current) return

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
      let gyroDebugText = ""
      let mouseDebugText = ""
      let gyroPermissionHandler: (() => void) | null = null

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
        if (typeof window === "undefined") return
        if (typeof DeviceOrientationEvent === "undefined") return

        const enableGyro = () => {
          window.addEventListener("deviceorientation", handleOrientation)
          useGyro = true
          gyroDebugText = "Gyro active"
        }

        const requestPermission = (DeviceOrientationEvent as any).requestPermission
        if (typeof requestPermission === "function") {
          gyroDebugText = "Tap to enable gyro"
          const handlePermissionRequest = () => {
            requestPermission()
              .then((response: string) => {
                if (response === "granted") {
                  enableGyro()
                } else {
                  gyroDebugText = "Gyro permission denied"
                }
              })
              .catch((error: Error) => {
                console.error("Gyro permission denied:", error)
                gyroDebugText = "Gyro permission error"
              })
              .finally(() => {
                if (gyroPermissionHandler) {
                  window.removeEventListener("touchend", gyroPermissionHandler)
                  window.removeEventListener("click", gyroPermissionHandler)
                  gyroPermissionHandler = null
                }
              })
          }
          gyroPermissionHandler = handlePermissionRequest
          window.addEventListener("touchend", gyroPermissionHandler, { once: true })
          window.addEventListener("click", gyroPermissionHandler, { once: true })
        } else {
          enableGyro()
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
        p.stroke(255, 255, 255, 100)
        p.strokeWeight(1)

        const spacing = 50 // 線の間隔
        const lineLength = 40 // 線の長さを少し長く
        const speed = 1 // 流れる速さを遅くする

        const normalizedOffset = flowOffset % spacing

        for (let y = -spacing; y < p.height + spacing; y += spacing) {
          const yPos = y + normalizedOffset
          p.line(0, yPos, lineLength, yPos)
        }

        for (let y = -spacing; y < p.height + spacing; y += spacing) {
          const yPos = y + normalizedOffset
          p.line(p.width - lineLength, yPos, p.width, yPos)
        }

        flowOffset += speed
      }

      const drawBackdropYear = () => {
        if (!yearImage) return

        const longestSide = Math.max(p.width, p.height)
        const baseHeight = longestSide * 0.55
        const aspectRatio = yearImage.width / yearImage.height
        const imgW = baseHeight * aspectRatio
        const imgH = baseHeight
        const spacing = imgH * 1.1
        const normalizedOffset = flowOffset % spacing

        p.push()
        p.translate(p.width / 2, p.height / 2)
        p.imageMode(p.CENTER)
        p.tint(255, 70)

        for (let i = -1; i <= 1; i += 1) {
          const offsetY = i * spacing + normalizedOffset
          p.image(yearImage, 0, offsetY, imgW, imgH)
        }

        p.pop()
        p.noTint()
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
      }

      p.setup = () => {
        const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 800
        const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 600
        const isMobile = viewportWidth < 768
        const canvasWidth = isMobile ? viewportWidth : 800
        const canvasHeight = viewportHeight

        p.createCanvas(canvasWidth, canvasHeight)
        maskBuffer = p.createGraphics(canvasWidth, canvasHeight)
        patternBuffer = p.createGraphics(canvasWidth, canvasHeight)
        initSegments(canvasWidth, canvasHeight)

        if (isMobile) {
          setupGyroSensor()
        }
      }

      p.draw = () => {
        p.background("#ff7d76")

        drawBackdropYear()
        drawFlowingLines()

        if (!segments.length) return

        let targetX: number
        let targetY: number

        if (useGyro) {
          targetX = gyroX
          targetY = gyroY
        } else {
          targetX = Number.isFinite(p.mouseX) && p.mouseX >= 0 ? p.mouseX : p.width / 2
          targetY = Number.isFinite(p.mouseY) && p.mouseY >= 0 ? p.mouseY : p.height / 2
          mouseDebugText = `mouse x:${targetX.toFixed(1)} y:${targetY.toFixed(1)}`
        }

        segments[0].x += (targetX - segments[0].x) * segments[0].easeFactor
        segments[0].y += (targetY - segments[0].y) * segments[0].easeFactor

        for (let i = 1; i < segments.length; i += 1) {
          const prev = segments[i - 1]
          const curr = segments[i]

          curr.x += (prev.x - curr.x) * curr.easeFactor
          curr.y += (prev.y - curr.y) * curr.easeFactor
        }

        drawBodyStroke(p, { gradient: true })

        if (useGyro || mouseDebugText || gyroDebugText) {
          p.push()
          p.noStroke()
          p.fill(0, 0, 0, 120)
          const overlayHeight = !useGyro && gyroDebugText ? 72 : 48
          p.rect(16, 16, 360, overlayHeight, 8)
          p.fill(255)
          p.textSize(16)
          p.textAlign(p.LEFT, p.CENTER)
          const primaryText = useGyro
            ? gyroDebugText || "Waiting for gyro..."
            : mouseDebugText || "mouse inactive"
          p.text(primaryText, 32, 40)
          if (!useGyro && gyroDebugText) {
            p.textSize(14)
            p.fill(255, 220)
            p.text(gyroDebugText, 32, 64)
          }
          p.pop()
        }

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
        const isMobile = viewportWidth < 768
        const canvasWidth = isMobile ? viewportWidth : 800
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
          if (gyroPermissionHandler) {
            window.removeEventListener("touchend", gyroPermissionHandler)
            window.removeEventListener("click", gyroPermissionHandler)
            gyroPermissionHandler = null
          }
        }
        originalRemove?.()
      }
    }

    const p5Instance = new p5(sketch, containerRef.current)
    p5InstanceRef.current = p5Instance

    return () => {
      p5Instance.remove()
    }
  }, [])

  return <div ref={containerRef} className="w-full h-screen" />
}
