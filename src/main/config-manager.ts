import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export interface Config {
  obsIp: string
  obsPort: number
  obsPassword: string
  obsSourceName: string
  aiProvider: 'groq' | 'openai' | 'groq'
  geminiApiKey: string
  geminiApiKeys: string[]
  geminiModel: string
  openaiApiKey: string
  groqApiKey: string
  theme: 'light' | 'dark'
  showRemainingRaces: boolean
  language: string
  lastSeenVersion: string
  lastReleaseNotes: string
  overlayColors: {
    background: string
    text: string
    accent: string
  }
  scoreSettings: {
    maxRaces: number
    points: number[]
    keepScoreOnRestart: boolean
  }
}

export class ConfigManager {
  private configPath: string
  private fallbackConfigPath: string
  private envPath: string
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
    } catch (error) {
      this.configPath = path.join(__dirname, 'config.json')
      this.fallbackConfigPath = this.configPath
      this.isElectron = false
    }
    this.envPath = path.join(__dirname, '..', '..', '.env')
    this.loadConfig()
  }

  getDefaultConfig(): Config {
    return {
      obsIp: '127.0.0.1',
      obsPort: 4455,
      obsPassword: '',
      obsSourceName: '映像キャプチャデバイス',
      aiProvider: 'groq',
      geminiApiKey: '',
      geminiApiKeys: [],
      geminiModel: 'gemini-1.5-flash-8b',
      openaiApiKey: '',
      groqApiKey: '',
      theme: 'light',
      showRemainingRaces: true,
      language: 'ja',
      lastSeenVersion: '',
      lastReleaseNotes: '',
      overlayColors: {
        background: 'rgba(15, 23, 42, 0.9)',
        text: '#f8fafc',
        accent: '#3b82f6'
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

  async loadConfig(): Promise<Config> {
    try {
      let config: Partial<Config> | null = null

      if (fs.existsSync(this.configPath)) {
        try {
          const configData = fs.readFileSync(this.configPath, 'utf8')
          config = JSON.parse(configData)
        } catch (parseError) {
          console.error('Error parsing config from primary path:', parseError)
        }
      }

      if (!config && this.fallbackConfigPath !== this.configPath && fs.existsSync(this.fallbackConfigPath)) {
        try {
          const configData = fs.readFileSync(this.fallbackConfigPath, 'utf8')
          config = JSON.parse(configData)
          if (this.isElectron && config) {
            await this.saveConfig(config as Config)
          }
        } catch (parseError) {
          console.error('Error parsing config from fallback path:', parseError)
        }
      }

      if (!config) {
        config = this.getDefaultConfig()
        await this.saveConfig(config as Config)
      }

      this.currentConfig = { ...this.getDefaultConfig(), ...config }
      return this.currentConfig
    } catch (error) {
      console.error('設定読み込みエラー:', error)
      this.currentConfig = this.getDefaultConfig()
      return this.currentConfig
    }
  }

  async saveConfig(config: Config): Promise<void> {
    try {
      this.currentConfig = { ...this.getDefaultConfig(), ...config }
      fs.writeFileSync(this.configPath, JSON.stringify(this.currentConfig, null, 2))
    } catch (error) {
      console.error('設定保存エラー:', error)
    }
  }
}
