import { useEffect, useRef } from 'react'

interface BackgroundEffectProps {
    liteMode?: boolean;
    style?: 'planetarium' | 'nebula';
}

export function BackgroundEffect({ liteMode = false, style = 'planetarium' }: BackgroundEffectProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        if (liteMode) return

        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        let animationFrameId: number
        let particles: Particle[] = [] // For Planetarium
        let nebulaClouds: NebulaCloud[] = []
        let stars: Star[] = []
        let shootingStars: ShootingStar[] = []
        let mouseX = 0
        let mouseY = 0

        // Canvas sizing
        const resizeCanvas = () => {
            canvas.width = window.innerWidth
            canvas.height = window.innerHeight
        }
        window.addEventListener('resize', resizeCanvas)
        resizeCanvas()

        // Mouse tracking
        const handleMouseMove = (e: MouseEvent) => {
            mouseX = e.clientX
            mouseY = e.clientY

            const { innerWidth, innerHeight } = window
            const x = (e.clientX / innerWidth - 0.5) * 2
            const y = (e.clientY / innerHeight - 0.5) * 2
            document.body.style.setProperty('--mouse-x', x.toString())
            document.body.style.setProperty('--mouse-y', y.toString())
        }
        window.addEventListener('mousemove', handleMouseMove)

        // --- Planetarium Logic ---
        class Particle {
            x: number
            y: number
            vx: number
            vy: number
            size: number
            alpha: number
            baseAlpha: number

            constructor() {
                this.x = Math.random() * canvas!.width
                this.y = Math.random() * canvas!.height
                this.vx = (Math.random() - 0.5) * 0.05
                this.vy = (Math.random() - 0.5) * 0.05
                this.size = Math.random() * 2 + 0.5
                this.baseAlpha = Math.random() * 0.3 + 0.1
                this.alpha = this.baseAlpha
            }

            update() {
                this.x += this.vx
                this.y += this.vy

                // Friction to prevent runaway acceleration
                this.vx *= 0.99
                this.vy *= 0.99

                // Keep min speed to prevent stopping completely
                if (Math.abs(this.vx) < 0.01) this.vx += (Math.random() - 0.5) * 0.005
                if (Math.abs(this.vy) < 0.01) this.vy += (Math.random() - 0.5) * 0.005

                if (this.x < 0) this.x = canvas!.width
                if (this.x > canvas!.width) this.x = 0
                if (this.y < 0) this.y = canvas!.height
                if (this.y > canvas!.height) this.y = 0

                const dx = mouseX - this.x
                const dy = mouseY - this.y
                const distance = Math.sqrt(dx * dx + dy * dy)
                const maxDist = 150

                if (distance < maxDist) {
                    const forceDirectionX = dx / distance
                    const forceDirectionY = dy / distance
                    const force = (maxDist - distance) / maxDist

                    this.vx -= forceDirectionX * force * 0.05
                    this.vy -= forceDirectionY * force * 0.05
                    this.alpha = Math.min(this.baseAlpha + 0.5, 0.8)
                } else {
                    this.alpha = Math.max(this.alpha - 0.02, this.baseAlpha)
                }
            }

            draw() {
                if (!ctx) return
                ctx.beginPath()
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
                ctx.fillStyle = `rgba(100, 200, 255, ${this.alpha})`
                ctx.fill()
            }
        }

        // --- Nebula Logic ---
        class NebulaCloud {
            x: number
            y: number
            radius: number
            color: string
            vx: number
            vy: number

            constructor() {
                this.x = Math.random() * canvas!.width
                this.y = Math.random() * canvas!.height
                this.radius = Math.random() * 300 + 200
                // Deep cosmic colors
                const colors = [
                    'rgba(76, 29, 149, 0.15)', // Indigo
                    'rgba(124, 58, 237, 0.12)', // Violet
                    'rgba(30, 64, 175, 0.15)', // Blue
                ]
                this.color = colors[Math.floor(Math.random() * colors.length)]
                this.vx = (Math.random() - 0.5) * 0.2
                this.vy = (Math.random() - 0.5) * 0.2
            }

            update() {
                this.x += this.vx
                this.y += this.vy

                // Wrap around
                if (this.x < -this.radius) this.x = canvas!.width + this.radius
                if (this.x > canvas!.width + this.radius) this.x = -this.radius
                if (this.y < -this.radius) this.y = canvas!.height + this.radius
                if (this.y > canvas!.height + this.radius) this.y = -this.radius
            }

            draw() {
                if (!ctx) return
                const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius)
                gradient.addColorStop(0, this.color)
                gradient.addColorStop(1, 'rgba(0,0,0,0)')

                ctx.fillStyle = gradient
                ctx.fillRect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2)
            }
        }

        class Star {
            x: number
            y: number
            size: number
            alpha: number
            targetAlpha: number
            speed: number

            constructor() {
                this.x = Math.random() * canvas!.width
                this.y = Math.random() * canvas!.height
                this.size = Math.random() * 1.5
                this.alpha = Math.random()
                this.targetAlpha = Math.random()
                this.speed = Math.random() * 0.02
            }

            update() {
                if (Math.abs(this.alpha - this.targetAlpha) < 0.01) {
                    this.targetAlpha = Math.random()
                } else {
                    this.alpha += (this.targetAlpha - this.alpha) * this.speed
                }
            }

            draw() {
                if (!ctx) return
                ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha})`
                ctx.beginPath()
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
                ctx.fill()
            }
        }

        class ShootingStar {
            x: number
            y: number
            length: number
            speed: number
            angle: number
            opacity: number
            active: boolean

            constructor() {
                this.active = false
                this.reset()
            }

            reset() {
                this.x = Math.random() * canvas!.width
                this.y = Math.random() * canvas!.height * 0.5
                this.length = Math.random() * 80 + 20
                this.speed = Math.random() * 10 + 10
                this.angle = Math.PI / 4 // 45 degrees
                this.opacity = 0
                this.active = false
            }

            spawn() {
                this.active = true
                this.opacity = 1
                this.x = Math.random() * canvas!.width * 0.5
                this.y = 0
            }

            update() {
                if (!this.active) {
                    if (Math.random() < 0.005) this.spawn() // 0.5% chance per frame
                    return
                }

                this.x += this.speed * Math.cos(this.angle)
                this.y += this.speed * Math.sin(this.angle)
                this.opacity -= 0.01

                if (this.opacity <= 0 || this.x > canvas!.width || this.y > canvas!.height) {
                    this.reset()
                }
            }

            draw() {
                if (!this.active || !ctx) return
                const tailX = this.x - this.length * Math.cos(this.angle)
                const tailY = this.y - this.length * Math.sin(this.angle)

                const gradient = ctx.createLinearGradient(this.x, this.y, tailX, tailY)
                gradient.addColorStop(0, `rgba(255, 255, 255, ${this.opacity})`)
                gradient.addColorStop(1, `rgba(255, 255, 255, 0)`)

                ctx.lineWidth = 2
                ctx.lineCap = 'round'
                ctx.strokeStyle = gradient
                ctx.beginPath()
                ctx.moveTo(this.x, this.y)
                ctx.lineTo(tailX, tailY)
                ctx.stroke()
            }
        }

        const initPlanetarium = () => {
            particles = []
            const particleCount = Math.min(window.innerWidth * 0.05, 60)
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Particle())
            }
        }

        const initNebula = () => {
            nebulaClouds = []
            stars = []
            shootingStars = []

            // Create Clouds
            for (let i = 0; i < 5; i++) {
                nebulaClouds.push(new NebulaCloud())
            }
            // Create Static Stars
            for (let i = 0; i < 100; i++) {
                stars.push(new Star())
            }
            // Create Shooting Stars
            for (let i = 0; i < 2; i++) {
                shootingStars.push(new ShootingStar())
            }
        }

        if (style === 'planetarium') initPlanetarium()
        if (style === 'nebula') initNebula()

        const animate = () => {
            if (!ctx || !canvas) return

            // Override clear to allow trails or just clear
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            if (style === 'planetarium') {
                particles.forEach((p, index) => {
                    p.update()
                    p.draw()
                    for (let j = index + 1; j < particles.length; j++) {
                        const p2 = particles[j]
                        const dx = p.x - p2.x
                        const dy = p.y - p2.y
                        const distance = Math.sqrt(dx * dx + dy * dy)
                        const connectDist = 120
                        if (distance < connectDist) {
                            ctx.beginPath()
                            ctx.strokeStyle = `rgba(100, 200, 255, ${0.15 * (1 - distance / connectDist)})`
                            ctx.lineWidth = 0.5
                            ctx.moveTo(p.x, p.y)
                            ctx.lineTo(p2.x, p2.y)
                            ctx.stroke()
                        }
                    }
                })
            } else if (style === 'nebula') {
                // Draw Stars
                stars.forEach(s => {
                    s.update()
                    s.draw()
                })
                // Draw Clouds
                ctx.globalCompositeOperation = 'screen'
                nebulaClouds.forEach(c => {
                    c.update()
                    c.draw()
                })
                ctx.globalCompositeOperation = 'source-over'
                // Draw Shooting Stars
                shootingStars.forEach(s => {
                    s.update()
                    s.draw()
                })
            }

            animationFrameId = requestAnimationFrame(animate)
        }
        animate()

        return () => {
            window.removeEventListener('resize', resizeCanvas)
            window.removeEventListener('mousemove', handleMouseMove)
            cancelAnimationFrame(animationFrameId)
        }
    }, [liteMode, style])

    if (liteMode) return null

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 z-0 pointer-events-none"
            style={{ mixBlendMode: 'screen' }}
        />
    )
}
