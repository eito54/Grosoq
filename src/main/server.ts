import express, { Request, Response, NextFunction } from 'express'
import path from 'path'
import http from 'http'
import fsp from 'fs/promises'
import fs from 'fs'
import { app } from 'electron'
import { ConfigManager, Config } from './config-manager'
import os from 'os'

/** MK8DX 1レースの合計配点 (15+12+10+9+8+7+6+5+4+3+2+1) */
export const POINTS_PER_RACE = 82
/** 1バトルの最大レース数 */
export const MAX_RACES = 12

/**
 * オーバーレイに公開してよい設定のみを抽出する。
 * APIキーやOBSパスワードなどのシークレットは絶対に含めない。
 */
function sanitizeConfigForOverlay(config: Config) {
  return {
    overlayTheme: config.overlayTheme,
    overlayColors: config.overlayColors,
    overlayAnimations: config.overlayAnimations,
    showRemainingRaces: config.showRemainingRaces
  }
}

/** ブラウザからのアクセスを許可するオリジン（Electron本体とローカルページのみ） */
const ALLOWED_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

export class EmbeddedServer {
  private expressApp: express.Application
  private server: http.Server | null = null
  private port: number = 3001
  private sseClients: Set<http.ServerResponse> = new Set()
  private sseCleanupInterval: NodeJS.Timeout | null = null
  private configManager: ConfigManager

  constructor(configManager: ConfigManager) {
    this.expressApp = express()
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

  private getPlayerScoresPath(): string {
    return path.join(app.getPath('userData'), 'player-scores.json')
  }

  private getReconnectOffsetsPath(): string {
    return path.join(app.getPath('userData'), 'reconnect-offsets.json')
  }

  /** JSONファイルを読む。存在しない/壊れている場合はnull */
  private async readJson<T>(filePath: string): Promise<T | null> {
    try {
      return JSON.parse(await fsp.readFile(filePath, 'utf8')) as T
    } catch {
      return null
    }
  }

  /** JSONファイルを書く（ディレクトリも自動作成）。tmp→renameでアトミックに書く */
  private async writeJson(filePath: string, data: unknown): Promise<void> {
    await fsp.mkdir(path.dirname(filePath), { recursive: true })
    const tmpPath = `${filePath}.tmp`
    await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2))
    // Windows では rename が既存ファイルを置換できないことがあるため先に削除
    try {
      await fsp.rename(tmpPath, filePath)
    } catch {
      await fsp.rm(filePath, { force: true })
      await fsp.rename(tmpPath, filePath)
    }
  }

  private setupMiddleware(): void {
    // Static files for overlay
    // Packaged: resources/app/public
    // Dev: public
    const possibleStaticPaths = [
      path.join(app.getAppPath(), 'public'),
      path.join(process.cwd(), 'public'),
      path.join(__dirname, '../../public')
    ]

    const staticPath = possibleStaticPaths.find(p => fs.existsSync(p)) || possibleStaticPaths[0]

    console.log(`[EmbeddedServer] Serving static files from: ${staticPath}`)

    this.expressApp.use(express.static(staticPath))
    // スコアデータは小さいため十分な上限。巨大ボディでのDoSを避けるため50mbから引き下げ。
    this.expressApp.use(express.json({ limit: '2mb' }))

    this.expressApp.disable('x-powered-by')

    // DNSリバンディング対策: Hostヘッダーが localhost 系のリクエストのみ受け付ける。
    // （悪意あるドメインが 127.0.0.1 に解決された場合、ブラウザからのリクエストは
    // 同一オリジン扱いになってしまうため、Origin検査だけでは防げない）
    const HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i
    this.expressApp.use((req: Request, res: Response, next: NextFunction) => {
      const host = req.headers.host || ''
      if (!HOST_RE.test(host)) {
        res.status(403).json({ error: 'Forbidden host' })
        return
      }
      next()
    })

    // オリジン制限付きCORS。
    // サーバー自体がlocalhostバインドのため外部から到達できないが、
    // 同一マシン上の悪意あるWebページがブラウザ経由でAPIを叩くのを防ぐ（ドラッグバイ防御）。
    this.expressApp.use((req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin
      const originAllowed = origin === undefined || ALLOWED_ORIGIN_RE.test(origin)
      // 本番パッケージのレンダラーは file:// (Origin: null) から叩くため 'null' も許可。
      // ただしブラウザのfile://ページも 'null' になり得るので、状態変更リクエストでは
      // 可能な限り実オリジンを要求する（下述の403判定は 'null' を除外しない）。
      const method = req.method.toUpperCase()
      const isStateChange = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS'

      if (isStateChange && origin !== undefined && !(origin === 'null' || ALLOWED_ORIGIN_RE.test(origin))) {
        // プリフライトを発生させない simple リクエストでのブラインド CSRF を防ぐため、
        // 許可外オリジンの状態変更リクエストは実行前に拒否する
        res.sendStatus(403)
        return
      }

      if (origin === undefined || origin === 'null' || originAllowed) {
        res.header('Access-Control-Allow-Origin', origin === undefined ? '*' : origin)
        res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        res.header('Access-Control-Allow-Headers', 'Content-Type')
        if (req.method === 'OPTIONS') {
          res.sendStatus(204)
          return
        }
      }
      next()
    })
  }

  private setupRoutes(): void {
    const serveOverlay = (req: Request, res: Response) => {
      const possiblePaths = [
        path.join(app.getAppPath(), 'public/overlay/index.html'),
        path.join(process.cwd(), 'public/overlay/index.html'),
        path.join(__dirname, '../../public/overlay/index.html')
      ]

      const overlayPath = possiblePaths.find(p => fs.existsSync(p))

      if (overlayPath) {
        res.sendFile(overlayPath)
      } else {
        console.error(`[EmbeddedServer] Overlay file not found. Tried:`, possiblePaths)
        res.status(404).send(`Overlay file not found. Check logs.`)
      }
    }

    this.expressApp.get('/', serveOverlay)
    this.expressApp.get('/index.html', serveOverlay)
    this.expressApp.get('/static', serveOverlay)
    this.expressApp.get('/static/index.html', serveOverlay)
    this.expressApp.get('/overlay', serveOverlay)
    this.expressApp.get('/overlay/index.html', serveOverlay)

    // SSE Endpoint
    this.expressApp.get('/api/scores/events', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders()

      this.sseClients.add(res)

      // 接続直後に即座に現在のスコア状態を同期させるための通知を送る
      setTimeout(() => {
        try {
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)
          }
        } catch { /* 接続切断済み */ }
      }, 100)

      req.on('close', () => {
        this.sseClients.delete(res)
      })
    })

    // Scores API
    this.expressApp.get('/api/scores', async (_req: Request, res: Response) => {
      try {
        const scoresPath = this.getScoresPath()
        const metaPath = path.join(path.dirname(scoresPath), 'scores-meta.json')

        let scores: any[] = []
        let isOverallUpdate = false

        const storedScores = await this.readJson<any[]>(scoresPath)
        if (Array.isArray(storedScores)) scores = storedScores

        const meta = await this.readJson<{ isOverallUpdate?: boolean }>(metaPath)
        if (meta?.isOverallUpdate) {
          isOverallUpdate = true
          await this.writeJson(metaPath, { isOverallUpdate: false })
        }

        const config = this.configManager.getConfig()

        // 残りレース数の計算式は12人×固定配点前提のため、スタンド読取モードでは無意味
        let remainingRaces: number | null = null
        if (config.analysisMode !== 'standings24') {
          const totalScores = scores.reduce((sum: number, team: any) => sum + (team.score || 0), 0)
          remainingRaces = Math.max(0, Math.floor(
            (POINTS_PER_RACE * MAX_RACES - totalScores) / POINTS_PER_RACE
          ))
        }

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

    this.expressApp.post('/api/scores', async (req, res) => {
      try {
        const scoresPath = this.getScoresPath()
        const metaPath = path.join(path.dirname(scoresPath), 'scores-meta.json')
        const scores = req.body
        const isOverallUpdate = req.query.isOverallUpdate === 'true'

        if (!Array.isArray(scores)) {
          res.status(400).json({ success: false, error: 'scores must be an array' })
          return
        }

        // 自チーム（マイプレイヤー）の手動設定を記憶
        const currentPlayer = Array.isArray(scores) ? scores.find((s: any) => s.isCurrentPlayer) : null
        if (currentPlayer) {
          const name = currentPlayer.name || currentPlayer.team
          if (name) {
            const selfPath = path.join(app.getPath('userData'), 'self-player.json')
            await this.writeJson(selfPath, { name, timestamp: new Date().toISOString() })
          }
        }

        await this.writeJson(scoresPath, scores)
        if (isOverallUpdate) {
          await this.writeJson(metaPath, { isOverallUpdate: true })
        }

        this.broadcastScoreUpdate()
        res.json({ success: true })
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message })
      }
    })

    this.expressApp.post('/api/scores/reset', async (_req, res) => {
      try {
        const scoresPath = this.getScoresPath()
        const mappingPath = this.getPlayerMappingPath()
        const playerScoresPath = this.getPlayerScoresPath()

        if (fs.existsSync(scoresPath)) await this.writeJson(scoresPath, [])
        if (fs.existsSync(mappingPath)) await this.writeJson(mappingPath, {})
        if (fs.existsSync(playerScoresPath)) await this.writeJson(playerScoresPath, {})

        const metaPath = path.join(path.dirname(scoresPath), 'scores-meta.json')
        if (fs.existsSync(metaPath)) await fsp.unlink(metaPath)

        const offsetsPath = this.getReconnectOffsetsPath()
        if (fs.existsSync(offsetsPath)) await fsp.unlink(offsetsPath)

        this.broadcastScoreUpdate()
        res.json({ success: true })
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // Config API — オーバーレイ用にサニタイズした設定のみ返す（シークレットは含めない）
    this.expressApp.get('/api/config', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.json(sanitizeConfigForOverlay(this.configManager.getConfig()))
    })

    // Local IP API
    this.expressApp.get('/api/localIp', (_req: Request, res: Response) => {
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
    this.expressApp.get('/api/reopen-slots', async (_req: Request, res: Response) => {
      try {
        const slots = await this.readJson<any[]>(this.getReopenSlotsPath())
        res.json(Array.isArray(slots) ? slots : [])
      } catch (error: any) {
        res.status(500).json({ error: error.message })
      }
    })

    this.expressApp.post('/api/reopen-slots', async (req, res) => {
      try {
        const slotsPath = this.getReopenSlotsPath()
        const slots = (await this.readJson<any[]>(slotsPath)) ?? []
        const newSlot = req.body

        if (!newSlot || typeof newSlot.slotId !== 'number') {
          res.status(400).json({ success: false, error: 'slotId is required' })
          return
        }

        const index = slots.findIndex(s => s.slotId === newSlot.slotId)
        if (index !== -1) {
          slots[index] = newSlot
        } else {
          slots.push(newSlot)
        }

        await this.writeJson(slotsPath, slots)
        this.broadcastScoreUpdate()
        res.json({ success: true })
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message })
      }
    })

    this.expressApp.delete('/api/reopen-slots/:slotId', async (req, res) => {
      try {
        const slotId = parseInt(req.params.slotId)
        const slotsPath = this.getReopenSlotsPath()
        const slots = await this.readJson<any[]>(slotsPath)
        if (slots) {
          const filtered = slots.filter(s => s.slotId !== slotId)
          await this.writeJson(slotsPath, filtered)
        }
        this.broadcastScoreUpdate()
        res.json({ success: true })
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // Player Mapping API
    this.expressApp.get('/api/player-mapping', async (_req: Request, res: Response) => {
      try {
        const mapping = await this.readJson<Record<string, string>>(this.getPlayerMappingPath())
        res.json(mapping ?? {})
      } catch (error: any) {
        res.status(500).json({ error: error.message })
      }
    })

    this.expressApp.post('/api/player-mapping', async (req, res) => {
      try {
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
          res.status(400).json({ success: false, error: 'mapping must be an object' })
          return
        }
        await this.writeJson(this.getPlayerMappingPath(), req.body)
        this.broadcastScoreUpdate()
        res.json({ success: true })
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // Player Scores API
    this.expressApp.get('/api/player-scores', async (_req: Request, res: Response) => {
      try {
        const scores = await this.readJson<Record<string, unknown>>(this.getPlayerScoresPath())
        res.json(scores ?? {})
      } catch (error: any) {
        res.status(500).json({ error: error.message })
      }
    })

    this.expressApp.post('/api/player-scores', async (req, res) => {
      try {
        await this.writeJson(this.getPlayerScoresPath(), req.body)
        this.broadcastScoreUpdate()
        res.json({ success: true })
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message })
      }
    })

    // DC対策オフセット API（name -> オフセット値のマップ）
    this.expressApp.get('/api/reconnect-offsets', async (_req: Request, res: Response) => {
      try {
        const offsets = await this.readJson<Record<string, number>>(this.getReconnectOffsetsPath())
        res.json(offsets ?? {})
      } catch (error: any) {
        res.status(500).json({ error: error.message })
      }
    })

    this.expressApp.post('/api/reconnect-offsets', async (req, res) => {
      try {
        const body = req.body
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          res.status(400).json({ success: false, error: 'offsets must be an object of name->number' })
          return
        }
        await this.writeJson(this.getReconnectOffsetsPath(), body)
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
    if (config.scoreSettings?.keepScoreOnRestart === false) {
      const scoresPath = this.getScoresPath()
      if (fs.existsSync(scoresPath)) {
        this.writeJson(scoresPath, [])
          .then(() => console.log('Scores reset on startup as per config'))
          .catch(e => console.error('Failed to reset scores on startup:', e))
      }
    }

    return new Promise((resolve, reject) => {
      try {
        // ループバックのみでリッスン。LAN上の他デバイスからAPIキー等に
        // アクセスされることを構造的に防ぐ（オーバーレイも同一PC前提）。
        this.server = this.expressApp.listen(this.port, '127.0.0.1', () => {
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
      if (this.sseCleanupInterval) {
        clearInterval(this.sseCleanupInterval)
        this.sseCleanupInterval = null
      }
      if (this.server) {
        // SSE の keep-alive 接続が生きていると close() のコールバックが
        // 永久に発火しないため、開いている接続を強制終了してから閉じる
        this.server.closeAllConnections()
        this.sseClients.clear()
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
    this.sseClients.forEach((res) => {
      try {
        if (!res.writableEnded) {
          res.write(`data: ${message}\n\n`)
        } else {
          this.sseClients.delete(res)
        }
      } catch {
        this.sseClients.delete(res)
      }
    })
  }
}
