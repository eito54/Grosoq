import { OBSWebSocket } from 'obs-websocket-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
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
  private modelsCache: { models: string[], apiKey: string, timestamp: number } | null = null
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
        if (result.name) {
          const firstChar = result.name.charAt(0).toUpperCase()
          if (!playerGroups[firstChar]) {
            playerGroups[firstChar] = []
          }
          playerGroups[firstChar].push(result.name)
        }
      })

      Object.keys(currentMappings).forEach((playerName) => {
        const firstChar = playerName.charAt(0).toUpperCase()
        if (playerGroups[firstChar] && !playerGroups[firstChar].includes(playerName)) {
          playerGroups[firstChar].push(playerName)
        }
      })

      let mappingsUpdated = false

      Object.entries(playerGroups).forEach(([firstChar, players]) => {
        if (players.length > 1) {
          const commonPrefix = this.findLongestCommonPrefix(players)
          let teamName = commonPrefix.length >= 2 ? commonPrefix : firstChar

          // アルファベットは大文字で統一
          teamName = teamName.toUpperCase()

          players.forEach((playerName) => {
            const currentTeamName = currentMappings[playerName]
            if (!currentTeamName || currentTeamName !== teamName) {
              console.log(
                `Updating player mapping: "${playerName}" from "${currentTeamName || 'none'}" to "${teamName}"`
              )
              currentMappings[playerName] = teamName
              mappingsUpdated = true
            }
          })
        }
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
    const obs = new OBSWebSocket()
    const obsPort = config.obsPort || 4455
    const obsIp = config.obsIp === 'localhost' ? '127.0.0.1' : config.obsIp
    const obsUrl = `ws://${obsIp}:${obsPort}`

    try {
      if (config.obsPassword && config.obsPassword.trim() !== '') {
        await obs.connect(obsUrl, config.obsPassword)
      } else {
        await obs.connect(obsUrl)
      }

      const response = await obs.call('GetSourceScreenshot', {
        sourceName: config.obsSourceName,
        imageFormat: 'jpg',
        imageWidth: 1280,
        imageHeight: 720
      })

      await obs.disconnect()
      return response.imageData
    } catch (error) {
      console.error('OBS Screenshot Error:', error)
      try {
        await obs.disconnect()
      } catch (e) {}
      throw error
    }
  }

  async analyzeRace(imageUrl: string, useTotalScore: boolean = false): Promise<AnalyzeRaceResponse> {
    const config = this.configManager.getConfig()
    
    // AIプロバイダーが設定されていない場合はGroqをデフォルトにする
    const provider = config.aiProvider || 'groq';

    if (provider === 'openai') {
      return this.analyzeRaceOpenAI(imageUrl, useTotalScore)
    }

    if (provider === 'groq') {
      return this.analyzeRaceGroq(imageUrl, useTotalScore)
    }

    // Groq APIキーが設定されていない場合は、フォールバックとしてGroqを試みる
    if (!config.geminiApiKey && (!config.geminiApiKeys || config.geminiApiKeys.length === 0)) {
      if (config.groqApiKey) {
        return this.analyzeRaceGroq(imageUrl, useTotalScore)
      }
      throw new Error('AI解析用のAPIキー（Groq等）が設定されていません')
    }

    if (this.isAnalyzing) {
      throw new Error('現在、別の画像を解析中です。しばらくお待ちください。')
    }

    const base64Data = imageUrl.includes('base64,') ? imageUrl.split('base64,')[1] : imageUrl
    
    // 画像のハッシュを計算して、前回と同じ画像なら解析をスキップ
    const currentHash = crypto.createHash('md5').update(base64Data).digest('hex') + `_${useTotalScore}`
    if (this.lastAnalysisHash === currentHash && this.lastAnalysisResult) {
      console.log('Skipping Groq API request: Image is identical to last successful analysis.')
      return this.lastAnalysisResult
    }

    this.isAnalyzing = true

    try {
      const existingMappings = this.getAllPlayerMappings()
    const existingMappingsText =
      Object.keys(existingMappings).length > 0
        ? `\n  ## existing_player_mappings ##
  以下のプレイヤーについては、過去に決定されたチーム名を必ず使用してください：
  ${Object.entries(existingMappings)
    .map(([player, team]) => `  - "${player}" → "${team}"`)
    .join('\n')}
  
  これらのプレイヤーが今回の画像に含まれている場合は、上記のチーム名を使用し、新たなチーム名判別は行わないでください。\n`
        : ''

    const prompt = useTotalScore
      ? `## instruction ##
  これは「マリオカート8DX」のレース結果画面の画像です。
  画像を解析して、全プレイヤーのユーザー名、チーム情報、および画面右端に表示されている総合得点を抽出してください。
  総合得点は、各プレイヤーの行の一番右に表示されている数字です。
  指定されたJSON形式で出力してください。
${existingMappingsText}
  ## extraction_rules ##
  - [name]: プレイヤーのユーザー名をそのまま抽出してください。
  - [team]: 以下の厳格なルールでチーム名を識別してください：
    
    **基本方針：同じ先頭文字のプレイヤー全員の最長連続共通先頭部分をチーム名とする**
    
    **ステップ1：同じ先頭文字のプレイヤーをグループ化**
    - 先頭文字が同じプレイヤーを全て特定する
    - アルファベットは大文字で統一（「a」と「A」は同じ「A」グループ）
    - 「AKSKDあいうえお」「AKSKDかきくけこ」は同じ「A」グループとして扱う
    
    **ステップ2：各グループ内で全プレイヤーの最長連続共通先頭部分を正確に決定**
    - 同じ先頭文字のプレイヤー全員で、1文字ずつ順番に比較して連続で一致する部分を特定
    - **重要：連続で一致する最長の部分のみをチーム名とする**
    - 例：「AKSKDあいうえお」「AKSKDかきくけこ」→ 連続共通部分「AKSKD」（5文字）
    - 例：「かんとつシトラリ」「かんとつヌヴィレット」→ 連続共通部分「かんとつ」（4文字）
    - 例：「ABC123」「ABD456」→ 連続共通部分「AB」（2文字、3文字目以降は不一致）
    - 例：「TeamAlpha01」「TeamAlpha02」→ 連続共通部分「TeamAlpha0」（10文字）
    
    **ステップ3：動的なチーム名再計算（重要）**
    - 新しいプレイヤーが追加された場合、そのグループ内の全プレイヤーで連続共通部分を再計算する
    - 例：「AKSKDあいうえお」「AKSKDかきくけこ」→「AKSKD」チーム
    - その後「AKSKさしすせそ」が追加された場合：
      - 3名全員で再計算：「AKSKD」「AKSKD」「AKSK」
      - 連続共通部分は「AKSK」（4文字）になる
      - チーム名を「AKSKD」から「AKSK」に更新する
    
    **ステップ4：チーム名を決定し、アルファベットは大文字で統一**
    - 連続共通部分が2文字以上ある場合：その連続共通部分をチーム名とする
    - 連続共通部分が1文字のみの場合：先頭1文字をチーム名とする
    - **重要**：アルファベットのチーム名は必ず大文字で統一する
    
    **具体例**：
    - 「AKSKDあいうえお」「AKSKDかきくけこ」→ 「AKSKD」チーム（連続共通部分）
    - その後「AKSKさしすせそ」追加 → 全員で再計算して「AKSK」チーム（連続共通部分）
    - 「かんとつシトラリ」「かんとつヌヴィレット」→ 「かんとつ」チーム（連続共通部分）
    - 「TeamRed01」「TeamRed02」「TeamBlue01」→ 「T」チーム（連続共通部分は1文字のみ）
    
    **例外処理**
    - 空白や特殊文字のみの場合は "UNKNOWN"
  - [total_score]: プレイヤーの総合得点を整数で抽出してください。これは通常、各プレイヤー行の最も右側に表示される数字です。
  - [isCurrentPlayer]: プレイヤーの行の背景が黄色かどうかを判別してください。
    - 黄色背景は、そのプレイヤーが操作プレイヤー（マイプレイヤー）であることを示します。
    - 黄色背景が検出された場合、true を設定してください。それ以外の場合は false を設定してください。(boolean値で返す)
    - 背景色は完全な黄色 (#FFFF00) ではない可能性があります。濃い黄色やオレンジに近い黄色も黄色背景とみなしてください。
    - 透明度や他の色との混合により、判別が難しい場合があるため、慎重に判断してください。明らかに黄色系の背景と識別できる場合にのみ true としてください。

  ## output_format ##
  以下のJSON形式で、全プレイヤーの情報を "results" 配列に含めてください。
  もし、提供された画像が「マリオカート8DX」のリザルト画面ではない、またはリザルト情報を読み取れない場合は、代わりに以下の形式のエラーJSONを出力してください:
  {
    "error": "リザルト画面ではないか、情報を読み取れませんでした。"
  }

  リザルト情報が読み取れる場合のJSON形式 (キーと値はダブルクォートで囲んでください):
  {
    "results": [
      {
        "name": "[name]",
        "team": "[team]",
        "score": [total_score],
        "isCurrentPlayer": [isCurrentPlayer]
      }
    ]
  }
  ## important_notes ##
  - 必ず指定されたJSON形式のいずれかで応答してください。
  - ユーザー名は画像に表示されている通りに正確に抽出してください。
  - プレイヤーは最大12人です。画像に表示されている全プレイヤーの情報を抽出してください。
  - 総合得点の抽出を最優先してください。
  - チーム名の判別は非常に重要です。同じチームに所属するプレイヤーが同じチーム名になるよう注意してください。`
      : `
  ## instruction ##
  これは「マリオカート8DX」のレース結果画面の画像です。
  画像を解析して、全プレイヤーの順位、ユーザー名、チーム情報、および合計得点を抽出し、指定されたJSON形式で出力してください。

  結果画面には通常、各プレイヤーについて左から以下の情報が含まれています（レイアウトは若干異なる場合があります）：
  1. 順位 (例: 1st, 2nd, 3rd... または単に数字)
  2. ユーザー名
  3. プレイヤーごとの合計得点 (例: 1500, 1250...)
${existingMappingsText}
  ## extraction_rules ##
  - [rank]: プレイヤーの順位を整数で抽出してください (例: 1, 2, 3, ..., 12)。
  - [name]: プレイヤーのユーザー名をそのまま抽出してください。
  - [totalScore]: プレイヤーの合計得点を整数で抽出してください (例: 1500, 1250)。
  - [team]: 以下の厳格なルールでチーム名を識別してください：
    
    **基本方針：同じ先頭文字のプレイヤー全員の最長連続共通先頭部分をチーム名とする**
    
    **ステップ1：同じ先頭文字のプレイヤーをグループ化**
    - 先頭文字が同じプレイヤーを全て特定する
    - アルファベットは大文字で統一（「a」と「A」グループは同じ「A」グループ）
    - 「AKSKDあいうえお」「AKSKDかきくけこ」は同じ「A」グループとして扱う
    
    **ステップ2：各グループ内で全プレイヤーの最長連続共通先頭部分を正確に決定**
    - 同じ先頭文字のプレイヤー全員で、1文字ずつ順番に比較して連続で一致する部分を特定
    - **重要：連続で一致する最長の部分のみをチーム名とする**
    - 例：「AKSKDあいうえお」「AKSKDかきくけこ」→ 連続共通部分「AKSKD」（5文字）
    - 例：「かんとつシトラリ」「かんとつヌヴィレット」→ 連続共通部分「かんとつ」（4文字）
    - 例：「ABC123」「ABD456」→ 連続共通部分「AB」（2文字、3文字目以降は不一致）
    - 例：「TeamAlpha01」「TeamAlpha02」→ 連続共通部分「TeamAlpha0」（10文字）
    
    **ステップ3：動的なチーム名再計算（重要）**
    - 新しいプレイヤーが追加された場合、そのグループ内の全プレイヤーで連続共通部分を再計算する
    - 例：「AKSKDあいうえお」「AKSKDかきくけこ」→「AKSKD」チーム
    - その後「AKSKさしすせそ」が追加された場合：
      - 3名全員で再計算：「AKSKD」「AKSKD」「AKSK」
      - 連続共通部分は「AKSK」（4文字）になる
      - チーム名を「AKSKD」から「AKSK」に更新する
    
    **ステップ4：チーム名を決定し、アルファベットは大文字で統一**
    - 連続共通部分が2文字以上ある場合：その連続共通部分をチーム名とする
    - 連続共通部分が1文字のみの場合：先頭1文字をチーム名とする
    - **重要**：アルファベットのチーム名は必ず大文字で統一する
    
    **具体例**：
    - 「AKSKDあいうえお」「AKSKDかきくけこ」→ 「AKSKD」チーム（連続共通部分）
    - その後「AKSKさしすせそ」追加 → 全員で再計算して「AKSK」チーム（連続共通部分）
    - 「かんとつシトラリ」「かんとつヌヴィレット」→ 「かんとつ」チーム（連続共通部分）
    - 「TeamRed01」「TeamRed02」「TeamBlue01」→ 「T」チーム（連続共通部分は1文字のみ）
    
    **例外処理**
    - 空白や特殊文字のみの場合は "UNKNOWN"
  - [isCurrentPlayer]: プレイヤーの行の背景が黄色かどうかを判別してください。
    - 黄色背景は、そのプレイヤーが操作プレイヤー（マイプレイヤー）であることを示します。
    - 黄色背景が検出された場合、true を設定してください。それ以外の場合は false を設定してください。(boolean値で返す)
    - 背景色は完全な黄色 (#FFFF00) ではない可能性があります。濃い黄色やオレンジに近い黄色も黄色背景とみなしてください。
    - 透明度や他の色との混合により, 判別が難しい場合があるため、慎重に判断してください。明らかに黄色系の背景と識別できる場合にのみ true としてください。

  ## output_format ##
  以下のJSON形式で、全プレイヤーの情報を "results" 配列に含めてください。
  もし、提供された画像が「マリオカート8DX」のリザルト画面ではない、またはリザルト情報を読み取れない場合は、代わりに以下の形式のエラーJSONを出力してください:
  {
    "error": "リザルト画面ではないか、情報を読み取れませんでした。"
  }

  リザルト情報が読み取れる場合のJSON形式 (キーと値はダブルクォートで囲んでください):
  {
    "results": [
      {
        "rank": "[rank]",
        "name": "[name]",
        "team": "[team]",
        "totalScore": "[totalScore]",
        "isCurrentPlayer": [isCurrentPlayer]
      }
    ]
  }
  ## important_notes ##
  - 必ず指定されたJSON形式のいずれかで応答してください。
  - ユーザー名は画像に表示されている通りに正確に抽出してください。
  - プレイヤーは最大12人です。画像に表示されている全プレイヤーの情報を抽出してください。
  - チーム名の判別は非常に重要です。同じチームに所属するプレイヤーが同じチーム名になるよう注意してください。
`

      // 使用するキーのリストを作成（単体キー + 複数キーリスト）
      const allKeys = [
        ...(config.geminiApiKey ? [config.geminiApiKey] : []),
        ...(config.geminiApiKeys || [])
      ]

      let result;
      let lastError;
      const maxRetries = 2;
      const baseDelay = 2000;

      // キーをローテーションして試行
      for (let keyIndex = 0; keyIndex < allKeys.length; keyIndex++) {
        const currentKey = allKeys[keyIndex]
        const genAI = new GoogleGenerativeAI(currentKey)
        const model = genAI.getGenerativeModel({ model: config.geminiModel || 'gemini-1.5-flash-8b' })

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            result = await model.generateContent([
              prompt,
              {
                inlineData: {
                  data: base64Data,
                  mimeType: 'image/jpeg'
                }
              }
            ])
            break;
          } catch (error: any) {
            lastError = error;
            if (error.message?.includes('429') || error.status === 429) {
              if (attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt);
                console.warn(`Groq Key ${keyIndex + 1} Rate Limit. Retry in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              } else {
                console.warn(`Groq Key ${keyIndex + 1} exhausted. Trying next key if available...`);
                break; // 次のキーへ
              }
            }
            throw error;
          }
        }
        if (result) break;
      }

      if (!result) {
        throw lastError || new Error('全てのGroq APIキーの制限に達したか、失敗しました。');
      }

    const text = result.response.text()
    const cleanText = text.replace(/```json\s*|\s*```/g, '').trim()
    let parsedResponse
    try {
      parsedResponse = JSON.parse(cleanText)
    } catch (e) {
      console.error('Failed to parse Gemini response:', cleanText)
      throw new Error('Groqからのレスポンスを解析できませんでした')
    }

    if (parsedResponse.error) {
      return { success: false, error: parsedResponse.error }
    }

    if (parsedResponse.results && Array.isArray(parsedResponse.results)) {
      parsedResponse.results = this.processRaceResults(parsedResponse.results)
    }

    const finalResult = { success: true, results: parsedResponse.results }
    
    // 成功した場合はキャッシュを更新
    this.lastAnalysisHash = imageUrl.includes('base64,') ? 
      crypto.createHash('md5').update(imageUrl.split('base64,')[1]).digest('hex') + `_${useTotalScore}` : 
      null
    this.lastAnalysisResult = finalResult

    return finalResult
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
    if (this.lastAnalysisHash === currentHash && this.lastAnalysisResult) {
      return this.lastAnalysisResult
    }

    this.isAnalyzing = true

    try {
      const existingMappings = this.getAllPlayerMappings()
      const existingMappingsText = Object.keys(existingMappings).length > 0
        ? `\nFixed Teams: ${Object.entries(existingMappings).map(([p, t]) => `${p}=${t}`).join(',')}`
        : ''

      const prompt = useTotalScore
        ? `Mario Kart 8DX results. Extract into JSON: results: [{name, team, score, isCurrentPlayer(yellow bg)}]. ${existingMappingsText}`
        : `Mario Kart 8DX results. Extract into JSON: results: [{rank, name, team, totalScore, isCurrentPlayer(yellow bg)}]. ${existingMappingsText}`

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

  private async analyzeRaceOpenAI(imageUrl: string, useTotalScore: boolean = false): Promise<AnalyzeRaceResponse> {
    const config = this.configManager.getConfig()
    if (!config.openaiApiKey) {
      throw new Error('OpenAI APIキーが設定されていません')
    }

    if (this.isAnalyzing) {
      throw new Error('現在、別の画像を解析中です。しばらくお待ちください。')
    }

    const base64Data = imageUrl.includes('base64,') ? imageUrl.split('base64,')[1] : imageUrl
    const currentHash = crypto.createHash('md5').update(base64Data).digest('hex') + `_openai_${useTotalScore}`
    if (this.lastAnalysisHash === currentHash && this.lastAnalysisResult) {
      return this.lastAnalysisResult
    }

    this.isAnalyzing = true

    try {
      const existingMappings = this.getAllPlayerMappings()
      const existingMappingsText = Object.keys(existingMappings).length > 0
        ? `\n## existing_player_mappings ##
以下のプレイヤーについては、過去に決定されたチーム名を必ず使用してください：
${Object.entries(existingMappings).map(([p, t]) => `- "${p}" → "${t}"`).join('\n')}\n`
        : ''

      const prompt = `あなたはマリオカート8DXのレース結果画面を解析するエキスパートです。
画像から全プレイヤーの情報を抽出し、指定されたJSON形式で出力してください。
${useTotalScore ? '総合得点（画面右端の数字）を抽出してください。' : '順位、ユーザー名、合計得点を抽出してください。'}
${existingMappingsText}
チーム名は、同じ名前の先頭文字を持つプレイヤー同士で最長の共通部分をチーム名としてください。
出力は純粋なJSONのみとし、Markdownの装飾（\`\`\`jsonなど）は含めないでください。

出力形式:
{
  "results": [
    {
      "rank": 順位(数値),
      "name": "ユーザー名",
      "team": "チーム名",
      "totalScore": スコア(数値),
      "isCurrentPlayer": 背景が黄色ならtrue(boolean)
    }
  ]
}`

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
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
          max_tokens: 1000
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`)
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

      throw new Error('OpenAIからのレスポンスを解析できませんでした')
    } finally {
      this.isAnalyzing = false
    }
  }

  private processRaceResults(results: any[]): RaceResult[] {
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
      
      if (res.name && updatedMappings[res.name]) {
        res.team = updatedMappings[res.name]
      }
    })

    return results
  }

  async getModels(): Promise<string[]> {
    try {
      const config = this.configManager.getConfig()
      const apiKey = config.geminiApiKey || ''
      
      const defaultModels = [
        'gemini-2.0-flash', 
        'gemini-2.0-flash-lite-preview-02-05', 
        'gemini-1.5-flash', 
        'gemini-1.5-pro',
        'gemini-1.5-flash-8b'
      ]

      if (!apiKey) {
        return defaultModels
      }

      // 1時間以内のキャッシュがあればそれを返す
      if (this.modelsCache && 
          this.modelsCache.apiKey === apiKey && 
          Date.now() - this.modelsCache.timestamp < 3600000) {
        return this.modelsCache.models
      }

      // Fetch models from Groq API
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      
      return new Promise((resolve) => {
        const https = require('https')
        https.get(url, (res: any) => {
          let data = ''
          res.on('data', (chunk: any) => { data += chunk })
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data)
              if (parsed.models && Array.isArray(parsed.models)) {
                const models = parsed.models
                  .filter((m: any) => m.supportedGenerationMethods.includes('generateContent'))
                  .map((m: any) => m.name.replace('models/', ''))
                  .filter((name: string) => name.startsWith('gemini-'))
                
                if (models.length > 0) {
                  // キャッシュを更新
                  this.modelsCache = {
                    models,
                    apiKey,
                    timestamp: Date.now()
                  }
                  resolve(models)
                  return
                }
              }
              resolve(defaultModels)
            } catch (e) {
              resolve(defaultModels)
            }
          })
        }).on('error', () => {
          resolve(defaultModels)
        })
      })
    } catch (error) {
      console.error('Error fetching Gemini models:', error)
      return [
        'gemini-2.0-flash', 
        'gemini-2.0-flash-lite', 
        'gemini-1.5-flash', 
        'gemini-1.5-pro',
        'gemini-1.5-flash-8b'
      ]
    }
  }
}
