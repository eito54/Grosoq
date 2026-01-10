import { ObsManager } from './obs-manager'
import { ConfigManager } from './config-manager'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
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

    // Always use Groq for now as other providers are removed/hidden
    if (config.groqApiKey) {
      return this.analyzeRaceGroq(imageUrl, useTotalScore)
    }

    throw new Error('AI解析用のAPIキー（Groq）が設定されていません')
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
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
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
