import express, { Request, Response, NextFunction } from 'express'
import path from 'path'
import http from 'http'
import { Server } from 'http'
import fs from 'fs'
import { app } from 'electron'
import { ConfigManager } from './config-manager'
import os from 'os'

export class EmbeddedServer {
  private app: express.Application
  private server: Server | null = null
  private port: number = 3001
  private sseClients: Map<any, any> = new Map()
  private sseCleanupInterval: NodeJS.Timeout | null = null
  private configManager: ConfigManager

  constructor(configManager: ConfigManager) {
    this.app = express()
    this.configManager = configManager
    this.setupMiddleware()
    this.setupRoutes()
    this.setupSSECleanup()
  }

  private getScoresPath(): string {
    return path.join(app.getPath('userData'), 'scores.json')
  }

  private getPlayerMappingPath(): string {
    return path.join(app.getPath('userData'), 'player-mappings.json')
  }

  private getReopenSlotsPath(): string {
    return path.join(app.getPath('userData'), 'reopen-slots.json')
  }

  private getOverlayColorsPath(): string {
    return path.join(app.getPath('userData'), 'overlay-colors.json')
  }

  private getPlayerScoresPath(): string {
    return path.join(app.getPath('userData'), 'player-scores.json')
  }

  private setupMiddleware(): void {
    // Static files for overlay
    // Packaged: resources/app/public
    // Dev: public
    const possibleStaticPaths = [
      path.join(app.getAppPath(), 'public'),
      path.join(process.cwd(), 'public'),
      path.join(__dirname, '../../public'),
      path.join(path.dirname(app.getPath('exe')), 'resources/app/public'),
      path.join(path.dirname(app.getPath('exe')), 'resources/app.asar/public')
    ]

    let staticPath = possibleStaticPaths.find(p => fs.existsSync(p)) || possibleStaticPaths[0]

    console.log(`[EmbeddedServer] Serving static files from: ${staticPath}`)

    this.app.use(express.static(staticPath))
    this.app.use(express.json({ limit: '50mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }))

    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*')
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
      next()
    })
  }

  private setupRoutes(): void {
    const serveOverlay = (req: Request, res: Response) => {
      const possiblePaths = [
        path.join(app.getAppPath(), 'public/overlay/index.html'),
        path.join(app.getAppPath(), 'out/renderer/overlay/index.html'),
        path.join(app.getAppPath(), 'overlay/index.html'),
        path.join(process.cwd(), 'public/overlay/index.html'),
        path.join(process.cwd(), 'overlay/index.html'),
        path.join(__dirname, '../../public/overlay/index.html'),
        path.join(__dirname, '../renderer/overlay/index.html'),
        // Additional paths for packaged app
        path.join(path.dirname(app.getPath('exe')), 'resources/app/public/overlay/index.html'),
        path.join(path.dirname(app.getPath('exe')), 'resources/app.asar/public/overlay/index.html')
      ]

      console.log(`[EmbeddedServer] Request for overlay: ${req.url}`)
      const overlayPath = possiblePaths.find(p => {
        const exists = fs.existsSync(p)
        if (exists) console.log(`[EmbeddedServer] Found overlay at: ${p}`)
        return exists
      })

      if (overlayPath) {
        res.sendFile(overlayPath)
      } else {
        console.error(`[EmbeddedServer] Overlay file not found. Tried:`, possiblePaths)
        res.status(404).send(`Overlay file not found. Tried ${possiblePaths.length} paths. Check logs.`)
      }
    }

    this.app.get('/', serveOverlay)
    this.app.get('/index.html', serveOverlay)
    this.app.get('/static', serveOverlay)
    this.app.get('/static/index.html', serveOverlay)
    this.app.get('/overlay', serveOverlay)
    this.app.get('/overlay/index.html', serveOverlay)

    // SSE Endpoint
    this.app.get('/api/scores/events', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders()

      const clientInfo = { lastPing: Date.now() }
      this.sseClients.set(res, clientInfo)

      // 接続直後に即座に現在のスコア状態を同期させるための通知を送る
      setTimeout(() => {
        try {
          res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)
        } catch (e) { }
      }, 100)

      req.on('close', () => {
        this.sseClients.delete(res)
      })
    })

    // Scores API
    this.app.get('/api/scores', (req: Request, res: Response) => {
      try {
        const scoresPath = this.getScoresPath()
        const metaPath = path.join(path.dirname(scoresPath), 'scores-meta.json')

        let scores = []
        let isOverallUpdate = false

        if (fs.existsSync(scoresPath)) {
          scores = JSON.parse(fs.readFileSync(scoresPath, 'utf8'))
        }

        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
            isOverallUpdate = meta.isOverallUpdate || false
            if (isOverallUpdate) {
              fs.writeFileSync(metaPath, JSON.stringify({ isOverallUpdate: false }, null, 2))
            }
          } catch (e) { }
        }

        const config = this.configManager.getConfig()
        const totalScores = scores.reduce((sum: number, team: any) => sum + (team.score || 0), 0)
        const remainingRaces = Math.max(0, Math.floor((984 - totalScores) / 82))

        res.json({
          scores,
          isOverallUpdate,
          remainingRaces: config.showRemainingRaces ? remainingRaces : null,
          showRemainingRaces: config.showRemainingRaces
        })
      } catch (error: any) {
        res.status(500).json({ error: error.message })
      }
    })

    this.app.post('/api/scores', (req, res) => {
      try {
        const scoresPath = this.getScoresPath()
        const metaPath = path.join(path.dirname(scoresPath), 'scores-meta.json')
        const scores = req.body
        const isOverallUpdate = req.query.isOverallUpdate === 'true'

        const scoreDir = path.dirname(scoresPath)
        if (!fs.existsSync(scoreDir)) fs.mkdirSync(scoreDir, { recursive: true })

        // 自チーム（マイプレイヤー）の手動設定を記憶
        const currentPlayer = Array.isArray(scores) ? scores.find((s: any) => s.isCurrentPlayer) : null
        if (currentPlayer) {
          const name = currentPlayer.name || currentPlayer.team
          if (name) {
            const selfPath = path.join(app.getPath('userData'), 'self-player.json')
            fs.writeFileSync(selfPath, JSON.stringify({ name, timestamp: new Date().toISOString() }))
          }
        }

        fs.writeFileSync(scoresPath, JSON.stringify(scores, null, 2))
        if (isOverallUpdate) {
          fs.writeFileSync(metaPath, JSON.stringify({ isOverallUpdate: true }, null, 2))
        }

        this.broadcastScoreUpdate()
        res.json({ success: true })
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message })
      }
    })

    this.app.post('/api/scores/reset', (_req, res) => {
      try {
        const scoresPath = this.getScoresPath()
        const mappingPath = this.getPlayerMappingPath()
        const playerScoresPath = this.getPlayerScoresPath()

        if (fs.existsSync(scoresPath)) fs.writeFileSync(scoresPath, JSON.stringify([], null, 2))
        if (fs.existsSync(mappingPath)) fs.writeFileSync(mappingPath, JSON.stringify({}, null, 2))
        if (fs.existsSync(playerScoresPath)) fs.writeFileSync(playerScoresPath, JSON.stringify({}, null, 2))

        const metaPath = path.join(path.dirname(scoresPath), 'scores-meta.json')
        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath)

        this.broadcastScoreUpdate()
        res.json({ success: true })
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // Config API
    this.app.get('/api/config', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.json(this.configManager.getConfig())
    })

    this.app.post('/api/config', (req: Request, res: Response) => {
      try {
        this.configManager.saveConfig(req.body)
        this.broadcastScoreUpdate('config-updated')
        res.json({ success: true })
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // Local IP API
    this.app.get('/api/localIp', (_req: Request, res: Response) => {
      const interfaces = os.networkInterfaces()
      let localIP = 'localhost'
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]!) {
          if (iface.family === 'IPv4' && !iface.internal) {
            localIP = iface.address
            break
          }
        }
      }
      res.json({ ip: localIP })
    })

    // Reopen Slots API
    this.app.get('/api/reopen-slots', (_req: Request, res: Response) => {
      try {
        const slotsPath = this.getReopenSlotsPath()
        if (fs.existsSync(slotsPath)) {
          res.json(JSON.parse(fs.readFileSync(slotsPath, 'utf8')))
        } else {
          res.json([])
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message })
      }
    })

    this.app.post('/api/reopen-slots', (req: Request, res: Response) => {
      try {
        const slotsPath = this.getReopenSlotsPath()
        let slots = []
        if (fs.existsSync(slotsPath)) {
          slots = JSON.parse(fs.readFileSync(slotsPath, 'utf8'))
        }

        const newSlot = req.body
        const index = slots.findIndex((s: any) => s.slotId === newSlot.slotId)
        if (index !== -1) {
          slots[index] = newSlot
        } else {
          slots.push(newSlot)
        }

        fs.writeFileSync(slotsPath, JSON.stringify(slots, null, 2))
        this.broadcastScoreUpdate()
        res.json({ success: true })
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message })
      }
    })

    this.app.delete('/api/reopen-slots/:slotId', (req: Request, res: Response) => {
      try {
        const slotId = parseInt(req.params.slotId)
        const slotsPath = this.getReopenSlotsPath()
        if (fs.existsSync(slotsPath)) {
          let slots = JSON.parse(fs.readFileSync(slotsPath, 'utf8'))
          slots = slots.filter((s: any) => s.slotId !== slotId)
          fs.writeFileSync(slotsPath, JSON.stringify(slots, null, 2))
          this.broadcastScoreUpdate()
          res.json({ success: true })
        } else {
          res.json({ success: true })
        }
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // Overlay Colors API
    this.app.get('/api/overlay-colors', (_req: Request, res: Response) => {
      try {
        const colorsPath = this.getOverlayColorsPath()
        let colors = { scoreEffectColor: '#22c55e', currentPlayerColor: '#fbbf24' }
        if (fs.existsSync(colorsPath)) {
          colors = { ...colors, ...JSON.parse(fs.readFileSync(colorsPath, 'utf8')) }
        }
        res.json(colors)
      } catch (error: any) {
        res.status(500).json({ error: error.message })
      }
    })

    this.app.post('/api/overlay-colors', (req: Request, res: Response) => {
      try {
        const colorsPath = this.getOverlayColorsPath()
        fs.writeFileSync(colorsPath, JSON.stringify(req.body, null, 2))
        this.broadcastScoreUpdate()
        res.json({ success: true })
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // Player Mapping API
    this.app.get('/api/player-mapping', (_req: Request, res: Response) => {
      try {
        const mappingPath = this.getPlayerMappingPath()
        if (fs.existsSync(mappingPath)) {
          res.json(JSON.parse(fs.readFileSync(mappingPath, 'utf8')))
        } else {
          res.json({})
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message })
      }
    })

    this.app.post('/api/player-mapping', (req: Request, res: Response) => {
      try {
        const mappingPath = this.getPlayerMappingPath()
        const mappingDir = path.dirname(mappingPath)
        if (!fs.existsSync(mappingDir)) fs.mkdirSync(mappingDir, { recursive: true })

        fs.writeFileSync(mappingPath, JSON.stringify(req.body, null, 2))
        this.broadcastScoreUpdate()
        res.json({ success: true })
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // Player Scores API
    this.app.get('/api/player-scores', (_req: Request, res: Response) => {
      try {
        const scoresPath = this.getPlayerScoresPath()
        if (fs.existsSync(scoresPath)) {
          res.json(JSON.parse(fs.readFileSync(scoresPath, 'utf8')))
        } else {
          res.json({})
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message })
      }
    })

    this.app.post('/api/player-scores', (req: Request, res: Response) => {
      try {
        const scoresPath = this.getPlayerScoresPath()
        fs.writeFileSync(scoresPath, JSON.stringify(req.body, null, 2))
        this.broadcastScoreUpdate()
        res.json({ success: true })
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message })
      }
    })
  }

  private setupSSECleanup(): void {
    this.sseCleanupInterval = setInterval(() => {
      this.broadcastScoreUpdate('ping')
    }, 30000)
  }

  public start(port: number = 3001): Promise<void> {
    this.port = port

    // Check if we should reset scores on start
    const config = this.configManager.getConfig()
    if (config.scoreSettings && config.scoreSettings.keepScoreOnRestart === false) {
      const scoresPath = this.getScoresPath()
      if (fs.existsSync(scoresPath)) {
        try {
          fs.writeFileSync(scoresPath, JSON.stringify([], null, 2))
          console.log('Scores reset on startup as per config')
        } catch (e) {
          console.error('Failed to reset scores on startup:', e)
        }
      }
    }

    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, '0.0.0.0', () => {
          console.log(`[EmbeddedServer] Running on http://localhost:${this.port}`)
          resolve()
        })

        this.server.on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            console.error(`[EmbeddedServer] Port ${this.port} is already in use.`)
            reject(new Error(`Port ${this.port} is already in use`))
          } else {
            console.error(`[EmbeddedServer] Failed to start:`, err)
            reject(err)
          }
        })
      } catch (error) {
        console.error(`[EmbeddedServer] Error during startup:`, error)
        reject(error)
      }
    })
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        if (this.sseCleanupInterval) clearInterval(this.sseCleanupInterval)
        this.server.close(() => {
          console.log('Embedded server stopped')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  public broadcastScoreUpdate(type: string = 'scores-updated'): void {
    const message = JSON.stringify({ type, timestamp: Date.now() })
    this.sseClients.forEach((clientInfo, res) => {
      try {
        res.write(`data: ${message}\n\n`)
      } catch (error) {
        console.error('Error sending SSE message:', error)
      }
    })
  }
}
