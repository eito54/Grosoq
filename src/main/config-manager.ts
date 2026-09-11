import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { app, safeStorage } from 'electron'

export interface OverlayColors {
  /** スコア加算時のフラッシュ/カウントアップの光の色 (#rrggbb) */
  scoreEffect: string
  /** 自チーム枠の強調スタイル */
  ownTeamStyle: 'solid' | 'rainbow' | 'gradient'
  /** 単色スタイル時の自チーム枠の色 (#rrggbb) */
  ownTeamColor: string
  /** グラデーションスタイル時のバリエーション */
  ownTeamGradient: string
}

export interface OverlayAnimations {
  speed: number
  rankAnim: boolean
  flash: boolean
}

export interface StandingsCalibration {
  colAStartX: number
  colAEndX: number
  colBStartX: number
  colBEndX: number
  /** 2列共通の縦範囲（全高に対する%） */
  startY: number
  endY: number
}

/**
 * 校正プリセット（3枠固定）。
 * キーは解析コンテキストと対応する:
 *   mk8dx = 標準モード×MK8DX / mkw12 = 標準モード×MK World / mkw24 = 24人スタンド×MK World
 */
export interface CalibrationPresets {
  mk8dx: StandingsCalibration | null
  mkw12: StandingsCalibration | null
  mkw24: StandingsCalibration | null
}

/** 現在の解析コンテキスト（モード×対象ゲーム）に対応するプリセットキー */
export function getCalibrationContextKey(cfg: Pick<Config, 'analysisMode' | 'standardGame'>): keyof CalibrationPresets {
  if (cfg.analysisMode === 'standings24') return 'mkw24'
  return cfg.standardGame === 'mkworld' ? 'mkw12' : 'mk8dx'
}

/**
 * 解析時に使用すべき校正値を解決する。
 * 優先順位: 現在のコンテキストの保存済みプリセット → 従来のスタンドアロン校正值(フォールバック)。
 * レンダラ側での状態同期を行わないため、UI編集値がバックグラウンドで破壊されることはない。
 */
export function resolveStandingsCalibration(cfg: Config): StandingsCalibration {
  const key = getCalibrationContextKey(cfg)
  const preset = cfg.standingsCalibrationPresets?.[key]
  return preset ?? cfg.standingsCalibration
}

export interface Config {
  obsIp: string
  obsPort: number
  obsPassword: string
  obsSourceName: string
  aiProvider: 'groq'
  /** 解析モード: standard12 = 従来の12人レース結果解析 / standings24 = 24人スタンド読取(左半分クロップ) */
  analysisMode: 'standard12' | 'standings24'
  groqApiKey: string
  theme: 'light' | 'dark'
  showRemainingRaces: boolean
  language: string
  lastSeenVersion: string
  lastReleaseNotes: string
  overlayTheme: 'default' | 'mkw'
  overlayColors: OverlayColors
  overlayAnimations: OverlayAnimations
  /** スコア設定(standard12)の対象ゲーム。校正プリセット(mk8dx/mkw12)の自動切替に使用 */
  standardGame: 'mk8dx' | 'mkworld'
  /** スタンド24モードの列ごとクロップ範囲（全幅/全高に対する%）。列A=左列, 列B=右列 */
  standingsCalibration: StandingsCalibration
  /** ゲーム別の校正プリセット（3枠固定）。詳細は getCalibrationPresetKey() 参照 */
  standingsCalibrationPresets: CalibrationPresets
  scoreSettings: {
    maxRaces: number
    points: number[]
    keepScoreOnRestart: boolean
  }
}

/** プレーンオブジェクトのみ再帰マージする（配列・クラスインスタンスは上書き） */
function deepMerge<T>(base: T, override: Partial<T> | null | undefined): T {
  if (override === null || override === undefined) return base
  if (Array.isArray(base) || Array.isArray(override)) return override as T
  if (typeof base !== 'object' || typeof override !== 'object') {
    // undefinedの上書きは無視（キー欠損扱い）
    return (override === undefined ? base : override) as T
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    if (value === undefined) continue
    const baseValue = (base as Record<string, unknown>)[key]
    result[key] =
      typeof baseValue === 'object' && baseValue !== null && typeof value === 'object' && value !== null && !Array.isArray(baseValue) && !Array.isArray(value)
        ? deepMerge(baseValue, value)
        : value
  }
  return result as T
}

export class ConfigManager {
  private configPath: string
  private fallbackConfigPath: string
  private isElectron: boolean
  private currentConfig: Config

  constructor() {
    this.currentConfig = this.getDefaultConfig()
    try {
      if (app && app.getPath) {
        this.configPath = path.join(app.getPath('userData'), 'config.json')
        this.fallbackConfigPath = path.join(__dirname, 'config.json')
        this.isElectron = true
      } else {
        this.configPath = path.join(__dirname, 'config.json')
        this.fallbackConfigPath = this.configPath
        this.isElectron = false
      }
    } catch {
      this.configPath = path.join(__dirname, 'config.json')
      this.fallbackConfigPath = this.configPath
      this.isElectron = false
    }
    // loadConfig() は起動シーケンス (index.ts) からのみ呼び出す。
    // コンストラクタで二重に走らせると、初回起動時にデフォルト保存が
    // 競合して書き込みがインターリーブする可能性がある。
  }

  getDefaultConfig(): Config {
    return {
      obsIp: '127.0.0.1',
      obsPort: 4455,
      obsPassword: '',
      obsSourceName: '映像キャプチャデバイス',
      aiProvider: 'groq',
      analysisMode: 'standard12',
      /** 標準モードでの解析対象ゲーム（校正プリセットの自動選択に使用） */
      standardGame: 'mk8dx',
      groqApiKey: '',
      theme: 'light',
      showRemainingRaces: true,
      language: 'ja',
      lastSeenVersion: '',
      lastReleaseNotes: '',
      overlayTheme: 'default',
      overlayColors: {
        scoreEffect: '#22c55e',
        ownTeamStyle: 'rainbow',
        ownTeamColor: '#fbbf24',
        ownTeamGradient: 'blue'
      },
      overlayAnimations: {
        speed: 1.0,
        rankAnim: true,
        flash: true
      },
      standingsCalibration: {
        // 既定値: 左半分(0〜50%)をほぼ全覆盖え。レイアウトによっては列Bが中央を
        // 超えるため、校正UIではXは0〜100%まで設定可能（ユーザーが実幅に合わせて調整）
        colAStartX: 0,
        colAEndX: 24,
        colBStartX: 25,
        colBEndX: 50,
        startY: 0,
        endY: 100
      },
      standingsCalibrationPresets: {
        // 既定では全プリセット未保存（null）。保存すると実レイアウト値が入る
        mk8dx: null,
        mkw12: null,
        mkw24: null
      },
      scoreSettings: {
        maxRaces: 12,
        points: [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
        keepScoreOnRestart: true
      }
    }
  }

  getConfig(): Config {
    return this.currentConfig
  }

  /**
   * 設定JSONをディスクに書く形式にシリアライズする。
   * safeStorage が使える環境では APIキー/OBSパスワードを含む設定全体を
   * OSの資格情報ストレージ（Windows では DPAPI）で暗文化して保存する。
   * 使えない環境（一部Linux）では従来通りプレーンJSONで保存する。
   */
  private encodeConfig(config: Config): string {
    const json = JSON.stringify(config, null, 2)
    try {
      if (this.isElectron && safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(json).toString('base64')
        return JSON.stringify({ __enc: 'v1', data: encrypted })
      }
    } catch (error) {
      console.error('Config encryption failed, falling back to plaintext:', error)
    }
    return json
  }

  /** 読み込んだJSON文字列を復号して設定オブジェクトに変換する（プレーンJSONもそのまま受理） */
  private decodeConfig(raw: string): Partial<Config> {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.__enc === 'v1' && typeof parsed.data === 'string') {
      const json = safeStorage.decryptString(Buffer.from(parsed.data, 'base64'))
      return JSON.parse(json) as Partial<Config>
    }
    return parsed as Partial<Config>
  }

  async loadConfig(): Promise<Config> {
    try {
      let stored: Partial<Config> | null = null

      if (fs.existsSync(this.configPath)) {
        try {
          stored = this.decodeConfig(fs.readFileSync(this.configPath, 'utf8'))
        } catch (parseError) {
          console.error('Error parsing config from primary path:', parseError)
        }
      }

      if (!stored && this.fallbackConfigPath !== this.configPath && fs.existsSync(this.fallbackConfigPath)) {
        try {
          stored = this.decodeConfig(fs.readFileSync(this.fallbackConfigPath, 'utf8'))
          if (this.isElectron && stored) {
            await this.saveConfig(stored as Config)
          }
        } catch (parseError) {
          console.error('Error parsing config from fallback path:', parseError)
        }
      }

      // 深いマージにより、ネストした設定(overlayColors等)の一部だけが
      // ディスクに存在する場合でもデフォルト値で補完される
      this.currentConfig = deepMerge(this.getDefaultConfig(), stored)
      // 「マリオカートWii風(mkw)」テーマは完成度の観点から選択肢から一時除外中。
      // オーバーレイ側の実装(public/overlay/index.html)と型は削除せず保持しており、
      // 保存済みの 'mkw' はデフォルトへ正規化してユーザーが選択不可の値に固定されないようにする。
      if (this.currentConfig.overlayTheme !== 'default') {
        this.currentConfig.overlayTheme = 'default'
      }
      if (!stored) {
        await this.saveConfig(this.currentConfig)
      }
      return this.currentConfig
    } catch (error) {
      console.error('設定読み込みエラー:', error)
      this.currentConfig = this.getDefaultConfig()
      return this.currentConfig
    }
  }

  /** 保存要求の直列化キュー。並列保存でtmpリネームが競合しENOENTになるのを防ぐ */
  private saveQueue: Promise<void> = Promise.resolve()

  /** 部分的な設定オブジェクトを受け取り、デフォルトと深くマージして保存する */
  async saveConfig(config: Partial<Config>): Promise<void> {
    // 自動保存(デバウンス)・モード切替・校正パネルなど複数経路からの保存が
    // ほぼ同時に来ても、書き込み→リネームを必ず1つずつ実行させる
    const run = this.saveQueue.then(() => this.doSaveConfig(config))
    // キュー自体は1件の失敗で止めない（次の保存は継続）
    this.saveQueue = run.catch(() => {})
    return run
  }

  private async doSaveConfig(config: Partial<Config>): Promise<void> {
    try {
      const merged = deepMerge(this.currentConfig, config)
      this.currentConfig = merged
      // アトミック書き込み: tmp に書いてから rename（途中クラッシュでの破損防止）
      await fsp.mkdir(path.dirname(this.configPath), { recursive: true })
      // tmpファイル名は呼び出しごとにユニークにする（共有tmp名は並行書き込み時の
      // 「先に片方がrename済みで2件目のrenameがENOENT」の原因になる）
      const tmpPath = `${this.configPath}.${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`
      await fsp.writeFile(tmpPath, this.encodeConfig(merged))
      try {
        await fsp.rename(tmpPath, this.configPath)
      } catch {
        // rename失敗(Windowsでの一時的なロック等)は一度削除してからリトライ
        await fsp.rm(this.configPath, { force: true })
        await fsp.rename(tmpPath, this.configPath)
      }
    } catch (error) {
      console.error('設定保存エラー:', error)
      throw error
    }
  }
}
