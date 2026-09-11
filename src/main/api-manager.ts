import { ObsManager } from './obs-manager'
import { ConfigManager, resolveStandingsCalibration, getCalibrationContextKey, type StandingsCalibration } from './config-manager'
import fs from 'fs'
import path from 'path'
import { app, nativeImage } from 'electron'
import crypto from 'crypto'

export interface RaceResult {
  rank?: number
  name: string
  team: string
  score?: number
  totalScore?: number
  isCurrentPlayer: boolean
}

export interface AnalyzeRaceResponse {
  success: boolean
  results?: RaceResult[]
  error?: string
}

export interface GroqModelInfo {
  id: string
  vision: boolean
  active: boolean
  contextWindow?: number
}

/** 現在の解析で使用しているモデル（Groq公式ビジョン対応・JSON mode/OCR用途を推奨） */
export const CURRENT_VISION_MODEL = 'qwen/qwen3.6-27b'

/**
 * Groq公開のビジョン（画像入力）対応モデルファミリー。
 * /modelsレスポンスには画像対応フラグが無いため、IDパターンで判定する。
 * 出典: https://console.groq.com/docs/vision (2026-08時点)
 */
const VISION_MODEL_PATTERNS = [
  /llama-4-scout/i,
  /llama-4-maverick/i,
  /gemma-3-\d+b-it/i,
  /qwen.*vl/i,
  /qwen3\.6/i
]

export function isVisionModelId(id: string): boolean {
  return VISION_MODEL_PATTERNS.some(pattern => pattern.test(id))
}

export class ApiManager {
  private configManager: ConfigManager
  private lastAnalysisHash: string | null = null
  private lastAnalysisResult: AnalyzeRaceResponse | null = null
  private isAnalyzing: boolean = false

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
  }

  private getPlayerMappingPath(): string {
    return path.join(app.getPath('userData'), 'player-mappings.json')
  }

  private getSelfPlayerPath(): string {
    return path.join(app.getPath('userData'), 'self-player.json')
  }

  private getSelfPlayerName(): string | null {
    try {
      const selfPath = this.getSelfPlayerPath()
      if (fs.existsSync(selfPath)) {
        const data = JSON.parse(fs.readFileSync(selfPath, 'utf8'))
        return data.name || null
      }
    } catch (e) {
      console.error('Error reading self player name:', e)
    }
    return null
  }

  private saveSelfPlayerName(name: string) {
    try {
      const selfPath = this.getSelfPlayerPath()
      fs.writeFileSync(selfPath, JSON.stringify({ name, timestamp: new Date().toISOString() }))
    } catch (e) {
      console.error('Error saving self player name:', e)
    }
  }

  private getAllPlayerMappings(): Record<string, string> {
    try {
      const mappingPath = this.getPlayerMappingPath()
      if (!fs.existsSync(mappingPath)) {
        return {}
      }
      return JSON.parse(fs.readFileSync(mappingPath, 'utf8'))
    } catch (error) {
      console.error('Error reading all player mappings:', error)
      return {}
    }
  }

  private normalizeName(name: string): string {
    if (!name) return ''
    // 前後の空白と、制御文字や不可視ボールド等の特殊文字を除去
    return name.trim().replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '')
  }

  private findLongestCommonPrefix(names: string[]): string {
    if (!names || names.length === 0) return ''
    if (names.length === 1) return names[0]

    let prefix = ''
    const firstName = names[0]

    for (let i = 0; i < firstName.length; i++) {
      const char = firstName[i]
      let allMatch = true

      for (let j = 1; j < names.length; j++) {
        if (i >= names[j].length || names[j][i] !== char) {
          allMatch = false
          break
        }
      }

      if (allMatch) {
        prefix += char
      } else {
        break
      }
    }

    return prefix
  }

  private updatePlayerMappingsForNewPlayers(newResults: RaceResult[]): Record<string, string> {
    try {
      const mappingPath = this.getPlayerMappingPath()
      const currentMappings = this.getAllPlayerMappings()
      const playerGroups: Record<string, string[]> = {}

      newResults.forEach((result) => {
        const name = this.normalizeName(result.name)
        if (name) {
          const firstChar = name.charAt(0).toUpperCase()
          if (!playerGroups[firstChar]) {
            playerGroups[firstChar] = []
          }
          if (!playerGroups[firstChar].includes(name)) {
            playerGroups[firstChar].push(name)
          }
        }
      })

      Object.keys(currentMappings).forEach((playerName) => {
        const name = this.normalizeName(playerName)
        const firstChar = name.charAt(0).toUpperCase()
        if (playerGroups[firstChar] && !playerGroups[firstChar].includes(name)) {
          playerGroups[firstChar].push(name)
        }
      })

      let mappingsUpdated = false

      Object.entries(playerGroups).forEach(([firstChar, players]) => {
        // そのグループ内ですでにマッピングが存在するプレイヤーを探す
        // 最初に見つかった既存マッピングをこのグループのデフォルトチーム名として採用する
        const existingTeamName = players
          .map(p => currentMappings[p])
          .find(t => !!t && t !== firstChar)

        // 共通プレフィックスの計算（2名以上いる場合のみ計算するが、1名でもマッピングは作成する）
        const commonPrefix = players.length > 1 ? this.findLongestCommonPrefix(players) : ''

        // 既存のチーム名があればそれを優先し、なければ計算する
        let teamName = existingTeamName || (commonPrefix.length >= 2 ? commonPrefix : firstChar)

        // アルファベットは大文字で統一
        teamName = teamName.toUpperCase()

        players.forEach((playerName) => {
          const currentTeamName = currentMappings[playerName]
          // 未マッピング、または「先頭1文字」等の暫定マッピングしかない場合は、
          // 判明したチーム名（既存マッピング由来 or プレフィックス由来）で更新する
          if (!currentTeamName || (currentTeamName.length === 1 && teamName.length > 1)) {
            console.log(
              `Mapping player: "${playerName}" to "${teamName}"`
            )
            currentMappings[playerName] = teamName
            mappingsUpdated = true
          }
        })
      })

      if (mappingsUpdated) {
        const mappingDir = path.dirname(mappingPath)
        if (!fs.existsSync(mappingDir)) {
          fs.mkdirSync(mappingDir, { recursive: true })
        }
        fs.writeFileSync(mappingPath, JSON.stringify(currentMappings, null, 2))
      }

      return currentMappings
    } catch (error) {
      console.error('Error updating player mappings:', error)
      return this.getAllPlayerMappings()
    }
  }

  /**
   * スタンド24モード用: 設定された校正範囲で2列分を切り出す。
   * 戻り値は1〜2枚のdata URL配列（デコード失敗列はスキップ、全滅時はフルフレーム1枚）。
   */
  private cropStandingsColumns(imageUrl: string): string[] {
    // 現在のコンテキスト（モード×対象ゲーム）に対応するプリセットを優先して使用。
    // 未保存なら従来のスタンドアロン校正值にフォールバックする
    const cal = resolveStandingsCalibration(this.configManager.getConfig())
    const ranges: Array<{ startPct: number; endPct: number }> = [
      { startPct: cal.colAStartX, endPct: cal.colAEndX },
      { startPct: cal.colBStartX, endPct: cal.colBEndX }
    ]
    try {
      const base64Data = imageUrl.includes('base64,') ? imageUrl.split('base64,')[1] : imageUrl
      const image = nativeImage.createFromBuffer(Buffer.from(base64Data, 'base64'))
      if (image.isEmpty()) {
        console.error('[ApiManager] cropStandingsColumns: decode failed, using full frame')
        return [imageUrl]
      }
      const { width, height } = image.getSize()
      // 共通の縦範囲（ヘッダー/フッター等のノイズ除去用）
      const y = Math.max(0, Math.min(height - 1, Math.floor((height * (cal.startY ?? 0)) / 100)))
      const h = Math.max(1, Math.floor((height * Math.max(0, (cal.endY ?? 100) - (cal.startY ?? 0))) / 100))
      const out: string[] = []
      for (const r of ranges) {
        const x = Math.max(0, Math.min(width - 1, Math.floor((width * r.startPct) / 100)))
        const w = Math.max(1, Math.floor((width * Math.max(0, r.endPct - r.startPct)) / 100))
        const cropped = image.crop({ x, y, width: Math.min(w, width - x), height: Math.min(h, height - y) })
        if (!cropped.isEmpty()) {
          out.push(`data:image/jpeg;base64,${cropped.toJPEG(90).toString('base64')}`)
        }
      }
      return out.length > 0 ? out : [imageUrl]
    } catch (error) {
      console.error('[ApiManager] cropStandingsColumns failed:', error)
      return [imageUrl]
    }
  }

  async getObsScreenshot(): Promise<string> {
    const config = this.configManager.getConfig()
    const obsManager = ObsManager.getInstance()

    try {
      if (!obsManager.getStatus()) {
        await obsManager.connect(config)
      }

      return await obsManager.getScreenshot(config.obsSourceName)
    } catch (error) {
      console.error('OBS Screenshot Error:', error)
      throw error
    }
  }

  async analyzeRace(imageUrl: string, useTotalScore: boolean = false): Promise<AnalyzeRaceResponse> {
    const config = this.configManager.getConfig()

    if (!config.groqApiKey) {
      throw new Error('AI解析用のAPIキー（Groq）が設定されていません')
    }

    // 24人スタンドモード: 常に2列クロップ＋累計値の直接読取（rendererがfalseを渡しても強制）
    if (config.analysisMode === 'standings24') {
      return this.analyzeStandingsGroq(this.cropStandingsColumns(imageUrl))
    }

    // 標準12人モード: 12人用プリセット（MK8DX / MK World 12人）が保存されていれば、
    // リザルト全員の「名前〜点数」が映る単一領域へクロップしてから解析する。
    // 未保存の場合はフルフレームのまま（従来動作）
    if (config.analysisMode === 'standard12') {
      const preset = config.standingsCalibrationPresets?.[getCalibrationContextKey(config)]
      if (preset) {
        return this.analyzeRaceGroq(this.cropSingleRegion(imageUrl, preset), useTotalScore)
      }
    }

    // Always use Groq for now as other providers are removed/hidden
    return this.analyzeRaceGroq(imageUrl, useTotalScore)
  }

  /**
   * 標準12人モード用: 単一領域（リザルトの全員の名前〜点数が映る範囲）へクロップする。
   * 列A(colAStartX〜colAEndX)を1つのX範囲として扱い、startY〜endYで縦範囲を切る。
   * 失敗時はフルフレームを返す。
   */
  private cropSingleRegion(imageUrl: string, cal: StandingsCalibration): string {
    try {
      const base64Data = imageUrl.includes('base64,') ? imageUrl.split('base64,')[1] : imageUrl
      const image = nativeImage.createFromBuffer(Buffer.from(base64Data, 'base64'))
      if (image.isEmpty()) {
        console.error('[ApiManager] cropSingleRegion: decode failed, using full frame')
        return imageUrl
      }
      const { width, height } = image.getSize()
      const x = Math.max(0, Math.min(width - 1, Math.floor((width * cal.colAStartX) / 100)))
      const w = Math.max(1, Math.min(width - x, Math.floor((width * (cal.colAEndX - cal.colAStartX)) / 100)))
      const y = Math.max(0, Math.min(height - 1, Math.floor((height * cal.startY) / 100)))
      const h = Math.max(1, Math.min(height - y, Math.floor((height * (cal.endY - cal.startY)) / 100)))
      const cropped = image.crop({ x, y, width: w, height: h })
      if (cropped.isEmpty()) return imageUrl
      return `data:image/jpeg;base64,${cropped.toJPEG(90).toString('base64')}`
    } catch (error) {
      console.error('[ApiManager] cropSingleRegion failed:', error)
      return imageUrl
    }
  }

  /**
   * Groqアカウントで利用可能なモデル一覧を取得し、
   * 画像認識（ビジョン）対応の可別に分類して返す。
   */
  async listGroqModels(): Promise<{ success: boolean; models?: GroqModelInfo[]; currentModel?: string; error?: string }> {
    const config = this.configManager.getConfig()
    if (!config.groqApiKey) {
      return { success: false, error: 'Groq APIキーが設定されていません' }
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${config.groqApiKey}` }
      })

      if (!response.ok) {
        let message = response.statusText
        try {
          const errorData = await response.json()
          message = errorData?.error?.message || message
        } catch { /* ボディがJSONでない場合 */ }
        return { success: false, error: `Groq API Error: ${message}` }
      }

      const data = await response.json()
      const rawModels: any[] = Array.isArray(data?.data) ? data.data : []

      const models: GroqModelInfo[] = rawModels
        .filter(m => typeof m?.id === 'string')
        .map(m => ({
          id: m.id as string,
          vision: isVisionModelId(m.id),
          active: m.active !== false,
          contextWindow: typeof m.context_window === 'number' ? m.context_window : undefined
        }))
        // 画像認識対応モデルを先頭に、以降はID順
        .sort((a, b) => (a.vision === b.vision ? a.id.localeCompare(b.id) : a.vision ? -1 : 1))

      return { success: true, models, currentModel: CURRENT_VISION_MODEL }
    } catch (error: any) {
      return { success: false, error: error.message || String(error) }
    }
  }

  /**
   * 24人スタンド画面（レース開始前のプレイヤー情報）を解析する。
   * 表示値は累計ポイントのため、rank→配点の計算は行わず読み取った値をそのまま返す。
   */
  private async analyzeStandingsGroq(images: string[]): Promise<AnalyzeRaceResponse> {
    const config = this.configManager.getConfig()
    if (!config.groqApiKey) {
      throw new Error('Groq APIキーが設定されていません')
    }

    if (this.isAnalyzing) {
      throw new Error('現在解析中です...')
    }

    this.isAnalyzing = true

    try {
      const existingMappings = this.getAllPlayerMappings()
      const existingMappingsText = Object.keys(existingMappings).length > 0
        ? `\nFixed Teams: ${Object.entries(existingMappings).map(([p, t]) => `${p}=${t}`).join(',')}`
        : ''

      const prompt = `You are an expert OCR system reading a Mario Kart 8 Deluxe lounge/tournament standings screen shown BEFORE a race starts.
The screen shows 24 players arranged as TWO vertical columns of 12 rows each.
Each row shows: a decorative player badge/sticker, then the player NAME starting at a consistent horizontal position, then their CUMULATIVE score right-aligned at a fixed column.
Rules:
1. Extract ALL visible rows from BOTH columns (up to 24 total). Column order first (left column top-to-bottom, then right column).
2. IGNORE any numbers or text inside the decorative badge/sticker graphics — they are NOT part of the name or score.
3. "name": The player name text exactly as readable. Never include badge digits.
4. "score": The cumulative points number in the score column. Use the displayed value exactly as-is; do NOT calculate anything.
5. "isCurrentPlayer": true only for a row clearly highlighted as the local player; otherwise false.
${existingMappingsText}
Return ONLY valid JSON matching this schema: { results: [{ name: string, score: number, isCurrentPlayer: boolean }] }`

      const contentParts: any[] = [
        { type: 'text', text: prompt + `\nThe following ${images.length} image(s) are column crops of the standings screen. Image 1 = LEFT column, Image 2 = RIGHT column (only present when 2 images). Each column lists 12 players vertically.` },
        ...images.map(img => ({
          type: 'image_url' as const,
          image_url: {
            url: img.includes('base64,') ? img : `data:image/jpeg;base64,${img}`
          }
        }))
      ]

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.groqApiKey}`
        },
        body: JSON.stringify({
          model: CURRENT_VISION_MODEL,
          messages: [
            {
              role: 'user',
              content: contentParts
            }
          ],
          response_format: { type: 'json_object' },
          reasoning_effort: 'none',
          temperature: 0.1
        })
      })

      if (!response.ok) {
        let message = response.statusText
        try {
          const errorData = await response.json()
          message = errorData?.error?.message || message
        } catch { /* ボディがJSONでない場合 */ }
        throw new Error(`Groq API Error: ${message}`)
      }

      const data = await response.json()
      const content = data.choices[0].message.content
      const parsedResponse = JSON.parse(content)

      if (parsedResponse.results && Array.isArray(parsedResponse.results)) {
        const normalized = parsedResponse.results
          .slice(0, 24)
          .map((r: any) => ({ ...r, score: Number(r?.score) || 0 }))
        const results = this.processRaceResults(normalized)
        return { success: true, results }
      }

      throw new Error('Groqからのレスポンスを解析できませんでした')
    } finally {
      this.isAnalyzing = false
    }
  }

  private async analyzeRaceGroq(imageUrl: string, useTotalScore: boolean = false): Promise<AnalyzeRaceResponse> {
    const config = this.configManager.getConfig()
    if (!config.groqApiKey) {
      throw new Error('Groq APIキーが設定されていません')
    }

    if (this.isAnalyzing) {
      throw new Error('現在解析中です...')
    }

    const base64Data = imageUrl.includes('base64,') ? imageUrl.split('base64,')[1] : imageUrl
    const currentHash = crypto.createHash('md5').update(base64Data).digest('hex') + `_groq_${useTotalScore}`

    // チーム合計点取得の場合は、マッピングリセット直後の可能性があるためキャッシュを無視する
    if (!useTotalScore && this.lastAnalysisHash === currentHash && this.lastAnalysisResult) {
      return this.lastAnalysisResult
    }

    this.isAnalyzing = true

    try {
      const existingMappings = this.getAllPlayerMappings()
      const existingMappingsText = Object.keys(existingMappings).length > 0
        ? `\nFixed Teams: ${Object.entries(existingMappings).map(([p, t]) => `${p}=${t}`).join(',')}`
        : ''

      const prompt = useTotalScore
        ? `You are an expert OCR system for Mario Kart 8 Deluxe. Analyze the provided score result screen.
Extract exactly 12 rows of data if possible.
For each row, extract the following fields:
- "name": The player name text located between the character icon and the country flag.
- "score": The number on the far right.
- "team": If a team is visible, extract it (often A, B, etc. at start of name). If not, make best guess or leave empty.
- "isCurrentPlayer": Set to true IF AND ONLY IF the row has a YELLOW background highlight.
${existingMappingsText}
Return ONLY valid JSON matching this schema: { results: [{ name: string, team: string, score: number, isCurrentPlayer: boolean }] }`
        : `You are an expert OCR system for Mario Kart 8 Deluxe. Analyze the provided race result screen.
The image typically contains a table with 12 rows.
Columns from left to right: Rank (number), Character Icon, Player Name, Country Flag, Score/Points (number).
Rules:
1. Extract ALL 12 rows.
2. "rank": The number on the far left.
3. "name": The text between the character icon and the country flag. Preserve special characters if possible, but prioritize readable text.
4. "team": Often the first letter of the name or distinct prefix.
5. "score": The number on the far right.
6. "isCurrentPlayer": Check for a distinct YELLOW background highlighting the entire row. Set to true if present.
${existingMappingsText}
Return ONLY valid JSON matching this schema: { results: [{ rank: number, name: string, team: string, totalScore: number, isCurrentPlayer: boolean }] }`

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.groqApiKey}`
        },
        body: JSON.stringify({
          model: CURRENT_VISION_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt + "\nReturn ONLY valid JSON." },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Data}`
                  }
                }
              ]
            }
          ],
          response_format: { type: 'json_object' },
          // Qwen 3.6 27B専用: OCR抽出では思考トークン不要のため無効化（高速化）
          reasoning_effort: 'none',
          temperature: 0.1
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`Groq API Error: ${errorData.error?.message || response.statusText}`)
      }

      const data = await response.json()
      const content = data.choices[0].message.content
      const parsedResponse = JSON.parse(content)

      if (parsedResponse.results && Array.isArray(parsedResponse.results)) {
        const results = this.processRaceResults(parsedResponse.results)
        const finalResult = { success: true, results }
        this.lastAnalysisHash = currentHash
        this.lastAnalysisResult = finalResult
        return finalResult
      }

      throw new Error('Groqからのレスポンスを解析できませんでした')
    } finally {
      this.isAnalyzing = false
    }
  }

  private processRaceResults(results: any[]): RaceResult[] {
    // まず名前を正規化
    results.forEach(res => {
      if (res.name) res.name = this.normalizeName(res.name)
    })

    const updatedMappings = this.updatePlayerMappingsForNewPlayers(results)
    const savedSelfName = this.getSelfPlayerName()
    const detectedSelf = results.find(r => r.isCurrentPlayer)

    if (detectedSelf && detectedSelf.name) {
      this.saveSelfPlayerName(detectedSelf.name)
    } else if (savedSelfName) {
      const selfMatch = results.find(r => r.name === savedSelfName)
      if (selfMatch) {
        selfMatch.isCurrentPlayer = true
      }
    }

    results.forEach((res) => {
      // APIによってキー名が微妙に異なる可能性があるので正規化
      if (res.total_score !== undefined) res.totalScore = res.total_score;
      if (res.score !== undefined && res.totalScore === undefined) res.totalScore = res.score;

      // マッピングの適用（正規化された名前でチェック）
      if (res.name && updatedMappings[res.name]) {
        res.team = updatedMappings[res.name]
      }
    })

    return results
  }
}
