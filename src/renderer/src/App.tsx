import React, { useState, useEffect, useCallback, JSX } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import {
  Settings,
  Play,
  BarChart3,
  ExternalLink,
  RefreshCw,
  Monitor,
  Info,
  CheckCircle2,
  Trash2,
  Globe,
  History,
  Save,
  Zap,
  AlertCircle,
  Users,
  Palette,
  Trophy,
  Download,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  Layout,
  Clipboard,
  Check,
  Radio,
  Flag,
  MonitorDown,
  CheckCircle,
  Copy
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import bootLogo from './assets/boot-logo.png'
import mkWorldLogo from './assets/Mario_Kart_World_Logo.png'
import githubIcon from './assets/209816847.jpg'
import twitterIcon from './assets/jHdAfJSd_400x400.jpg'

// 言語セレクター用の対応言語一覧（表示順 = ピルの並び順）
const LANGUAGE_OPTIONS: { code: string; short: string }[] = [
  { code: 'ja', short: '日本語' },
  { code: 'en', short: 'EN' },
  { code: 'fr', short: 'FR' },
  { code: 'es', short: 'ES' }
]

/**
 * クリップボードの内容を指定IDの入力欄へ貼り付ける。
 * ReactのonChangeを発火させるため、ネイティブsetter経由でvalueを設定し
 * inputイベントをバブルさせる（フォームの自動保存にも乗る）。
 */
async function pasteIntoInput(inputId: string): Promise<void> {
  try {
    const text = await navigator.clipboard.readText()
    if (!text) return
    const el = document.getElementById(inputId) as HTMLInputElement | null
    if (!el) return
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setter?.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  } catch {
    // クリップボード読み取り不可の環境では何もしない
  }
}

import { ScanningOverlay } from './components/ScanningOverlay'
import { ColorPicker } from './components/ColorPicker'
import { MessageModal } from './components/MessageModal'
import { ConfirmModal } from './components/ConfirmModal'
import { ReconnectModal } from './components/ReconnectModal'
import { SlotModal } from './components/SlotModal'
import { WhatsNewModal } from './components/WhatsNewModal'
import { ScoreItem } from './components/ScoreItem'
import { SourceSelect } from './components/SourceSelect'
import { GroqModelList } from './components/GroqModelList'
import { StandingsCalibrationPanel } from './components/StandingsCalibration'
import { LogEntry, SlotData } from './types'
import { cn, calculateRaceScore } from './utils'
import { BackgroundEffect } from './components/BackgroundEffect'

// Removed local definitions (CountUp, ScanningOverlay, ColorPicker, MessageModal, ConfirmModal, SlotModal, WhatsNewModal, ScoreItem, cn, calculateRaceScore, LogEntry, SlotData) as they are now imported.

/**
 * 設定フォーム用のトグルスイッチ。
 * App() の中に定義するとレンダーごとに別コンポーネント型とみなされて
 * マウントし直し、内部の checked 状態が黙って巻き戻るため必ずモジュールスコープに置く。
 */
function Toggle({ name, defaultChecked, label, help }: { name: string, defaultChecked: boolean, label: string, help?: string }) {
  const [checked, setChecked] = useState(defaultChecked)

  useEffect(() => {
    setChecked(defaultChecked)
  }, [defaultChecked])

  return (
    <div className="flex items-center justify-between p-4 bg-surface rounded-xl border border-slate-700">
      <div>
        <p className="font-medium text-slate-200">{label}</p>
        {help && <p className="text-xs text-slate-400">{help}</p>}
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-600"></div>
      </label>
    </div>
  )
}

function App(): JSX.Element {
  const { t, i18n } = useTranslation()
  const [config, setConfig] = useState<any>(null)
  const [isConfigInvalid, setIsConfigInvalid] = useState(false)

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reopen' | 'mappings' | 'overlay' | 'settings' | 'about'>('dashboard')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [scores, setScores] = useState<any[]>([])
  const [serverPort, setServerPort] = useState<number>(3001)
  const [isEditing, setIsEditing] = useState(false)
  const [editingScores, setEditingScores] = useState<any[]>([])
  const [slots, setSlots] = useState<any[]>([])
  const [playerMappings, setPlayerMappings] = useState<Record<string, string>>({})
  const [isEditingMappings, setIsEditingMappings] = useState(false)
  const [editingMappings, setEditingMappings] = useState<{ name: string, team: string }[]>([])
  const [appVersion, setAppVersion] = useState<string>('')
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [showUpdateToast, setShowUpdateToast] = useState(false)
  const [showReleaseNotes, setShowReleaseNotes] = useState(false)
  const [showGroqInstructions, setShowGroqInstructions] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [whatsNewInfo, setWhatsNewInfo] = useState<{ version: string, notes: string }>({ version: '', notes: '' })
  const [pendingTab, setPendingTab] = useState<typeof activeTab | null>(null)
  const [updateProgress, setUpdateProgress] = useState<number>(0)
  const [isUpdateDownloaded, setIsUpdateDownloaded] = useState(false)
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false)
  const [isBooting, setIsBooting] = useState(true)
  const isBootingRef = React.useRef(true)
  // 設定フォーム自動保存用（ボタン廃止により送信時スクロールは不要に）
  const copiedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const copiedUrlTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const whatsNewTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTickTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [obsStatus, setObsStatus] = useState(false)
  // OBS詳細ステータス（再接続中フラグ・試行回数・RTT）。品質バッジ表示に使用
  const [obsDetail, setObsDetail] = useState<{ connected: boolean; reconnecting: boolean; attempt: number; latencyMs: number | null }>({ connected: false, reconnecting: false, attempt: 0, latencyMs: null })
  // 設定自動保存成功時の一時インジケータ表示
  const [showSavedTick, setShowSavedTick] = useState(false)
  const [obsInputs, setObsInputs] = useState<any[]>([])
  const [isObsConnecting, setIsObsConnecting] = useState(false)

  // Settings Sub-tabs State
  const [settingsTab, setSettingsTab] = useState<'system' | 'obs' | 'ai'>('system')
  const [liteMode, setLiteMode] = useState(() => {
    return localStorage.getItem('liteMode') === 'true'
  })
  const [bgStyle, setBgStyle] = useState<'planetarium' | 'nebula'>(() => {
    return (localStorage.getItem('bgStyle') as 'planetarium' | 'nebula') || 'planetarium'
  })

  // Persist local settings
  useEffect(() => {
    localStorage.setItem('liteMode', String(liteMode))
    if (liteMode) {
      document.body.classList.add('lite-mode')
    } else {
      document.body.classList.remove('lite-mode')
    }
  }, [liteMode])

  useEffect(() => {
    localStorage.setItem('bgStyle', bgStyle)
  }, [bgStyle])

  const [guiModal, setGuiModal] = useState<{
    type: 'info' | 'error' | 'success',
    title: string,
    message: string
  } | null>(null)

  const showGuiMessage = (type: 'info' | 'error' | 'success', title: string, message: string) => {
    setGuiModal({ type, title, message })
  }
  const [wizardStep, setWizardStep] = useState(0)

  // Custom modal states for Reopen Manager
  const [showSlotNameModal, setShowSlotNameModal] = useState(false)
  const [pendingSlotId, setPendingSlotId] = useState<number | null>(null)
  const [slotModalType, setSlotModalType] = useState<'load' | 'add' | 'delete'>('load')
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false)

  // DC対策モーダル状態
  const [reconnectCandidates, setReconnectCandidates] = useState<Array<{ name: string; previous: number; candidate: number }>>([])
  const [showReconnectModal, setShowReconnectModal] = useState(false)
  const pendingFinalRef = React.useRef<{ finalScores: any[]; prevList: any[] } | null>(null)

  // Overlay preview states
  const [selectedOverlayTheme, setSelectedOverlayTheme] = useState<string>('default')
  const [selectedOwnTeamStyle, setSelectedOwnTeamStyle] = useState<string>('rainbow')
  const [overlayTab, setOverlayTab] = useState<'general' | 'theme' | 'animation'>('general')

  // Persist manually selected current team
  const [manualCurrentTeam, setManualCurrentTeam] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)
  const [isCopiedUrl, setIsCopiedUrl] = useState(false)

  // Overlay Preview Refs and state
  const previewIframeRef = React.useRef<HTMLIFrameElement>(null)
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => {
    setPreviewUrl(`http://localhost:${serverPort}/?overlay=true&preview=true`)
  }, [serverPort])

  // プレビューiframeへのpostMessageはオーバーレイに公開してよい設定のみを
  // 射影して送る（APIキー等のシークレットは絶対に含めない）。
  // サーバー側 /api/config の sanitizeConfigForOverlay と同じ方針。
  const previewOrigin = `http://localhost:${serverPort}`
  const sanitizeConfigForPreview = useCallback((cfg: any) => ({
    overlayTheme: cfg.overlayTheme,
    overlayColors: cfg.overlayColors,
    overlayAnimations: cfg.overlayAnimations,
    showRemainingRaces: cfg.showRemainingRaces
  }), [])

  // Sync config changes to preview in real-time
  const sendPreviewData = useCallback(() => {
    if (previewIframeRef.current && config) {
      previewIframeRef.current.contentWindow?.postMessage({
        type: 'updateConfig',
        config: sanitizeConfigForPreview(config)
      }, previewOrigin)
    }
  }, [config, sanitizeConfigForPreview, previewOrigin])

  useEffect(() => {
    sendPreviewData()

    // Listen for iframe ready signal
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== previewOrigin) return
      if (event.data?.type === 'overlayReady') {
        console.log('Preview iframe reported ready, initiating sandbox...')
        sendPreviewData()

        // Send localized 4-team placeholder for preview (Sandboxed from real scores)
        if (previewIframeRef.current) {
          const placeholderScores = Array.from({ length: 4 }, (_, i) => ({
            name: `Team ${String.fromCharCode(65 + i)}`,
            score: 0,
            addedScore: 0,
            isCurrentPlayer: i === 0,
            rank: i + 1
          }))
          previewIframeRef.current.contentWindow?.postMessage({
            type: 'updateScores',
            scores: placeholderScores
          }, previewOrigin)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [sendPreviewData, previewOrigin])

  const handlePlayDemo = () => {
    if (previewIframeRef.current) {
      // Simulate random race results
      const demoScores = Array.from({ length: 4 }, (_, i) => ({
        name: `Team ${String.fromCharCode(65 + i)}`,
        score: Math.floor(Math.random() * 100),
        addedScore: Math.floor(Math.random() * 15),
        isCurrentPlayer: i === 0,
        rank: i + 1
      })).sort((a, b) => b.score - a.score)

      previewIframeRef.current.contentWindow?.postMessage({
        type: 'updateScores',
        scores: demoScores
      }, previewOrigin)
    }
  }


  const handleCloseWhatsNew = async () => {
    setShowWhatsNew(false)
    if (window.electron && window.electron.ipcRenderer) {
      await window.electron.ipcRenderer.invoke('mark-whats-new-seen')
    }
  }

  const addLog = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [{
      message,
      type,
      timestamp: new Date().toLocaleTimeString()
    }, ...prev].slice(0, 50))
  }, [])

  const handleCheckUpdate = useCallback(async (silent = false) => {
    if (!window.electron || !window.electron.ipcRenderer) return

    if (!silent) setIsCheckingUpdate(true)
    try {
      console.log('Starting update check...');
      const result = await window.electron.ipcRenderer.invoke('check-for-updates')
      console.log('Update check result:', result);

      if (result.success === false) {
        if (!silent) addLog(t('log.updateCheckError', { error: result.error }), 'error')
        return
      }

      if (result.hasUpdate) {
        setUpdateInfo(result)
        setShowUpdateToast(true)
        if (!silent) {
          const displayCurrent = result.currentVersion || t('log.unknown')
          const displayLatest = result.latestVersion || t('log.unknown')
          addLog(t('log.updateAvailable', { latest: displayLatest, current: displayCurrent }), 'info')
        }
      } else {
        if (!silent) {
          const displayCurrent = result.currentVersion || t('log.unknown')
          addLog(t('log.upToDate', { current: displayCurrent }), 'success')
        }
      }
    } catch (error: any) {
      console.error('handleCheckUpdate global error:', error);
      const errorMsg = error.message || JSON.stringify(error)
      if (!silent) addLog(t('log.updateCheckFailed', { error: errorMsg }), 'error')
    } finally {
      if (!silent) setIsCheckingUpdate(false)
    }
  }, [addLog, t])

  const handleStartDownloadUpdate = async () => {
    if (!window.electron || !window.electron.ipcRenderer) return
    setIsDownloadingUpdate(true)
    addLog(t('log.downloadStart'), 'info')
    await window.electron.ipcRenderer.invoke('start-download-update')
  }

  const handleQuitAndInstall = () => {
    if (!window.electron || !window.electron.ipcRenderer) return
    window.electron.ipcRenderer.invoke('quit-and-install')
  }

  useEffect(() => {
    const handleObsStatus = (_event: any, isConnected: boolean) => {
      setObsStatus(isConnected)
      if (isConnected) {
        window.electron.ipcRenderer.invoke('obs-get-inputs').then((result: any) => {
          if (result.success) setObsInputs(result.inputs)
        })
      }
    }
    // 接続品質・再接続状況を含む詳細ステータス
    const handleObsDetail = (_event: any, detail: { connected: boolean; reconnecting: boolean; attempt: number; latencyMs: number | null }) => {
      setObsDetail(detail)
      setObsStatus(detail.connected)
    }
    window.electron?.ipcRenderer?.on('obs-status-change', handleObsStatus)
    window.electron?.ipcRenderer?.on('obs-status-detail', handleObsDetail)

    // Initial check
    window.electron?.ipcRenderer?.invoke('obs-status-detail').then((detail: any) => {
      if (detail) {
        setObsDetail(detail)
        setObsStatus(!!detail.connected)
        if (detail.connected) {
          window.electron?.ipcRenderer?.invoke('obs-get-inputs').then((result: any) => {
            if (result.success) setObsInputs(result.inputs)
          })
        }
      }
    })

    return () => {
      window.electron?.ipcRenderer?.removeListener('obs-status-change', handleObsStatus)
      window.electron?.ipcRenderer?.removeListener('obs-status-detail', handleObsDetail)
    }
  }, [])

  const toggleObsConnection = async () => {
    if (obsStatus) {
      await window.electron.ipcRenderer.invoke('obs-disconnect')
    } else {
      setIsObsConnecting(true)
      try {
        const result = await window.electron.ipcRenderer.invoke('obs-connect', config)
        if (!result.success) {
          showGuiMessage('error', t('msgGui.obsErrorTitle'), result.error)
        } else {
          // Connected! If source name is empty, try to find a good one
          if (!config?.obsSourceName) {
            const sourceResult = await window.electron.ipcRenderer.invoke('obs-find-best-source')
            if (sourceResult.success && sourceResult.sourceName) {
              const updatedConfig = { ...config, obsSourceName: sourceResult.sourceName }
              setConfig(updatedConfig)
              window.electron.ipcRenderer.invoke('save-config', updatedConfig)
            }
          }
        }
      } finally {
        setIsObsConnecting(false)
      }
    }
  }

  const autoDetectObsSettings = async () => {
    const result = await window.electron.ipcRenderer.invoke('obs-detect-settings')
    if (result.success && result.settings) {
      const { port, password, enabled } = result.settings
      const updatedConfig = { ...config, obsPort: port, obsPassword: password }
      setConfig(updatedConfig)
      setIsDirty(true)

      if (!enabled) {
        showGuiMessage('info', t('msgGui.obsLoadedTitle'), t('msgGui.obsLoadedMsg'))
      } else {
        showGuiMessage('info', t('msgGui.success'), t('msgGui.obsDetected'))
      }
    } else {
      showGuiMessage('error', t('msgGui.error'), t('msgGui.obsConfigNotFound'))
    }
  }

  const autoSetupObsOverlay = async () => {
    // 未接続でもワンクリックで完結できるよう、設定があれば自動接続を試みる
    let connected = obsStatus
    if (!connected && config?.obsIp && config?.obsPort) {
      try {
        await window.electron.ipcRenderer.invoke('obs-connect', config)
        const detail = await window.electron.ipcRenderer.invoke('obs-status-detail')
        connected = !!detail?.connected
      } catch {
        connected = false
      }
    }
    if (!connected) {
      showGuiMessage('info', t('msgGui.obsTitle'), t('msgGui.obsConnectFirst'))
      return
    }
    const result = await window.electron.ipcRenderer.invoke('obs-auto-setup')
    if (result.success) {
      showGuiMessage('info', t('msgGui.success'), t('msgGui.obsOverlayAdded'))
    } else {
      showGuiMessage('error', t('msgGui.error'), result.error)
    }
  }

  // 操作画面から解析モード（標準12人 / 24人スタンド）を切り替える
  const handleAnalysisModeChange = async (mode: 'standard12' | 'standings24') => {
    if (!config || config.analysisMode === mode) return

    const newConfig = { ...config, analysisMode: mode }
    setConfig(newConfig)

    try {
      if (!window.electron || !window.electron.ipcRenderer) return
      const result = await window.electron.ipcRenderer.invoke('save-config', newConfig)
      if (result.success) {
        addLog(mode === 'standings24'
          ? t('config.analysisModeStandings') + t('messages.analysisModeSwitchedSuffix')
          : t('config.analysisModeStandard') + t('messages.analysisModeSwitchedSuffix'), 'success')
      } else {
        addLog(t('messages.configSaveError'), 'error')
      }
    } catch (error) {
      addLog(t('messages.configSaveError'), 'error')
    }
  }

  // 操作画面から標準モード(12人)の解析対象ゲーム（MK8DX / MK World）を切り替える
  const handleStandardGameChange = async (game: 'mk8dx' | 'mkworld') => {
    if (!config || config.standardGame === game) return

    const newConfig = { ...config, standardGame: game }
    setConfig(newConfig)

    try {
      if (!window.electron || !window.electron.ipcRenderer) return
      const result = await window.electron.ipcRenderer.invoke('save-config', newConfig)
      if (result.success) {
        addLog((game === 'mkworld' ? t('config.gameMkw') : t('config.gameMk8dx')) + t('messages.analysisModeSwitchedSuffix'), 'success')
      } else {
        addLog(t('messages.configSaveError'), 'error')
      }
    } catch (error) {
      addLog(t('messages.configSaveError'), 'error')
    }
  }

  // (注) モード/ゲーム切替時のプリセット自動適用は廃止した。
  // 起動直後にも発火して既存の校正值をプリセット値で静かに上書きする事故が起きたため、
  // 使用値の解決はメインプロセスの resolveStandingsCalibration() が解析時に都度行う。

  const loadConfig = useCallback(async () => {
    try {
      if (!window.electron || !window.electron.ipcRenderer) {
        console.warn('Electron IPC is not available. This might be expected in a browser preview.')
        return
      }
      const cfg = await window.electron.ipcRenderer.invoke('get-config')

      // デフォルト値の補完・深いマージはメインプロセス(ConfigManager)側で行われるため、
      // ここではネットワーク系の正規化のみ行う
      if (cfg) {
        if (!cfg.obsIp || cfg.obsIp === 'localhost') {
          cfg.obsIp = '127.0.0.1'
        }
        if (!cfg.obsPort) {
          cfg.obsPort = 4455
        }
        if (!cfg.obsSourceName) {
          cfg.obsSourceName = '映像キャプチャデバイス'
        }
      }

      setConfig(cfg)
      setIsConfigInvalid(!cfg?.obsIp || !cfg?.obsPort || !cfg?.obsSourceName || !cfg?.groqApiKey)


      // Auto-connect to OBS on startup if configured
      if (cfg?.obsIp && cfg?.obsPort) {
        window.electron.ipcRenderer.invoke('obs-connect', cfg)
      }

      if (cfg) {
        if (cfg.language && i18n.language !== cfg.language) {
          i18n.changeLanguage(cfg.language)
        }
        if (cfg.overlayTheme) {
          setSelectedOverlayTheme(cfg.overlayTheme)
        }
        if (cfg.overlayColors?.ownTeamStyle) {
          setSelectedOwnTeamStyle(cfg.overlayColors.ownTeamStyle)
        }
      }
    } catch (error) {
      console.error('Failed to load config:', error)
      addLog(t('log.configLoadFailed'), 'error')
    }
  }, [addLog, i18n])

  const loadScores = useCallback(async () => {
    if (!serverPort) return
    try {
      const response = await fetch(`http://localhost:${serverPort}/api/scores`)
      const data = await response.json()
      setScores(data.scores || [])
    } catch (error) {
      console.error('Failed to load scores:', error)
    }
  }, [serverPort])

  const loadPlayerMappings = useCallback(async () => {
    if (!serverPort) return
    try {
      const response = await fetch(`http://localhost:${serverPort}/api/player-mapping`)
      const data = await response.json()
      setPlayerMappings(data || {})
    } catch (error) {
      console.error('Failed to load player mappings:', error)
    }
  }, [serverPort])

  const fetchSlots = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:${serverPort}/api/reopen-slots`)
      const data = await response.json()
      setSlots(data)
    } catch (error) {
      console.error('Failed to fetch slots:', error)
    }
  }, [serverPort])


  const handleFetchResults = useCallback(async (useTotalScore: boolean = false) => {
    if (status === 'loading') return
    if (!window.electron || !window.electron.ipcRenderer) return

    const isStandingsMode = config?.analysisMode === 'standings24'
    const effectiveTotal = useTotalScore || isStandingsMode

    setStatus('loading')
    addLog(isStandingsMode ? t('log.fetchingStandings') : effectiveTotal ? t('log.fetchingTotals') : t('log.fetchingRace'), 'info')

    try {
      // チーム合計点を取得（useTotalScore）時は、解析前にプレイヤーマッピングをリセット
      if (effectiveTotal) {
        await fetch(`http://localhost:${serverPort}/api/player-mapping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })
        loadPlayerMappings() // UI側の状態も即座にリセット
      }

      const result = await window.electron.ipcRenderer.invoke('fetch-race-results', effectiveTotal)

      if (result.success) {
        setStatus('success')
        addLog(t('log.fetchSuccess'), 'success')

        // Process results and update scores via server API
        const raceResults = result.results

        // チーム統合ロジック（旧バージョンの再現: 1文字目が同じチームを統合）
        const normalizeAndMergeTeams = (teams: any[]) => {
          const firstCharGroups: Record<string, any[]> = {}

          teams.forEach((teamData) => {
            const teamName = teamData.name || teamData.team
            if (!teamName) return
            const firstChar = teamName.charAt(0).toUpperCase()
            if (!firstCharGroups[firstChar]) {
              firstCharGroups[firstChar] = []
            }
            firstCharGroups[firstChar].push(teamData)
          })

          const mergedList: any[] = []

          Object.entries(firstCharGroups).forEach(([_firstChar, group]) => {
            if (group.length === 1) {
              mergedList.push(group[0])
            } else {
              // 複数のチームがある場合は統合。スコアが最も高いチームを代表名にする
              let mainTeam = group[0]
              group.forEach((t) => {
                if ((t.score || 0) > (mainTeam.score || 0)) mainTeam = t
              })

              const mergedData = {
                name: mainTeam.name || mainTeam.team,
                score: 0,
                addedScore: 0,
                isCurrentPlayer: false
              }

              group.forEach((t) => {
                mergedData.score += t.score || 0
                mergedData.addedScore += t.addedScore || 0
                mergedData.isCurrentPlayer = mergedData.isCurrentPlayer || t.isCurrentPlayer
              })
              mergedList.push(mergedData)
            }
          })
          return mergedList
        }

        let finalScores: any[] = []

        if (effectiveTotal) {
          // 総合スコアの場合は、既存スコアを無視して新規作成（リセットして上書き）
          const tempMap: Record<string, any> = {}
          raceResults.forEach((res: any) => {
            const teamName = res.team || 'UNKNOWN'
            const score = res.score || res.totalScore || 0
            if (!tempMap[teamName]) {
              tempMap[teamName] = { name: teamName, score: 0, addedScore: 0, isCurrentPlayer: false }
            }
            tempMap[teamName].score += score
            tempMap[teamName].isCurrentPlayer = tempMap[teamName].isCurrentPlayer || res.isCurrentPlayer
          })
          finalScores = normalizeAndMergeTeams(Object.values(tempMap))
        } else {
          // レース結果の場合は、既存スコアをロードして加算
          const currentScoresResponse = await fetch(`http://localhost:${serverPort}/api/scores`)
          const currentData = await currentScoresResponse.json()
          const currentScores = currentData.scores || []

          const tempMap: Record<string, any> = {}
          // 既存のチームスコアをマップに展開
          currentScores.forEach((s: any) => {
            const name = s.name || s.team
            tempMap[name] = { ...s, addedScore: 0 }
          })

          // 今回のレース結果を計算して加算
          raceResults.forEach((res: any) => {
            const teamName = res.team || 'UNKNOWN'
            const score = calculateRaceScore(res.rank)

            if (!tempMap[teamName]) {
              tempMap[teamName] = { name: teamName, score: 0, addedScore: 0, isCurrentPlayer: false }
            }
            delete tempMap[teamName].absent // B-3 欠席保持: 今回の読取に現れたチームは通常表示に戻す
            tempMap[teamName].score += score
            tempMap[teamName].addedScore += score // 今回の加算分を記録
            tempMap[teamName].isCurrentPlayer = tempMap[teamName].isCurrentPlayer || res.isCurrentPlayer
          })
          finalScores = normalizeAndMergeTeams(Object.values(tempMap))
        }


        if (manualCurrentTeam) {
          finalScores.forEach(s => {
            const tName = s.name || s.team;
            if (tName === manualCurrentTeam) {
              s.isCurrentPlayer = true;
            } else {
              s.isCurrentPlayer = false;
            }
          });
        }

        // 自チームフラグのクリーンアップ（複数のチームに立つのを防ぐ）
        const hasCurrentPlayer = finalScores.some((s) => s.isCurrentPlayer)
        if (hasCurrentPlayer) {
          const mainCurrentTeam = finalScores.find((s) => s.isCurrentPlayer)
          finalScores.forEach((s) => {
            if (s !== mainCurrentTeam) s.isCurrentPlayer = false
          })
        }

        // DC対策: 前回保存値との比較で減少(再入室)を検出
        if (effectiveTotal) {
          let offsets: Record<string, number> = {}
          try {
            const offRes = await fetch(`http://localhost:${serverPort}/api/reconnect-offsets`)
            offsets = await offRes.json()
          } catch { /* 初回はファイルなし */ }
          const prevRes = await fetch(`http://localhost:${serverPort}/api/scores`)
          const prevData = await prevRes.json()
          const prevList: any[] = Array.isArray(prevData.scores) ? prevData.scores : []

          const keyOf = (e: any) => e.name || e.team
          finalScores.forEach((s: any) => {
            s.score = (s.score || 0) + (offsets[keyOf(s)] || 0)
          })
          const candidates = finalScores
            .map((s: any) => {
              const prev = prevList.find((o: any) => keyOf(o) === keyOf(s))
              return prev && (prev.score || 0) > 0 && s.score < prev.score
                ? { name: keyOf(s), previous: prev.score, candidate: s.score }
                : null
            })
            .filter(Boolean) as Array<{ name: string; previous: number; candidate: number }>

          // 変化ハイライト: dc補正後の値と前回保存値の差分を addedScore に記録
          const applyDeltas = (list: any[]) => {
            list.forEach((s: any) => {
              const prev = prevList.find((o: any) => keyOf(o) === keyOf(s))
              s.addedScore = prev ? Math.max(0, (s.score || 0) - (prev.score || 0)) : 0
            })
          }
          applyDeltas(finalScores)

          // B-3 欠席保持: 前回存在したが今回の読取にないチームを最終値のまま残す
          const presentKeys = new Set(finalScores.map(keyOf))
          prevList.forEach((o: any) => {
            if ((o.score || 0) > 0 && !presentKeys.has(keyOf(o))) {
              finalScores.push({ ...o, absent: true, addedScore: 0 })
            }
          })

          if (candidates.length > 0) {
            pendingFinalRef.current = { finalScores, prevList }
            setReconnectCandidates(candidates)
            setShowReconnectModal(true)
            setStatus('idle')
            return
          }

          await fetch(`http://localhost:${serverPort}/api/reconnect-offsets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(offsets)
          })
        }

        await fetch(`http://localhost:${serverPort}/api/scores?isOverallUpdate=${effectiveTotal}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalScores)
        })

        loadScores()
        // loadPlayerMappings() // Removed as per instruction
      } else {
        setStatus('error')
        addLog(t('log.fetchError', { error: result.error }), 'error')
        showGuiMessage('error', t('msgGui.error'), result.error)
      }
    } catch (error: any) {
      setStatus('error')
      addLog(t('log.networkError', { error: error.message }), 'error')
    }
  }, [status, addLog, serverPort, loadScores, loadPlayerMappings, manualCurrentTeam, config])

  const resolveReconnect = useCallback(async (restore: boolean) => {
    const pendingSave = pendingFinalRef.current
    if (!pendingSave) { setShowReconnectModal(false); return }
    const { finalScores, prevList } = pendingSave
    try {
      const keyOf = (e: any) => e.name || e.team
      const offRes = await fetch(`http://localhost:${serverPort}/api/reconnect-offsets`)
      const offsets: Record<string, number> = await offRes.json()
      reconnectCandidates.forEach((c) => {
        if (restore) {
          offsets[c.name] = (offsets[c.name] || 0) + (c.previous - c.candidate)
          const target = finalScores.find((s: any) => (s.name || s.team) === c.name)
          if (target) target.score = c.previous
        } else {
          offsets[c.name] = 0
        }
      })
      // 変化ハイライト: 復元/維持調整後の値で差分を再計算
      finalScores.forEach((s: any) => {
        const prev = prevList.find((o: any) => keyOf(o) === keyOf(s))
        s.addedScore = prev ? Math.max(0, (s.score || 0) - (prev.score || 0)) : 0
      })
      await fetch(`http://localhost:${serverPort}/api/reconnect-offsets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(offsets)
      })
      await fetch(`http://localhost:${serverPort}/api/scores?isOverallUpdate=${config?.analysisMode === 'standings24'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalScores)
      })
      loadScores()
      addLog(restore ? t('log.dcRestored') : t('log.dcKept'), restore ? 'success' : 'info')
    } catch (error: any) {
      addLog(t('log.saveFailed', { error: error.message }), 'error')
    } finally {
      pendingFinalRef.current = null
      setReconnectCandidates([])
      setShowReconnectModal(false)
    }
  }, [reconnectCandidates, serverPort, loadScores, addLog, config])

  // Ref for handlers used in Electron listeners to avoid stale closures
  const handleFetchResultsRef = React.useRef(handleFetchResults)
  useEffect(() => {
    handleFetchResultsRef.current = handleFetchResults
  }, [handleFetchResults])

  // 初回レンダーのクロージャで生存し続けるリスナー(t)から最新の翻訳関数を参照するためのRef
  const tRef = React.useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])


  const handleStartEdit = () => {
    setEditingScores(JSON.parse(JSON.stringify(scores)))
    setIsEditing(true)
  }

  const handleSaveEditedScores = async (passedScores?: any[]) => {
    try {
      const scoresToSave = (passedScores || editingScores).map(s => ({ ...s, addedScore: 0 }))
      await fetch(`http://localhost:${serverPort}/api/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scoresToSave)
      })
      setIsEditing(false)
      loadScores()
      addLog(t('log.scoreUpdated'), 'success')
    } catch (error) {
      addLog(t('log.scoreUpdateFailed'), 'error')
    }
  }

  const handleScoreChange = (index: number, field: string, value: any) => {
    const newScores = JSON.parse(JSON.stringify(editingScores))
    if (field === 'name') {
      newScores[index].name = value
      newScores[index].team = value
    } else {
      newScores[index][field] = field === 'score' ? parseInt(value) || 0 : value
    }
    setEditingScores(newScores)
  }

  const handleAddTeam = () => {
    setEditingScores([...editingScores, { name: 'New Team', team: 'New Team', score: 0 }])
  }

  const handleRemoveTeam = (index: number) => {
    const newScores = [...editingScores]
    newScores.splice(index, 1)
    setEditingScores(newScores)
  }


  // Modal trigger handlers
  const handleSaveSlot = useCallback(async (slotId: number) => {
    const slot = slots.find(s => s.slotId === slotId)
    const name = slot ? slot.name : t('log.slotAutoName', { n: slotId + 1, time: new Date().toLocaleTimeString() })

    try {
      addLog(t('log.slotSaving', { n: slotId + 1 }), 'info')

      const totalScores = scores.reduce((sum, team) => sum + (team.score || 0), 0)
      const calculatedRemainingRaces = Math.max(0, Math.floor((984 - totalScores) / 82))

      const slotData = {
        slotId,
        name,
        timestamp: new Date().toISOString(),
        scores: JSON.parse(JSON.stringify(scores)),
        remainingRaces: calculatedRemainingRaces
      }

      const response = await fetch(`http://localhost:${serverPort}/api/reopen-slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slotData)
      })

      if (response.ok) {
        await fetchSlots()
        addLog(t('log.slotSaved', { n: slotId + 1, name }), 'success')
      } else {
        addLog(t('log.slotSaveFailed'), 'error')
      }
    } catch (error: any) {
      console.error('Save slot error:', error)
      addLog(t('log.slotSaveError'), 'error')
    }
  }, [slots, scores, serverPort, fetchSlots, addLog])

  const handleLoadSlot = useCallback((slotId: number) => {
    const slot = slots.find(s => s.slotId === slotId)
    if (!slot) return
    setPendingSlotId(slotId)
    setSlotModalType('load')
    setShowSlotNameModal(true)
  }, [slots])

  const handleAddScoresFromSlot = useCallback((slotId: number) => {
    const slot = slots.find(s => s.slotId === slotId)
    if (!slot) return
    setPendingSlotId(slotId)
    setSlotModalType('add')
    setShowSlotNameModal(true)
  }, [slots])

  const handleDeleteSlot = useCallback((slotId: number) => {
    const slot = slots.find(s => s.slotId === slotId)
    if (!slot) return
    setPendingSlotId(slotId)
    setSlotModalType('delete')
    setShowSlotNameModal(true)
  }, [slots])


  // Modal trigger handlers

  const executeLoadSlot = async () => {
    if (pendingSlotId === null) return
    const slot = slots.find(s => s.slotId === pendingSlotId)
    if (!slot) return

    try {
      addLog(t('log.slotLoading', { name: slot.name }), 'info')
      const response = await fetch(`http://localhost:${serverPort}/api/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slot.scores)
      })

      if (response.ok) {
        loadScores()
        addLog(t('log.slotLoaded', { name: slot.name }), 'success')
        setActiveTab('dashboard')
        setShowSlotNameModal(false)
      } else {
        addLog(t('log.slotLoadFailed'), 'error')
      }
    } catch (error: any) {
      console.error('Failed to load slot:', error)
      addLog(t('log.slotLoadError', { error: error.message }), 'error')
    }
  }

  const executeAddScoresFromSlot = async () => {
    if (pendingSlotId === null) return
    const slot = slots.find(s => s.slotId === pendingSlotId)
    if (!slot) return

    try {
      addLog(t('log.slotAdding', { name: slot.name }), 'info')
      const currentScoresResponse = await fetch(`http://localhost:${serverPort}/api/scores`)
      const currentData = await currentScoresResponse.json()
      const currentScores = currentData.scores || []

      const updatedScores = [...currentScores]

      slot.scores.forEach((savedTeam: any) => {
        const index = updatedScores.findIndex(s => (s.name || s.team) === (savedTeam.name || savedTeam.team))
        if (index !== -1) {
          updatedScores[index].score = (updatedScores[index].score || 0) + savedTeam.score
          updatedScores[index].addedScore = savedTeam.score
        } else {
          updatedScores.push({
            ...savedTeam,
            addedScore: savedTeam.score
          })
        }
      })

      const response = await fetch(`http://localhost:${serverPort}/api/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedScores)
      })

      if (response.ok) {
        loadScores()
        addLog(t('log.slotAdded', { name: slot.name }), 'success')
        setActiveTab('dashboard')
        setShowSlotNameModal(false)
      } else {
        addLog(t('log.slotAddFailed'), 'error')
      }
    } catch (error: any) {
      console.error('Failed to add scores from slot:', error)
      addLog(t('log.slotAddError', { error: error.message }), 'error')
    }
  }

  const executeDeleteSlot = async () => {
    if (pendingSlotId === null) return
    const slotId = pendingSlotId

    try {
      addLog(t('log.slotDeleting', { n: slotId + 1 }), 'info')
      const response = await fetch(`http://localhost:${serverPort}/api/reopen-slots/${slotId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await fetchSlots()
        addLog(t('log.slotDeleted', { n: slotId + 1 }), 'success')
        setShowSlotNameModal(false)
      } else {
        addLog(t('log.slotDeleteFailed'), 'error')
      }
    } catch (error: any) {
      console.error('Failed to delete slot:', error)
      addLog(t('log.slotDeleteError', { error: error.message }), 'error')
    }
  }

  const handleResetScores = () => {
    setShowResetConfirmModal(true)
  }

  const executeResetScores = async () => {
    try {
      await fetch(`http://localhost:${serverPort}/api/scores/reset`, { method: 'POST' })
      loadScores()
      loadPlayerMappings()
      setManualCurrentTeam(null)
      addLog(t('log.resetDone'), 'success')
      setShowResetConfirmModal(false)
    } catch (error) {
      addLog(t('log.resetFailed'), 'error')
    }
  }


  const handleStartEditMappings = () => {
    const mappingArray = Object.entries(playerMappings).map(([name, team]) => ({ name, team }))
    setEditingMappings(mappingArray)
    setIsEditingMappings(true)
  }

  const handleSaveMappings = async () => {
    try {
      const mappingObj: Record<string, string> = {}
      editingMappings.forEach(m => {
        if (m.name.trim()) mappingObj[m.name.trim()] = m.team.trim()
      })

      await fetch(`http://localhost:${serverPort}/api/player-mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappingObj)
      })
      setIsEditingMappings(false)
      loadPlayerMappings()
      addLog(t('log.mappingUpdated'), 'success')
    } catch (error) {
      addLog(t('log.mappingUpdateFailed'), 'error')
    }
  }

  const handleMappingChange = (index: number, field: 'name' | 'team', value: string) => {
    const newMappings = [...editingMappings]
    newMappings[index][field] = value
    setEditingMappings(newMappings)
  }

  const handleAddMapping = () => {
    setEditingMappings([...editingMappings, { name: '', team: '' }])
  }

  const handleRemoveMapping = (index: number) => {
    const newMappings = [...editingMappings]
    newMappings.splice(index, 1)
    setEditingMappings(newMappings)
  }

  // (注) フォームの変更検知は handleAutoSaveChange に一本化

  /**
   * フォームの入力内容から部分設定オブジェクトを収集する。
   * フォームに存在するフィールドのみを更新対象にするため、別タブのフォーム保存時に
   * 既存の設定が null で上書きされるのを防ぐ。
   */
  const collectConfigFromForm = (form: HTMLFormElement): any => {
    if (!config) return null
    const formData = new FormData(form)
    const newConfig = { ...config }

    const hasField = (name: string) => {
      return form.querySelector(`[name="${name}"]`) !== null
    }

    if (hasField('obsWsIp')) newConfig.obsIp = formData.get('obsWsIp') as string
    if (hasField('obsWsPort')) {
      const port = parseInt(formData.get('obsWsPort') as string)
      if (!isNaN(port)) newConfig.obsPort = port
    }
    if (hasField('obsWsPassword')) newConfig.obsPassword = formData.get('obsWsPassword') as string
    if (hasField('obsSourceName')) newConfig.obsSourceName = formData.get('obsSourceName') as string
    if (hasField('aiProvider')) newConfig.aiProvider = formData.get('aiProvider') as any
    if (hasField('openaiApiKey')) newConfig.openaiApiKey = formData.get('openaiApiKey') as string
    if (hasField('groqApiKey')) newConfig.groqApiKey = formData.get('groqApiKey') as string
    if (hasField('analysisMode')) newConfig.analysisMode = formData.get('analysisMode') as 'standard12' | 'standings24'

    if (hasField('showRemainingRaces')) {
      newConfig.showRemainingRaces = formData.get('showRemainingRaces') === 'on'
    }

    if (hasField('overlayTheme')) {
      newConfig.overlayTheme = formData.get('overlayTheme') as 'default' | 'mkw'
    }

    // カラー設定の更新
    if (!newConfig.overlayColors) {
      newConfig.overlayColors = {
        scoreEffect: '#22c55e',
        ownTeamStyle: 'rainbow',
        ownTeamColor: '#fbbf24',
        ownTeamGradient: 'blue'
      }
    }

    if (hasField('scoreEffect')) {
      newConfig.overlayColors.scoreEffect = formData.get('scoreEffect') as string
    }
    if (hasField('ownTeamStyle')) {
      newConfig.overlayColors.ownTeamStyle = formData.get('ownTeamStyle') as any
    }
    if (hasField('ownTeamColor')) {
      newConfig.overlayColors.ownTeamColor = formData.get('ownTeamColor') as string
    }
    if (hasField('ownTeamGradient')) {
      newConfig.overlayColors.ownTeamGradient = formData.get('ownTeamGradient') as string
    }

    // アニメーション設定の更新
    if (!newConfig.overlayAnimations) {
      newConfig.overlayAnimations = {
        speed: 1.0,
        rankAnim: true,
        flash: true
      }
    }

    if (hasField('animationSpeed')) {
      newConfig.overlayAnimations.speed = parseFloat(formData.get('animationSpeed') as string)
    }
    // トグル系はhidden inputで常に送信するか、checkboxの状態を見る
    if (hasField('rankAnim')) {
      newConfig.overlayAnimations.rankAnim = formData.get('rankAnim') === 'on'
    }
    if (hasField('flashOnUpdate')) {
      newConfig.overlayAnimations.flash = formData.get('flashOnUpdate') === 'on'
    }

    // スコア設定の更新
    if (hasField('keepScoreOnRestart')) {
      newConfig.scoreSettings = {
        ...config.scoreSettings,
        keepScoreOnRestart: formData.get('keepScoreOnRestart') === 'on'
      }
    }

    return newConfig
  }

  /** 収集済み設定を永続化し、UI状態を同期する。成功時は「保存しました」インジケータを一時表示 */
  const persistConfigInternal = async (newConfig: any): Promise<void> => {
    try {
      if (!window.electron || !window.electron.ipcRenderer) return
      const result = await window.electron.ipcRenderer.invoke('save-config', newConfig)
      if (result.success) {
        setConfig(newConfig)
        setIsDirty(false)
        setIsConfigInvalid(!newConfig?.obsIp || !newConfig?.obsPort || !newConfig?.obsSourceName || !newConfig?.groqApiKey)
        setShowSavedTick(true)
        if (savedTickTimerRef.current) clearTimeout(savedTickTimerRef.current)
        savedTickTimerRef.current = setTimeout(() => setShowSavedTick(false), 2000)
      } else {
        addLog(t('messages.configSaveError'), 'error')
      }
    } catch (error) {
      addLog(t('log.configSaveFailed'), 'error')
    }
  }

  /**
   * 設定フォームの自動保存: onChange のたびに呼ばれ、最後の編集から
   * 800ms 経過した時点でまとめて保存する（タイプ中の連続保存を避けるデバウンス）。
   * 送信ボタンは廃止したため、保存はこの経路に一本化されている。
   */
  const handleAutoSaveChange = (e: React.ChangeEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    setIsDirty(true)
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null
      const collected = collectConfigFromForm(form)
      if (collected) void persistConfigInternal(collected)
    }, 800)
  }

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      if (copiedUrlTimerRef.current) clearTimeout(copiedUrlTimerRef.current)
      if (whatsNewTimerRef.current) clearTimeout(whatsNewTimerRef.current)
      if (savedTickTimerRef.current) clearTimeout(savedTickTimerRef.current)
      // アンマウント直前に保留中の自動保存があれば破棄する
      // （タブ再マウント時に最新configが読み込まれるため二重保存を回避）
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [])

  const handleTabChange = (tab: typeof activeTab) => {
    if (tab === activeTab) return

    // 未保存の設定、または編集中のデータがあるかチェック
    const hasUnsavedChanges = isDirty || isEditing || isEditingMappings

    if (hasUnsavedChanges) {
      setPendingTab(tab)
      setShowConfirmModal(true)
      return
    }

    // 移動する場合、編集状態をリセット
    if (isEditing) setIsEditing(false)
    if (isEditingMappings) setIsEditingMappings(false)
    setIsDirty(false)

    setActiveTab(tab)
  }

  const confirmTabChange = () => {
    if (pendingTab) {
      if (isEditing) setIsEditing(false)
      if (isEditingMappings) setIsEditingMappings(false)
      setIsDirty(false)
      setActiveTab(pendingTab)
      setPendingTab(null)
    }
    setShowConfirmModal(false)
  }

  const handleOpenOverlay = () => {
    const url = `http://localhost:${serverPort}/`
    window.electron.ipcRenderer.invoke('open-external', url)
  }

  const handleLanguageChange = (newLang: string) => {
    i18n.changeLanguage(newLang)
    if (config) {
      const updatedConfig = { ...config, language: newLang }
      window.electron.ipcRenderer.invoke('save-config', updatedConfig)
    }
  }

  // 言語コードの正規化（'ja-JP' 等のリージョン付きコードにも対応）
  const getCurrentLanguage = () => (i18n.language || 'ja').slice(0, 2)

  // ---- レース番号トラッカー: 全チームの合計点から現在のレース数を算出 ----
  // 1レースあたりの総配点（全プレイヤーの配点合計）:
  //   標準12人モード(MK8DX) = 82点 / 24人スタンド(MK World) = 144点
  // グランプリは両モードとも12レース構成と仮定する。
  const TOTAL_RACES_PER_GP = 12
  const totalPoints = scores.reduce((sum, team) => sum + (team.score || 0), 0)
  const pointsPerRace = config?.analysisMode === 'standings24' ? 144 : 82
  const rawRaces = pointsPerRace > 0 ? totalPoints / pointsPerRace : 0
  const raceNum = Math.min(TOTAL_RACES_PER_GP, Math.max(1, Math.round(rawRaces)))
  // 合計点が1レース配点の整数倍でない場合（切断者や部分的な取得漏れ）は「推定」と表示
  const isRaceEstimate = totalPoints > 0 && !Number.isInteger(rawRaces)
  const raceTracker = {
    totalPoints,
    raceNum,
    isEstimated: isRaceEstimate,
    remaining: Math.max(0, TOTAL_RACES_PER_GP - raceNum)
  }

  // ---- OBS接続品質バッジ: RTTから品質ラベルと色を決定 ----
  const obsLatency = obsDetail.latencyMs
  const obsQualityKey = obsLatency == null
    ? t('obsQuality.connected')
    : obsLatency < 100
      ? t('obsQuality.good')
      : obsLatency < 300
        ? t('obsQuality.fair')
        : t('obsQuality.poor')
  const obsQualityTextClass = obsLatency == null || obsLatency < 300 ? 'text-accent-500' : 'text-amber-400'
  const obsQualityDotClass = obsLatency == null || obsLatency < 300 ? 'bg-accent-500' : 'bg-amber-400'

  const finishBoot = useCallback(() => {
    // 一度ブートしたら再入しない（設定編集のたびにタイマー/ウィザードが
    // 再発火する潜在バグの防止）
    if (!isBootingRef.current) return
    isBootingRef.current = false
    setIsBooting(false)
    // ブート後に設定が不完全ならウィザードを表示
    if (!config?.obsIp || !config?.obsPort || !config?.groqApiKey) {
      setShowWizard(true)
    }
  }, [config])

  useEffect(() => {
    // スプラッシュ短縮（1.4秒）＋クリックで即スキップ可能
    const bootTimer = setTimeout(finishBoot, 1400)
    return () => clearTimeout(bootTimer)
  }, [finishBoot])

  useEffect(() => {
    const checkWhatsNew = async () => {
      if (!window.electron || !window.electron.ipcRenderer) return

      try {
        const result = await window.electron.ipcRenderer.invoke('check-whats-new')
        if (result.show) {
          setWhatsNewInfo({ version: result.version, notes: result.notes })
          // 少し遅らせて起動時の情報量過多を避ける
          if (whatsNewTimerRef.current) clearTimeout(whatsNewTimerRef.current)
          whatsNewTimerRef.current = setTimeout(() => setShowWhatsNew(true), 3000)
        }
      } catch (err) {
        console.error('Failed to check whats new:', err)
      }
    }

    if (!isBooting) {
      checkWhatsNew()
    }
  }, [isBooting])

  // 1回限りの初期化（リスナー登録など）
  useEffect(() => {
    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer.invoke('get-app-version').then((v) => {
        setAppVersion(v)
        console.log('App version loaded:', v)
      })

      // 初回のみアップデートチェック
      handleCheckUpdate(true)

      window.electron.ipcRenderer.invoke('get-server-port').then((port: number) => {
        setServerPort(port)
        addLog(tRef.current('log.serverListening', { port }), 'success')
      })

      // グローバルショートカットのリスナー
      const removeFetchListener = window.electron.ipcRenderer.on('trigger-fetch-race-results', () => {
        handleFetchResultsRef.current(false)
      })
      const removeOverallListener = window.electron.ipcRenderer.on('trigger-fetch-overall-scores', () => {
        handleFetchResultsRef.current(true)
      })

      // 自動アップデート関連のリスナー
      const removeUpdateAvailable = window.electron.ipcRenderer.on('update-available', (_event: any, info: any) => {
        setUpdateInfo({
          hasUpdate: true,
          latestVersion: info.version,
          releaseNotes: info.releaseNotes,
          isAutoUpdater: true
        })
        setShowUpdateToast(true)
      })

      const removeUpdateProgress = window.electron.ipcRenderer.on('update-download-progress', (_event: any, progress: any) => {
        setUpdateProgress(progress.percent)
      })

      const removeUpdateDownloaded = window.electron.ipcRenderer.on('update-downloaded', () => {
        setIsUpdateDownloaded(true)
        setIsDownloadingUpdate(false)
        addLog(tRef.current('log.updateDownloaded'), 'success')
      })

      const removeUpdateError = window.electron.ipcRenderer.on('update-error', (_event: any, err: any) => {
        setIsDownloadingUpdate(false)
        setIsCheckingUpdate(false)
        console.error('Renderer received detailed update-error:', err)
        addLog(tRef.current('log.updateError'), 'error')
      })

      return () => {
        if (removeFetchListener) removeFetchListener()
        if (removeOverallListener) removeOverallListener()
        if (removeUpdateAvailable) removeUpdateAvailable()
        if (removeUpdateProgress) removeUpdateProgress()
        if (removeUpdateDownloaded) removeUpdateDownloaded()
        if (removeUpdateError) removeUpdateError()
      }
    }
    return () => { }
  }, []) // 依存関係なしで1回だけ実行

  // 設定の読み込み
  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (activeTab === 'reopen' && serverPort) {
      fetchSlots()
    }
  }, [activeTab, serverPort, fetchSlots])

  useEffect(() => {
    let eventSource: EventSource | null = null
    if (serverPort) {
      loadScores()
      loadPlayerMappings()

      // SSE for real-time updates
      eventSource = new EventSource(`http://localhost:${serverPort}/api/scores/events`)
      eventSource.onmessage = (event) => {
        let data: any
        try {
          data = JSON.parse(event.data)
        } catch {
          // 不正なフレームでonmessageが落ちないようにする（オーバーレイ側と同じ方針）
          return
        }
        if (data.type === 'scores-updated') {
          loadScores()
          loadPlayerMappings()
        }
      }
    }

    return () => {
      if (eventSource) eventSource.close()
    }
  }, [serverPort, loadScores, loadPlayerMappings])

  return (
    <>
      <AnimatePresence>
        {isBooting && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            onClick={finishBoot}
            className="fixed inset-0 z-[999] bg-surface flex flex-col items-center justify-center cursor-pointer"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                duration: 1.2,
                ease: "easeOut",
                scale: { type: "spring", stiffness: 50 }
              }}
              className="relative flex flex-col items-center w-full px-6"
            >
              <img
                src={bootLogo}
                alt="Grosoq Boot Logo"
                className="w-[min(430px,78vw,58vh)] h-auto drop-shadow-[0_0_30px_rgba(239,68,68,0.45)]"
              />

              {/* × セパレーター */}
              <motion.div
                initial={{ opacity: 0, scaleX: 0.6 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ delay: 0.7, duration: 0.6, ease: "easeOut" }}
                className="my-5 sm:my-6 flex items-center gap-3 sm:gap-4"
                aria-hidden="true"
              >
                <span className="h-px w-12 sm:w-20 bg-gradient-to-r from-transparent to-accent-500/60" />
                <span className="text-accent-400/90 text-lg sm:text-xl font-black select-none">×</span>
                <span className="h-px w-12 sm:w-20 bg-gradient-to-l from-transparent to-accent-500/60" />
              </motion.div>

              <motion.img
                src={mkWorldLogo}
                alt="Mario Kart World"
                initial={{ opacity: 0, y: 18, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.85, duration: 0.8, ease: "easeOut" }}
                className="w-[min(310px,56vw,42vh)] h-auto opacity-95 drop-shadow-[0_10px_28px_rgba(37,99,235,0.35)]"
              />

              {/* ローディングバー */}
              <div className="mt-9 w-[min(360px,66vw)] h-1 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 2, ease: "easeInOut", delay: 0.5 }}
                  className="h-full bg-gradient-to-r from-transparent via-accent-500 to-transparent rounded-full shadow-[0_0_15px_rgba(239,68,68,0.8)]"
                />
              </div>
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.8 }}
              className="mt-9 text-accent-400 font-black tracking-[0.2em] text-sm uppercase"
            >
              Initializing Grosoq System
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWizard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[800] bg-surface/95 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-raised w-full max-w-2xl rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Wizard Header */}
              <div className="p-8 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center relative">
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Zap className="text-accent-400" size={24} />
                    {t('wizard.title')}
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">{t('wizard.subtitle')}</p>
                </div>
                <div className="flex gap-1" aria-label={t('wizard.title')}>
                  {[0, 1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={cn(
                        "w-8 h-1.5 rounded-full transition-all duration-500",
                        wizardStep >= step ? "bg-accent-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" : "bg-slate-700"
                      )}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowWizard(false)}
                  aria-label={t('wizard.close')}
                  className="absolute top-4 right-4 min-h-[32px] min-w-[32px] p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors flex items-center justify-center"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Wizard Content */}
              <div className="flex-1 overflow-y-auto p-8">
                <AnimatePresence mode="wait">
                  {wizardStep === 0 && (
                    <motion.div
                      key="step0"
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -20, opacity: 0 }}
                      className="space-y-6 text-center py-8"
                    >
                      <div className="w-20 h-20 bg-accent-600/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Monitor className="text-accent-400" size={40} />
                      </div>
                      <h3 className="text-3xl font-bold text-white">{t('wizard.welcomeTitle')}</h3>
                      <p className="text-slate-300 leading-relaxed max-w-md mx-auto">
                        {t('wizard.welcomeDesc1')}<br />
                        {t('wizard.welcomeDesc2')}
                      </p>
                      <button
                        onClick={() => setWizardStep(1)}
                        className="mt-8 bg-accent-600 hover:bg-accent-500 text-white px-10 py-4 rounded-2xl font-black text-lg transition-all shadow-xl shadow-accent-900/40 active:scale-95"
                      >
                        {t('wizard.start')}
                      </button>
                    </motion.div>
                  )}

                  {wizardStep === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -20, opacity: 0 }}
                      className="space-y-6"
                    >
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Zap className="text-green-400" size={20} />
                        {t('wizard.step1Title')}
                      </h3>
                      <p className="text-slate-400 text-sm">
                        {t('wizard.step1Desc')}
                      </p>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Groq API Key</label>
                          <div className="flex gap-2">
                            <input
                              id="wizGroqApiKey"
                              type="password"
                              placeholder="gsk_..."
                              value={config?.groqApiKey || ''}
                              onChange={(e) => setConfig({ ...config, groqApiKey: e.target.value })}
                              className="flex-1 min-w-0 bg-surface border border-slate-700 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => pasteIntoInput('wizGroqApiKey')}
                              className="flex items-center gap-1.5 text-xs px-3 rounded-xl border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 transition-all whitespace-nowrap"
                            >
                              <Clipboard size={14} />
                              {t('config.pasteApiKey')}
                            </button>
                          </div>
                          <p className="text-xs text-slate-400">{t('wizard.keyHint')}</p>
                        </div>

                        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-3">
                          <h4 className="text-sm font-bold text-slate-300">{t('wizard.howToGet')}</h4>
                          <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
                            <li><a href="https://console.groq.com/keys" target="_blank" className="text-accent-400 hover:underline">{t('wizard.groqConsole')}</a>{t('wizard.how1Suffix')}</li>
                            <li>{t('wizard.how2')}</li>
                            <li>{t('wizard.how3')}</li>
                          </ol>
                        </div>
                      </div>

                      <div className="flex justify-between pt-6">
                        <button onClick={() => setWizardStep(0)} className="text-slate-400 hover:text-slate-300 font-medium">{t('wizard.back')}</button>
                        <button
                          disabled={!config?.groqApiKey}
                          onClick={() => setWizardStep(2)}
                          className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg"
                        >
                          {t('wizard.next')}
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {wizardStep === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -20, opacity: 0 }}
                      className="space-y-6"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                          <Monitor className="text-accent-400" size={20} />
                          {t('wizard.step2Title')}
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            autoDetectObsSettings()
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 transition-all flex items-center gap-2"
                        >
                          <Monitor size={12} />
                          {t('config.obsAutoDetect')}
                        </button>
                      </div>
                      <p className="text-slate-400 text-sm">
                        {t('wizard.step2Desc')}
                      </p>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label htmlFor="wizObsIp" className="text-xs font-bold text-slate-400">{t('wizard.ipLabel')}</label>
                          <input
                            id="wizObsIp"
                            type="text"
                            value={config?.obsIp || ''}
                            onChange={(e) => setConfig({ ...config, obsIp: e.target.value })}
                            className="w-full bg-surface border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
                            placeholder="127.0.0.1"
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="wizObsPort" className="text-xs font-bold text-slate-400">{t('wizard.portLabel')}</label>
                          <input
                            id="wizObsPort"
                            type="number"
                            min={1}
                            max={65535}
                            value={config?.obsPort || ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : parseInt(e.target.value)
                              setConfig({ ...config, obsPort: val })
                            }}
                            className="w-full bg-surface border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
                          />
                        </div>
                      </div>

                      {/* 既定値案内: 特別な理由がなければデフォルトのままで良い */}
                      <p className="text-xs text-slate-500 leading-relaxed">{t('config.obsDefaultsHint')}</p>

                      <div className="space-y-2">
                        <label htmlFor="wizObsPassword" className="text-xs font-bold text-slate-400">{t('wizard.passwordLabel')}</label>
                        <input
                          id="wizObsPassword"
                          type="password"
                          value={config?.obsPassword || ''}
                          onChange={(e) => setConfig({ ...config, obsPassword: e.target.value })}
                          placeholder={t('wizard.passwordPlaceholder')}
                          className="w-full bg-surface border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
                        />
                        <p className="text-xs text-slate-500 leading-relaxed">{t('wizard.passwordHint')}</p>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2 relative">
                          <label htmlFor="wizObsSource" className="text-xs font-bold text-slate-400">{t('wizard.sourceLabel')}</label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              {/* 角丸カスタムドロップダウン: 入力値の有無に関わらず全ソースを表示 */}
                              <SourceSelect
                                id="wizObsSource"
                                value={config?.obsSourceName || ''}
                                onChange={(v) => setConfig({ ...config, obsSourceName: v })}
                                sources={(obsInputs ?? []) as { inputName: string; inputKind?: string }[]}
                                placeholder={t('wizard.sourcePlaceholder')}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                setIsObsConnecting(true)
                                try {
                                  const result = await window.electron.ipcRenderer.invoke('obs-connect', config)
                                  if (result.success) {
                                    const inputsResult = await window.electron.ipcRenderer.invoke('obs-get-inputs')
                                    if (inputsResult.success) setObsInputs(inputsResult.inputs)

                                    if (!config?.obsSourceName) {
                                      const sourceResult = await window.electron.ipcRenderer.invoke('obs-find-best-source')
                                      if (sourceResult.success && sourceResult.sourceName) {
                                        setConfig({ ...config, obsSourceName: sourceResult.sourceName })
                                      }
                                    }
                                  } else {
                                    showGuiMessage('error', t('msgGui.connectFailed'), result.error)
                                  }
                                } finally {
                                  setIsObsConnecting(false)
                                }
                              }}
                              className={cn(
                                "px-6 rounded-xl font-bold transition-all flex items-center gap-2 border whitespace-nowrap",
                                obsStatus
                                  ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500 cursor-default"
                                  : "bg-accent-600 hover:bg-accent-500 text-white border-transparent shadow-lg shadow-accent-900/20"
                              )}
                            >
                              {isObsConnecting ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                              {obsStatus ? t('config.obsStatusConnected') : t('config.obsConnect')}
                            </button>
                          </div>
                          {!obsStatus && !obsInputs.length && (
                            <p className="text-xs text-slate-400 italic ml-1">
                              {t('wizard.sourceHint')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-center pt-4">
                        <button
                          type="button"
                          onClick={() => setWizardStep(3)}
                          className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2"
                        >
                          {t('wizard.skipObs')}
                        </button>
                      </div>

                      <div className="flex justify-between pt-6">
                        <button onClick={() => setWizardStep(1)} className="text-slate-400 hover:text-slate-300 font-medium">{t('wizard.back')}</button>
                        <button
                          disabled={!config?.obsIp || !config?.obsPort || !config?.obsSourceName}
                          onClick={() => setWizardStep(3)}
                          className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg"
                        >
                          {t('wizard.lastStep')}
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {wizardStep === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -20, opacity: 0 }}
                      className="space-y-4"
                    >
                      <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                          <Layout className="text-accent-400" size={20} />
                          {t('wizard.calTitle')}
                        </h3>
                        <p className="text-slate-400 text-sm mt-1">{t('wizard.calDesc')}</p>
                      </div>

                      <StandingsCalibrationPanel config={config} setConfig={setConfig} />

                      <p className="text-xs text-slate-500">{t('wizard.calNote')}</p>

                      <div className="flex justify-between pt-2">
                        <button onClick={() => setWizardStep(2)} className="text-slate-400 hover:text-slate-300 font-medium">{t('wizard.back')}</button>
                        <button
                          onClick={() => setWizardStep(4)}
                          className="bg-accent-600 hover:bg-accent-500 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg"
                        >
                          {t('wizard.lastStep')}
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {wizardStep === 4 && (
                    <motion.div
                      key="step4"
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -20, opacity: 0 }}
                      className="space-y-6 text-center py-8"
                    >
                      <div className="w-20 h-20 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-emerald-500/30">
                        <CheckCircle2 className="text-emerald-500" size={40} />
                      </div>
                      <h3 className="text-3xl font-bold text-white">{t('wizard.readyTitle')}</h3>
                      <p className="text-slate-300 leading-relaxed max-w-md mx-auto">
                        {t('wizard.readyDesc')}
                      </p>

                      <div className="pt-8 flex flex-col gap-4">
                        {obsStatus && (
                          <button
                            onClick={autoSetupObsOverlay}
                            className="bg-accent-600/20 hover:bg-accent-600/30 text-accent-400 px-8 py-3 rounded-xl font-bold transition-all border border-accent-500/30 flex items-center gap-2 mx-auto text-sm"
                          >
                            <ExternalLink size={16} />
                            {t('wizard.autoAddOverlay')}
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            // 設定を保存してウィザードを閉じる
                            if (window.electron && window.electron.ipcRenderer) {
                              const result = await window.electron.ipcRenderer.invoke('save-config', config)
                              if (result.success) {
                                setIsDirty(false) // 重要: ウィザード終了時はdirtyを解消
                                setShowWizard(false)
                                addLog(t('log.wizardComplete'), 'success')
                              }
                            }
                          }}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-10 py-4 rounded-2xl font-black text-lg transition-all shadow-xl shadow-emerald-900/40 active:scale-95 flex items-center gap-2 mx-auto"
                        >
                          {t('wizard.getStarted')}
                        </button>
                        <button
                          onClick={() => setWizardStep(3)}
                          className="text-slate-500 hover:text-slate-300 text-sm font-medium mx-auto"
                        >
                          {t('wizard.back')}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="h-screen bg-transparent text-slate-200 font-sans flex overflow-hidden">
        {/* Sidebar */}
        <div className={cn(
          "glass-panel border-r-0 flex flex-col transition-all duration-300 ease-in-out relative group",
          isSidebarCollapsed ? "w-20" : "w-64"
        )}>
          {/* Collapse Toggle Button */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="absolute -right-3 top-10 w-6 h-6 bg-accent-600 rounded-full flex items-center justify-center text-white shadow-lg z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          <div className={cn("p-6 flex items-center gap-3 overflow-hidden", isSidebarCollapsed && "justify-center px-0")}>
            <div className="min-w-[40px] w-10 h-10 bg-accent-600 rounded-lg flex items-center justify-center shadow-lg shadow-accent-900/20">
              <Monitor className="text-white" size={24} />
            </div>
            {!isSidebarCollapsed && (
              <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent whitespace-nowrap">
                Grosoq
              </h1>
            )}
          </div>

          <div className={cn("px-4 mb-4", isSidebarCollapsed && "px-2")}>
            <div className={cn("bg-slate-800/50 rounded-2xl p-3 border border-slate-700/50", isSidebarCollapsed && "p-1")}>
              {!isSidebarCollapsed && (
                <div className="flex justify-between items-center mb-1 px-1">
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Version</p>
                  <p className="text-xs font-mono text-slate-400">{appVersion}</p>
                </div>
              )}
              <button
                onClick={() => handleCheckUpdate()}
                disabled={isCheckingUpdate}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50",
                  updateInfo ? "bg-accent-600 text-white animate-pulse shadow-lg shadow-accent-900/40" : "bg-accent-600/20 hover:bg-accent-600/30 text-accent-400",
                  isSidebarCollapsed && "px-0"
                )}
                title={isSidebarCollapsed ? t('updateUi.checkTitleShort', { v: appVersion }) : undefined}
              >
                {isCheckingUpdate ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                {!isSidebarCollapsed && (updateInfo ? t('updateUi.availableShort') : t('updateUi.checkUpdate'))}
              </button>
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
            {[
              { id: 'dashboard', icon: BarChart3, label: t('operations.title') },
              { id: 'reopen', icon: History, label: t('nav.reopen') },
              { id: 'mappings', icon: Users, label: t('nav.mappings') },
              { id: 'overlay', icon: Layout, label: t('nav.overlay') },
              { id: 'settings', icon: Settings, label: t('config.title') },
              { id: 'about', icon: Info, label: t('nav.about') }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id as any)}
                className={cn(
                  "relative w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 z-10",
                  activeTab === tab.id ? "text-white" : "text-slate-400 hover:text-slate-200",
                  isSidebarCollapsed && "justify-center px-0"
                )}
                title={isSidebarCollapsed ? tab.label : undefined}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-accent-600 rounded-xl shadow-lg shadow-accent-900/40 -z-10"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <tab.icon size={20} className={cn("relative z-10", activeTab === tab.id && "text-white")} />
                {!isSidebarCollapsed && (
                  <span className={cn("font-medium whitespace-nowrap relative z-10", activeTab === tab.id && "text-white")}>
                    {tab.label}
                  </span>
                )}
                {tab.id === 'settings' && isConfigInvalid && (
                  <AlertCircle size={14} className="text-amber-500 absolute top-2 right-2 animate-pulse z-20" />
                )}
              </button>
            ))}
          </nav>

          <div className={cn("p-4 mt-auto", isSidebarCollapsed && "px-2")}>
            {/* 言語セレクター: 角丸ピル型セグメント。layoutId によりハイライトが滑らかにスライドする */}
            {!isSidebarCollapsed ? (
              <div
                role="radiogroup"
                aria-label={t('language.select')}
                title={t('language.select')}
                className="relative flex items-center gap-1 w-full bg-slate-800/80 rounded-full p-1"
              >
                {LANGUAGE_OPTIONS.map((lang) => {
                  const isActive = getCurrentLanguage() === lang.code
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => handleLanguageChange(lang.code)}
                      className={cn(
                        "relative flex-1 min-w-0 py-1.5 rounded-full text-xs font-semibold transition-colors duration-200 focus:outline-none cursor-pointer",
                        isActive ? "text-white" : "text-slate-400 hover:text-white"
                      )}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="language-pill"
                          className="absolute inset-0 bg-accent-600 rounded-full shadow-lg shadow-accent-900/40"
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        />
                      )}
                      <span className="relative z-10 whitespace-nowrap tracking-wide">{lang.short}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              /* 折りたたみ時: 地球アイコンで次の言語へ順送り */
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.05 }}
                onClick={() => {
                  const order = LANGUAGE_OPTIONS.map(l => l.code)
                  const idx = order.indexOf(getCurrentLanguage())
                  handleLanguageChange(order[(idx + 1) % order.length])
                }}
                aria-label={t('language.select')}
                title={`${t('language.select')} (${i18n.language})`}
                className="w-full flex items-center justify-center px-0 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors focus:outline-none cursor-pointer"
              >
                <Globe size={16} />
              </motion.button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-transparent relative custom-scrollbar">
          {/* Update Notification Toast */}
          <div className={cn(
            "fixed top-6 right-6 z-[100] transition-all duration-500 transform",
            showUpdateToast && updateInfo ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"
          )}>
            <div className="bg-accent-600 text-white p-1 rounded-2xl shadow-2xl shadow-accent-900/40 flex items-center gap-4 border border-accent-400/30">
              <div className="bg-white/20 p-3 rounded-xl">
                <Download size={24} />
              </div>
              <div className="pr-4">
                <h4 className="font-bold text-sm">{t('updateUi.available')}</h4>
                <p className="text-xs text-accent-100 mb-2">v{appVersion} → v{updateInfo?.latestVersion}</p>

                {updateInfo?.releaseNotes && (
                  <button
                    onClick={() => setShowReleaseNotes(true)}
                    className="text-xs bg-accent-700 hover:bg-accent-800 text-accent-100 px-2 py-0.5 rounded transition-colors mb-2 flex items-center gap-1"
                  >
                    <FileText size={10} />
                    {t('updateUi.viewNotes')}
                  </button>
                )}

                <div className="flex gap-2 mt-2">
                  {isUpdateDownloaded ? (
                    <button
                      onClick={handleQuitAndInstall}
                      className="bg-emerald-500 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-900/40"
                    >
                      {t('updateUi.restartToApply')}
                    </button>
                  ) : isDownloadingUpdate ? (
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-accent-700 rounded-full overflow-hidden">
                        <div className="h-full bg-white transition-all duration-300" style={{ width: `${updateProgress}%` }} />
                      </div>
                      <span className="text-xs font-mono">{Math.round(updateProgress)}%</span>
                    </div>
                  ) : updateInfo?.isAutoUpdater ? (
                    <button
                      onClick={handleStartDownloadUpdate}
                      className="bg-white text-accent-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-accent-50 transition-colors"
                    >
                      {t('updateUi.updateButton')}
                    </button>
                  ) : (
                    <button
                      onClick={() => window.electron.ipcRenderer.invoke('open-external', updateInfo.url)}
                      className="min-h-[32px] bg-white text-accent-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-accent-50 transition-colors"
                    >
                      {t('updateUi.details')}
                    </button>
                  )}
                  <button
                    onClick={() => setShowUpdateToast(false)}
                    className="min-h-[32px] bg-accent-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-accent-500 transition-colors"
                  >
                    {t('updateUi.close')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Release Notes Modal */}
          <AnimatePresence>
            {showReleaseNotes && updateInfo?.releaseNotes && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowReleaseNotes(false)}
                  className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="relative w-full max-w-xl bg-raised border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                >
                  <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
                    <div className="flex items-center gap-3">
                      <div className="bg-accent-600/20 p-2 rounded-xl text-accent-400">
                        <FileText size={20} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">{t('updateUi.notesTitle')}</h3>
                        <p className="text-xs text-slate-400">{t('updateUi.notesSubtitle', { v: updateInfo.latestVersion })}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowReleaseNotes(false)}
                      className="p-2 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-surface">
                    <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {typeof updateInfo.releaseNotes === 'string' ? (
                        /* リリースノートは外部(GitHub)由来のためHTMLとして解釈せず
                           プレーンテキストのまま表示する（XSS防止） */
                        updateInfo.releaseNotes
                      ) : Array.isArray(updateInfo.releaseNotes) ? (
                        <div className="space-y-6">
                          {updateInfo.releaseNotes.map((note: any, i: number) => (
                            <div key={i} className="border-b border-slate-800 pb-4 last:border-0">
                              {note.version && <div className="text-accent-400 font-bold mb-2">v{note.version}</div>}
                              <div className="whitespace-pre-wrap">{typeof note === 'string' ? note : note.note}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 italic">{t('updateUi.noNotes')}</p>
                      )}
                    </div>
                  </div>

                  <div className="p-6 bg-slate-800/30 border-t border-slate-800 flex justify-end">
                    <button
                      onClick={() => setShowReleaseNotes(false)}
                      className="min-h-[32px] bg-accent-600 hover:bg-accent-500 text-white px-6 py-2 rounded-xl font-bold transition-all active:scale-95"
                    >
                      {t('updateUi.close')}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <div className="p-8 max-w-5xl mx-auto">
            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-8"
                >
                  <header className="flex justify-between items-end">
                    <div>
                      <h2 className="text-3xl font-bold text-white mb-2">{t('app.title')}</h2>
                      <p className="text-slate-400">{t('app.subtitle')}</p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleFetchResults(false)}
                        disabled={status === 'loading'}
                        className="glass-btn-primary flex items-center gap-2"
                      >
                        {status === 'loading' ? <RefreshCw className="animate-spin" size={20} /> : <Play size={20} />}
                        {config?.analysisMode === 'standings24' ? t('operations.fetchStandings') : t('operations.fetchRace')}
                      </button>
                      {config?.analysisMode !== 'standings24' && (
                        <button
                          onClick={() => handleFetchResults(true)}
                          disabled={status === 'loading'}
                          className="glass-btn bg-purple-600/20 hover:bg-purple-600/30 border-purple-500/30 text-purple-200 hover:text-purple-100 flex items-center gap-2 shadow-[0_0_15px_rgba(147,51,234,0.1)] hover:shadow-[0_0_20px_rgba(147,51,234,0.2)]"
                        >
                          <History size={20} />
                          {t('operations.fetchOverall')}
                        </button>
                      )}
                      <button
                        onClick={autoSetupObsOverlay}
                        className="glass-btn flex items-center gap-2"
                      >
                        <MonitorDown size={20} />
                        {t('operations.autoAddOverlay')}
                      </button>
                    </div>
                  </header>

                  {/* Analysis Mode Selector */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">{t('config.analysisModeLabel')}</span>
                    <div className="flex gap-1 bg-slate-900/50 p-1 rounded-xl border border-slate-800">
                      <button
                        onClick={() => handleAnalysisModeChange('standard12')}
                        disabled={status === 'loading'}
                        className={cn(
                          "px-4 py-1.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                          config?.analysisMode !== 'standings24'
                            ? "bg-accent-600 text-white shadow-lg"
                            : "text-slate-400 hover:text-white hover:bg-slate-800"
                        )}
                      >
                        {t('config.analysisModeStandard')}
                      </button>
                      <button
                        onClick={() => handleAnalysisModeChange('standings24')}
                        disabled={status === 'loading'}
                        className={cn(
                          "px-4 py-1.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                          config?.analysisMode === 'standings24'
                            ? "bg-green-600 text-white shadow-lg"
                            : "text-slate-400 hover:text-white hover:bg-slate-800"
                        )}
                      >
                        {t('config.analysisModeStandings')}
                      </button>
                    </div>

                    {/* 標準モード(12人)時のみ: 解析対象ゲームを選択（校正プリセットの自動切替に使用） */}
                    {config?.analysisMode !== 'standings24' && (
                      <>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">{t('config.standardGameLabel')}</span>
                        <div className="flex gap-1 bg-slate-900/50 p-1 rounded-xl border border-slate-800">
                          <button
                            onClick={() => handleStandardGameChange('mk8dx')}
                            disabled={status === 'loading'}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                              (config?.standardGame ?? 'mk8dx') !== 'mkworld'
                                ? "bg-blue-600 text-white shadow-lg"
                                : "text-slate-400 hover:text-white hover:bg-slate-800"
                            )}
                          >
                            {t('config.gameMk8dx')}
                          </button>
                          <button
                            onClick={() => handleStandardGameChange('mkworld')}
                            disabled={status === 'loading'}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                              config?.standardGame === 'mkworld'
                                ? "bg-red-600 text-white shadow-lg"
                                : "text-slate-400 hover:text-white hover:bg-slate-800"
                            )}
                          >
                            {t('config.gameMkw')}
                          </button>
                        </div>
                      </>
                    )}

                    {/* レース番号トラッカー: 全チーム合計点から現在のレース数を推定 */}
                    {raceTracker && raceTracker.totalPoints > 0 && (
                      <div
                        className="ml-auto flex items-center gap-2 bg-slate-900/50 border border-slate-800 rounded-full px-3 py-1.5 cursor-default"
                        title={raceTracker.isEstimated ? t('raceTracker.estimatedHint') : undefined}
                      >
                        <Flag size={14} className="text-accent-400 shrink-0" />
                        <span className="text-sm font-bold text-white whitespace-nowrap">
                          {t('raceTracker.race', { race: raceTracker.raceNum })}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="text-xs text-slate-300 whitespace-nowrap">
                          {t('raceTracker.remaining', { n: raceTracker.remaining })}
                        </span>
                        {raceTracker.isEstimated && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-1 py-0.5 whitespace-nowrap">
                            {t('raceTracker.estimated')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="bg-raised p-6 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/30" />
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-emerald-500/10 rounded-xl group-hover:scale-110 transition-transform">
                          <CheckCircle2 className="text-emerald-500" size={24} />
                        </div>
                        <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full dot-pulse-success" />
                          <span className="text-xs font-bold text-emerald-500 uppercase tracking-tight">Active</span>
                        </div>
                      </div>
                      <h3 className="text-slate-400 text-sm font-medium mb-1">{t('dash.builtinServer')}</h3>
                      <p className="text-2xl font-bold text-white font-mono tracking-tight">Port {serverPort}</p>
                    </div>

                    <div className="bg-raised p-6 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-full h-1 bg-accent-500/30" />
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-accent-500/10 rounded-xl group-hover:scale-110 transition-transform">
                          <Monitor className="text-accent-500" size={24} />
                        </div>
                        {obsDetail.reconnecting ? (
                          /* 自動再接続中: 琥珀色で点滅表示 */
                          <div
                            className="flex items-center gap-1.5 bg-amber-500/10 px-2.5 py-1 rounded-full animate-pulse"
                          title={t('obsQuality.attempt', { n: obsDetail.attempt })}
                          >
                            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                            <span className="text-xs font-bold text-amber-500 uppercase tracking-tight whitespace-nowrap">
                              {t('obsQuality.reconnecting')}
                            </span>
                          </div>
                        ) : config?.obsIp ? (
                          obsStatus ? (
                            /* 接続中: RTTで品質バッジを色分け（ツールチップにレイテンシ表示） */
                            <div
                              className="flex items-center gap-1.5 bg-accent-500/10 px-2.5 py-1 rounded-full"
                              title={`${t('obsQuality.latency', { ms: obsDetail.latencyMs ?? '—' })}`}
                            >
                              <div className={cn("w-1.5 h-1.5 rounded-full dot-pulse-success", obsQualityDotClass)} />
                              <span className={cn("text-xs font-bold uppercase tracking-tight whitespace-nowrap", obsQualityTextClass)}>
                                {obsQualityKey}
                                {obsDetail.latencyMs != null ? ` · ${obsDetail.latencyMs}ms` : ''}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full uppercase tracking-tight">
                              {t('obsQuality.disconnected')}
                            </span>
                          )
                        ) : (
                          <span className="text-xs font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full uppercase tracking-tight">
                            {t('dash.notSet')}
                          </span>
                        )}
                      </div>
                      <h3 className="text-slate-400 text-sm font-medium mb-1">{t('dash.obsConnection')}</h3>
                      <p className="text-2xl font-bold text-white font-mono tracking-tight">{config?.obsIp || t('dash.notSet')}</p>
                    </div>

                    <div className="bg-raised p-6 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-full h-1 bg-purple-500/30" />
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-purple-500/10 rounded-xl group-hover:scale-110 transition-transform">
                          <Settings className="text-purple-500" size={24} />
                        </div>
                        {config?.groqApiKey ? (
                          <div className="flex items-center gap-1.5 bg-purple-500/10 px-2.5 py-1 rounded-full">
                            <div className="w-1.5 h-1.5 bg-purple-500 rounded-full dot-pulse-success" />
                            <span className="text-xs font-bold text-purple-500 uppercase tracking-tight">Ready</span>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full uppercase tracking-tight">Offline</span>
                        )}
                      </div>
                      <h3 className="text-slate-400 text-sm font-medium mb-1">Groq API</h3>
                      <p className="text-2xl font-bold text-white font-mono tracking-tight">
                        {config?.groqApiKey ? 'VERIFIED' : 'NO KEY'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Scores Table */}
                    <div className="glass-panel rounded-2xl overflow-hidden relative border-none">
                      <AnimatePresence>
                        {status === 'loading' && <ScanningOverlay />}
                      </AnimatePresence>

                      <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                          <BarChart3 size={20} className="text-accent-500" />
                          {t('dash.currentScores')}
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const sortedRatio = [...scores].sort((a, b) => b.score - a.score);
                              const text = sortedRatio.map((s, i) => `${i + 1}. ${s.name || s.team}: ${s.score}pts`).join('\n');
                              navigator.clipboard.writeText(text);
                              addLog(t('log.rankCopied'), 'success');
                              setIsCopied(true);
                              if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
                              copiedTimerRef.current = setTimeout(() => setIsCopied(false), 2000);
                            }}
                            className={cn(
                              "text-sm flex items-center gap-1 transition-all mr-2 px-2 py-1 rounded-lg",
                              isCopied
                                ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                                : "text-slate-400 hover:text-white hover:bg-slate-800"
                            )}
                            title={isCopied ? t('dash.copiedTitle') : t('dash.copyRank')}
                          >
                            {isCopied ? <Check size={16} /> : <Clipboard size={16} />}
                            {isCopied && <span className="text-xs font-bold">Copied!</span>}
                          </button>
                          {isEditing ? (
                            <>
                              <button
                                onClick={handleAddTeam}
                                className="text-sm text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                              >
                                {t('dash.add')}
                              </button>
                              <button
                                onClick={() => handleSaveEditedScores()}
                                className="text-sm text-accent-400 hover:text-accent-300 flex items-center gap-1 transition-colors"
                              >
                                {t('dash.save')}
                              </button>
                              <button
                                onClick={() => setIsEditing(false)}
                                className="text-sm text-slate-400 hover:text-slate-300 flex items-center gap-1 transition-colors"
                              >
                                {t('modal.cancel')}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={handleStartEdit}
                                className="min-h-[32px] text-sm text-accent-400 hover:text-accent-300 flex items-center gap-1 transition-colors"
                              >
                                {t('dash.edit')}
                              </button>
                              <button
                                onClick={handleResetScores}
                                className="min-h-[32px] text-sm text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                              >
                                <Trash2 size={14} />
                                {t('dash.reset')}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="p-0 px-4 pb-4">
                        <table className="w-full text-left border-separate border-spacing-y-2">
                          <thead>
                            <tr className="text-slate-400 text-xs uppercase tracking-wider">
                              <th className="px-6 py-3 font-semibold">{t('dash.thTeam')}</th>
                              <th className="px-6 py-3 font-semibold text-right">{t('dash.thScore')}</th>
                              {isEditing && <th className="px-6 py-3 font-semibold text-right">{t('dash.thActions')}</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            <AnimatePresence mode="popLayout">
                              {(isEditing ? editingScores : [...scores].sort((a, b) => b.score - a.score)).length > 0 ? (isEditing ? editingScores : [...scores].sort((a, b) => b.score - a.score)).map((team, i) => (
                                <ScoreItem
                                  key={isEditing ? `edit-${i}` : (team.name || team.team || i)}
                                  team={team}
                                  index={i}
                                  isEditing={isEditing}
                                  absent={team.absent === true}
                                  absentLabel={t('dc.absent')}
                                  onRemove={handleRemoveTeam}
                                  onChange={handleScoreChange}
                                  onSetCurrentPlayer={() => {
                                    const teamName = team.name || team.team
                                    setManualCurrentTeam(teamName)
                                    const newScores = scores.map(t => ({
                                      ...t,
                                      isCurrentPlayer: (t.name || t.team) === teamName
                                    }))
                                    handleSaveEditedScores(newScores)
                                  }}
                                />
                              )) : (
                                <motion.tr
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  key="empty"
                                >
                                  <td colSpan={isEditing ? 3 : 2} className="px-6 py-12 text-center text-slate-400 italic">
                                    {t('dash.noData')}
                                  </td>
                                </motion.tr>
                              )}
                            </AnimatePresence>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Logs */}
                    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col border-none">
                      <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                          <History size={20} className="text-purple-500" />
                          {t('dash.activityLog')}
                        </h3>
                      </div>
                      <div className="p-6 space-y-4">
                        {logs.length > 0 ? logs.map((log, i) => (
                          <div key={i} className="flex gap-4 items-start animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className={cn(
                              "w-2 h-2 mt-2 rounded-full shrink-0",
                              log.type === 'success' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                                log.type === 'error' ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                                  "bg-accent-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                            )} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-300 break-words">{log.message}</p>
                              <p className="text-xs text-slate-400">{log.timestamp}</p>
                            </div>
                          </div>
                        )) : (
                          <p className="text-center text-slate-400 py-8 italic">{t('dash.noLogs')}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'reopen' && (
                <motion.div
                  key="reopen"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-8"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-3xl font-bold text-white">{t('reopen.title')}</h2>
                      <p className="text-slate-400 mt-1">{t('reopen.desc')}</p>
                    </div>
                    <button
                      onClick={fetchSlots}
                      className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
                    >
                      <RefreshCw size={20} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array.from({ length: 10 }).map((_, i) => {
                      const slot = slots.find(s => s.slotId === i)
                      return (
                        <div key={i} className="glass-card rounded-2xl overflow-hidden flex flex-col border-none hover:scale-[1.02]">
                          <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/30">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Slot {i + 1}</span>
                            {slot && (
                              <span className="text-xs bg-accent-500/20 text-accent-400 px-2 py-0.5 rounded-full border border-accent-500/30">
                                {new Date(slot.timestamp).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <div className="p-6 flex-1">
                            {slot ? (
                              <div className="space-y-4">
                                <h4 className="font-bold text-lg text-slate-200 truncate">{slot.name}</h4>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                                    <div className="text-xs text-slate-400 uppercase">{t('reopenUi.teamsCount')}</div>
                                    <div className="text-sm font-bold text-accent-400">{slot.scores.length}</div>
                                  </div>
                                  <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                                    <div className="text-sm font-bold text-emerald-400">
                                      {slot.scores.reduce((sum: number, s: any) => sum + s.score, 0)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="h-full flex flex-col items-center justify-center py-4 text-slate-400">
                                <Save size={32} className="mb-2 opacity-20" />
                                <p className="text-sm italic">{t('reopen.emptySlot')}</p>
                              </div>
                            )}
                          </div>
                          <div className="p-4 bg-slate-800/30 border-t border-slate-800 flex flex-col gap-2">
                            {slot ? (
                              <>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleLoadSlot(i)}
                                    className="flex-1 bg-accent-600 hover:bg-accent-500 text-white py-2 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-accent-900/20"
                                  >
                                    {t('reopenUi.load')}
                                  </button>
                                  <button
                                    onClick={() => handleAddScoresFromSlot(i)}
                                    title={t('reopen.addScoreTitle')}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-emerald-900/20"
                                  >
                                    {t('reopenUi.addScore')}
                                  </button>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleSaveSlot(i)}
                                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 rounded-lg text-sm transition-colors"
                                  >
                                    {t('reopenUi.overwrite')}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSlot(i)}
                                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-sm transition-colors"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <button
                                onClick={() => handleSaveSlot(i)}
                                className="w-full bg-accent-600 hover:bg-accent-500 text-white py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-accent-900/30 active:scale-95 flex items-center justify-center gap-2 group"
                              >
                                <Save size={18} className="group-hover:rotate-12 transition-transform" />
                                {t('reopen.saveState')}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              )}

              {activeTab === 'mappings' && (
                <motion.div
                  key="mappings"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-8"
                >
                  <header>
                    <h2 className="text-3xl font-bold text-white mb-2">{t('nav.mappings')}</h2>
                    <p className="text-slate-400">{t('mappings.desc')}</p>
                  </header>

                  <div className="glass-panel rounded-2xl overflow-hidden border-none">
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        <Users size={20} className="text-accent-500" />
                        {t('mappings.listHeading')}
                      </h3>
                      <div className="flex gap-2">
                        {isEditingMappings ? (
                          <>
                            <button
                              onClick={handleAddMapping}
                              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                              {t('dash.add')}
                            </button>
                            <button
                              onClick={handleSaveMappings}
                              className="bg-accent-600 hover:bg-accent-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                              <Save size={16} />
                              {t('dash.save')}
                            </button>
                            <button
                              onClick={() => setIsEditingMappings(false)}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                              {t('modal.cancel')}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={handleStartEditMappings}
                            className="min-h-[32px] bg-accent-600 hover:bg-accent-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            {t('dash.edit')}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="p-6">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-slate-400 text-sm border-b border-slate-800">
                            <th className="pb-4 font-medium">{t('mappings.thPlayer')}</th>
                            <th className="pb-4 font-medium">{t('dash.thTeam')}</th>
                            {isEditingMappings && <th className="pb-4 font-medium w-16">{t('dash.thActions')}</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {isEditingMappings ? (
                            editingMappings.map((mapping, index) => (
                              <tr key={index} className="group">
                                <td className="py-4 pr-4">
                                  <input
                                    type="text"
                                    value={mapping.name}
                                    onChange={(e) => handleMappingChange(index, 'name', e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
                                    placeholder={t('mappings.phPlayer')}
                                  />
                                </td>
                                <td className="py-4 pr-4">
                                  <input
                                    type="text"
                                    value={mapping.team}
                                    onChange={(e) => handleMappingChange(index, 'team', e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
                                    placeholder={t('mappings.phTeam')}
                                  />
                                </td>
                                <td className="py-4">
                                  <button
                                    onClick={() => handleRemoveMapping(index)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            Object.entries(playerMappings).length > 0 ? (
                              Object.entries(playerMappings).map(([name, team], index) => (
                                <tr key={index} className="group hover:bg-slate-800/30 transition-colors">
                                  <td className="py-4 pr-4 font-medium text-white">{name}</td>
                                  <td className="py-4 pr-4">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent-500/10 text-accent-400 border border-accent-500/20">
                                      {team}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={2} className="py-12 text-center text-slate-400">
                                  {t('mappings.empty')}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'overlay' && (
                <motion.div
                  key="overlay"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-8"
                >
                  <header>
                    <h2 className="text-3xl font-bold text-white mb-2">{t('overlaySettings.title')}</h2>
                    <p className="text-slate-400">{t('overlaySettings.desc')}</p>
                  </header>

                  {/* Sub-tabs Navigation */}
                  <div className="flex gap-2 mb-6 bg-slate-900/50 p-1 rounded-xl w-fit">
                    {(['general', 'theme', 'animation'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setOverlayTab(tab)}
                        className={cn(
                          "px-6 py-2 rounded-lg text-sm font-bold transition-all",
                          overlayTab === tab
                            ? "bg-accent-600 text-white shadow-lg"
                            : "text-slate-400 hover:text-white hover:bg-slate-800"
                        )}
                      >
                        {tab === 'general' && t('overlay.tab.general')}
                        {tab === 'theme' && t('overlay.tab.theme')}
                        {tab === 'animation' && t('overlay.tab.animation')}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                    {/* Left Column: Settings */}
                    <div className="space-y-6">
                      <div className="glass-panel rounded-2xl p-8 border-none bg-slate-800/50">

                        <form
                          onChange={handleAutoSaveChange}
                          onSubmit={(e) => e.preventDefault()}
                          className="space-y-6"
                        >
                          {/* GENERAL TAB */}
                          {overlayTab === 'general' && (
                            <motion.div
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="space-y-6"
                            >
                              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                <Layout className="text-accent-500" size={24} />
                                {t('overlayUi.displaySettings')}
                              </h3>

                              <Toggle
                                name="keepScoreOnRestart"
                                defaultChecked={config?.scoreSettings?.keepScoreOnRestart ?? true}
                                label={t('overlayUi.keepScoresLabel')}
                                help={t('overlayUi.keepScoresHelp')}
                              />
                              <Toggle
                                name="showRemainingRaces"
                                defaultChecked={config?.showRemainingRaces ?? true}
                                label={t('overlayUi.remainingRacesLabel')}
                                help={t('overlayUi.remainingRacesHelp')}
                              />

                              <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50 flex flex-col gap-4">
                                <div className="flex justify-between items-center">
                                  <div>
                                    <p className="font-bold text-slate-200">{t('overlayUi.urlTitle')}</p>
                                    <p className="text-xs text-slate-400">{t('overlayUi.urlDesc')}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={handleOpenOverlay}
                                    className="bg-accent-600 hover:bg-accent-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                                  >
                                    <ExternalLink size={16} />
                                    {t('overlayUi.openBrowser')}
                                  </button>
                                </div>
                                <div className="bg-black/30 p-3 rounded-lg font-mono text-sm text-slate-300 select-all cursor-text flex justify-between items-center">
                                  <span>http://localhost:{serverPort}/</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(`http://localhost:${serverPort}/`)
                                      setIsCopiedUrl(true)
                                      if (copiedUrlTimerRef.current) clearTimeout(copiedUrlTimerRef.current)
                                      copiedUrlTimerRef.current = setTimeout(() => setIsCopiedUrl(false), 2000)
                                    }}
                                    className="text-slate-400 hover:text-white transition-colors"
                                  >
                                    {isCopiedUrl ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}

                          {/* THEME TAB */}
                          {overlayTab === 'theme' && (
                            <motion.div
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="space-y-6"
                            >
                              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                <Palette className="text-purple-500" size={24} />
                                {t('overlayUi.themeColorSection')}
                              </h3>

                              <div className="space-y-2 p-4 bg-surface rounded-xl border border-slate-700">
                                <label className="text-sm font-medium text-slate-200">{t('overlayUi.overlayThemeLabel')}</label>
                                <select
                                  name="overlayTheme"
                                  defaultValue={config?.overlayTheme || 'default'}
                                  onChange={(e) => {
                                    setSelectedOverlayTheme(e.target.value)
                                    setIsDirty(true)
                                  }}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all font-sans"
                                >
                                  {/* NOTE: 「マリオカートWii風(mkw)」テーマは選択肢から除外中。
                                      実装は public/overlay/index.html と config の型に保持しており、
                                      保存済みの 'mkw' は config-manager 側で 'default' に正規化される。 */}
                                  <option value="default">{t('overlayUi.themeDefault')}</option>
                                </select>
                                <p className="text-xs text-slate-400">{t('overlayUi.themeDesc')}</p>
                              </div>

                              {/* デフォルトテーマ設定 (Common for most themes except very specific ones) */}
                              <div className="space-y-6 pt-4 border-t border-slate-700/50">
                                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-2">
                                  {t('overlayUi.colorDetailSection')}
                                </h4>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2 p-4 bg-surface rounded-xl border border-slate-700">
                                    <label className="text-sm font-medium text-slate-200">{t('overlayUi.scoreEffectLabel')}</label>
                                    <div className="flex flex-col gap-2">
                                      <ColorPicker
                                        name="scoreEffect"
                                        initialValue={config?.overlayColors?.scoreEffect || '#22c55e'}
                                        onChange={() => setIsDirty(true)}
                                      />
                                    </div>
                                    <p className="text-xs text-slate-400">{t('overlayUi.scoreEffectDesc')}</p>
                                  </div>

                                  <div className="space-y-2 p-4 bg-surface rounded-xl border border-slate-700">
                                    <label className="text-sm font-medium text-slate-200">{t('overlayUi.ownTeamStyleLabel')}</label>
                                    <select
                                      name="ownTeamStyle"
                                      defaultValue={config?.overlayColors?.ownTeamStyle || 'rainbow'}
                                      onChange={(e) => {
                                        setSelectedOwnTeamStyle(e.target.value)
                                        setIsDirty(true)
                                      }}
                                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all font-sans"
                                    >
                                      <option value="solid">{t('overlayUi.styleSolid')}</option>
                                      <option value="rainbow">{t('overlayUi.styleRainbow')}</option>
                                      <option value="gradient">{t('overlayUi.styleGradient')}</option>
                                    </select>
                                    <p className="text-xs text-slate-400">{t('overlayUi.ownTeamStyleDesc')}</p>
                                  </div>
                                </div>

                                {/* 条件付き表示: 自チームの詳細設定 */}
                                {(selectedOwnTeamStyle === 'solid' || selectedOwnTeamStyle === 'gradient') && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-4 bg-surface rounded-xl border border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-6"
                                  >
                                    <div className="space-y-2">
                                      <label className="text-sm font-medium text-slate-200">{t('overlayUi.ownTeamColorLabel')}</label>
                                      <ColorPicker
                                        name="ownTeamColor"
                                        initialValue={config?.overlayColors?.ownTeamColor || '#fbbf24'}
                                        onChange={() => setIsDirty(true)}
                                      />
                                    </div>

                                    {selectedOwnTeamStyle === 'gradient' && (
                                      <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-200">{t('overlayUi.gradientVariationLabel')}</label>
                                        <select
                                          name="ownTeamGradient"
                                          defaultValue={config?.overlayColors?.ownTeamGradient || 'blue'}
                                          onChange={() => setIsDirty(true)}
                                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all font-sans"
                                        >
                                          <option value="blue">{t('overlayUi.gradBlue')}</option>
                                          <option value="pink">{t('overlayUi.gradPink')}</option>
                                          <option value="orange">{t('overlayUi.gradOrange')}</option>
                                          <option value="emerald">{t('overlayUi.gradEmerald')}</option>
                                        </select>
                                      </div>
                                    )}
                                  </motion.div>
                                )}
                              </div>
                            </motion.div>
                          )}

                          {/* ANIMATION TAB */}
                          {overlayTab === 'animation' && (
                            <motion.div
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="space-y-6"
                            >
                              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                <Zap className="text-yellow-400" size={24} />
                                {t('overlayUi.animDetailSection')}
                              </h3>

                              <div className="space-y-6 bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                                <Toggle
                                  name="rankAnim"
                                  defaultChecked={config?.overlayAnimations?.rankAnim ?? true}
                                  label={t('overlayUi.rankAnimLabel')}
                                  help={t('overlayUi.rankAnimHelp')}
                                />
                                <Toggle
                                  name="flashOnUpdate"
                                  defaultChecked={config?.overlayAnimations?.flash ?? true}
                                  label={t('overlayUi.flashLabel')}
                                  help={t('overlayUi.flashHelp')}
                                />

                                <div className="space-y-2 pt-2">
                                  <div className="flex justify-between">
                                    <label className="text-sm font-medium text-slate-200">{t('overlayUi.speedLabel')}</label>
                                    <span className="text-sm font-bold text-accent-400">x{config?.overlayAnimations?.speed ?? 1.0}</span>
                                  </div>
                                  <input
                                    type="range"
                                    name="animationSpeed"
                                    min="0.5"
                                    max="2.0"
                                    step="0.1"
                                    defaultValue={config?.overlayAnimations?.speed ?? 1.0}
                                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-accent-500"
                                  />
                                  <div className="flex justify-between text-xs text-slate-400">
                                    <span>Slow (0.5x)</span>
                                    <span>Normal (1.0x)</span>
                                    <span>Fast (2.0x)</span>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}

                          {/* 自動保存インジケータ（保存ボタンは廃止） */}
                          <div className="pt-4 border-t border-slate-700/50 mt-6 h-12 flex items-center justify-center">
                            <span
                              className={cn(
                                "flex items-center gap-1.5 text-xs font-bold text-emerald-400 transition-opacity duration-300",
                                showSavedTick ? "opacity-100" : "opacity-0"
                              )}
                            >
                              <CheckCircle size={14} />
                              {t('messages.configSaved')}
                            </span>
                          </div>
                        </form>
                      </div>
                    </div>

                    {/* Right Column: Preview */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="font-bold text-white flex items-center gap-2">
                          <Monitor size={20} className="text-emerald-400" />
                          {t('overlaySettings.previewTitle')}
                        </h3>
                        <button
                          type="button"
                          onClick={handlePlayDemo}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-lg shadow-emerald-900/20 active:scale-95 flex items-center gap-1"
                        >
                          <Play size={14} />
                          {t('overlaySettings.playDemo')}
                        </button>
                      </div>

                      <div className="w-full aspect-video bg-black/40 rounded-2xl border border-slate-700 overflow-hidden relative backdrop-blur-sm group">
                        <iframe
                          ref={previewIframeRef}
                          src={previewUrl}
                          onLoad={sendPreviewData}
                          className="w-full h-full border-none transform origin-top-left scale-[0.6]"
                          style={{ width: '166.6%', height: '166.6%' }}
                          title="Overlay Preview"
                        />
                        <div className="absolute inset-0 pointer-events-none border-2 border-slate-700/50 rounded-2xl group-hover:border-slate-600/50 transition-colors"></div>
                      </div>
                      <p className="text-center text-xs text-slate-400">
                        {t('overlaySettings.previewScaled')}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Settings className="text-slate-400" />
                        {t('config.title')}
                      </h2>
                      <p className="text-slate-400 text-sm mt-1">アプリケーションの動作設定を行います</p>
                    </div>
                  </div>

                  {/* Sub-tabs Navigation */}
                  <div className="flex gap-2 mb-6 bg-slate-900/50 p-1 rounded-xl w-fit">
                    {(['system', 'obs', 'ai'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setSettingsTab(tab)}
                        className={cn(
                          "px-6 py-2 rounded-lg text-sm font-bold transition-all",
                          settingsTab === tab
                            ? "bg-accent-600 text-white shadow-lg"
                            : "text-slate-400 hover:text-white hover:bg-slate-800"
                        )}
                      >
                        {tab === 'system' && t('settings.tabs.system')}
                        {tab === 'obs' && t('settings.tabs.obs')}
                        {tab === 'ai' && t('settings.tabs.ai')}
                      </button>
                    ))}
                  </div>

                  <form onChange={handleAutoSaveChange} onSubmit={(e) => e.preventDefault()} className="space-y-8">

                    {/* SYSTEM SETTINGS */}
                    {settingsTab === 'system' && (
                      <motion.section
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-raised p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6"
                      >
                        <h3 className="text-lg font-bold flex items-center gap-2 text-purple-400">
                          <Monitor size={20} />
                          {t('settingsSys.appearanceTitle')}
                        </h3>

                        <div className="space-y-6">
                          {/* Background Style */}
                          <div className="space-y-3">
                            <label className="text-sm font-medium text-slate-400">{t('settingsSys.bgStyle')}</label>
                            <div className="grid grid-cols-2 gap-4">
                              <button
                                type="button"
                                onClick={() => setBgStyle('planetarium')}
                                className={cn(
                                  "p-4 rounded-xl border transition-all flex flex-col items-center gap-2",
                                  bgStyle === 'planetarium'
                                    ? "bg-accent-900/40 border-accent-500 text-accent-200"
                                    : "bg-slate-900/40 border-slate-700 text-slate-400 hover:bg-slate-800"
                                )}
                              >
                                <div className="w-full h-24 rounded-lg bg-gradient-to-br from-indigo-900 to-purple-900 overflow-hidden relative mb-2">
                                  <div className="absolute inset-0 opacity-50 flex items-center justify-center text-xs text-white/50">Planetarium Preview</div>
                                </div>
                                <span className="font-bold">{t('settingsSys.bgPlanetarium')}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setBgStyle('nebula')}
                                className={cn(
                                  "p-4 rounded-xl border transition-all flex flex-col items-center gap-2",
                                  bgStyle === 'nebula'
                                    ? "bg-purple-900/40 border-purple-500 text-purple-200"
                                    : "bg-slate-900/40 border-slate-700 text-slate-400 hover:bg-slate-800"
                                )}
                              >
                                <div className="w-full h-24 rounded-lg bg-black overflow-hidden relative mb-2 border border-purple-800">
                                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-[#020617] to-[#020617]"></div>
                                  <div className="absolute top-2 right-4 w-1 h-1 bg-white rounded-full shadow-[0_0_4px_white] animate-pulse"></div>
                                  <div className="absolute bottom-4 left-6 w-0.5 h-0.5 bg-white rounded-full opacity-50"></div>
                                  <div className="absolute inset-0 flex items-center justify-center text-xs text-white/50 z-10 font-bold">Deep Space</div>
                                </div>
                                <span className="font-bold">Nebula</span>
                              </button>
                            </div>
                          </div>

                          {/* Lite Mode Toggle */}
                          <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                            <div className="space-y-1">
                              <div className="font-bold text-slate-200 flex items-center gap-2">
                                <Zap size={16} className="text-yellow-400" />
                                {t('settingsSys.liteMode')}
                              </div>
                              <p className="text-xs text-slate-400">
                                {t('settingsSys.liteModeDesc')}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setLiteMode(!liteMode)}
                              className={cn(
                                "relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent-600 focus:ring-offset-2",
                                liteMode ? "bg-accent-600" : "bg-slate-700"
                              )}
                            >
                              <span className="sr-only">Use setting</span>
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                  liteMode ? "translate-x-7" : "translate-x-0"
                                )}
                              />
                            </button>
                          </div>
                        </div>
                      </motion.section>
                    )}

                    {/* OBS SETTINGS */}
                    {settingsTab === 'obs' && (
                      <motion.section
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-raised p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6"
                      >
                        <h3 className="text-lg font-bold flex items-center gap-2 text-accent-400">
                          <Radio size={20} />
                          {t('settingsSys.obsSection')}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">{t('config.obsIp')}</label>
                            <input
                              name="obsWsIp"
                              type="text"
                              defaultValue={config?.obsIp || '127.0.0.1'}
                              placeholder="127.0.0.1"
                              className="w-full bg-surface border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all font-mono"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">{t('config.obsPort')}</label>
                            <input
                              name="obsWsPort"
                              type="text"
                              defaultValue={config?.obsPort || '4455'}
                              placeholder="4455"
                              className="w-full bg-surface border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all font-mono"
                            />
                          </div>
                          {/* 既定値案内: 特別な理由がなければデフォルトのままで良い */}
                          <p className="text-xs text-slate-500 leading-relaxed md:col-span-2 self-end">{t('config.obsDefaultsHint')}</p>
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-slate-400">{t('config.obsPassword')}</label>
                            <input
                              name="obsWsPassword"
                              type="password"
                              defaultValue={config?.obsPassword}
                              placeholder="OBS WebSocket Password"
                              className="w-full bg-surface border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all font-mono"
                            />
                            <p className="text-xs text-slate-500 leading-relaxed">{t('config.obsPasswordHint')}</p>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-slate-700/50">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                              {t('settingsSys.obsSourceLabel')}
                              <span className="text-xs text-yellow-500 border border-yellow-500/30 px-1 rounded bg-yellow-500/10">{t('common.important')}</span>
                            </label>
                            <div className="relative">
                              {/* 角丸カスタムドロップダウン: 入力値の有無に関わらず全ソースを表示 */}
                              <SourceSelect
                                name="obsSourceName"
                                defaultValue={config?.obsSourceName}
                                sources={(obsInputs ?? []) as { inputName: string; inputKind?: string }[]}
                                placeholder={t('config.obsSourceNamePlaceholder')}
                              />
                            </div>
                            {!obsStatus && (
                              <p className="text-xs text-slate-400 mt-1">
                                {t('config.obsSourceDropdownHint')}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                          <button
                            type="button"
                            onClick={() => window.electron.ipcRenderer.invoke('refresh-obs-browser-sources')}
                            className="flex items-center justify-center gap-2 bg-slate-800/50 hover:bg-slate-800 text-slate-300 py-3 rounded-xl font-medium transition-all border border-slate-700 active:scale-[0.98]"
                          >
                            <RefreshCw size={16} />
                            {t('settings.refreshSources')}
                          </button>
                          <button
                            type="button"
                            onClick={autoSetupObsOverlay}
                            className="flex items-center justify-center gap-2 bg-accent-600/10 hover:bg-accent-600 text-accent-400 hover:text-white py-3 rounded-xl font-bold transition-all border border-accent-500/30 active:scale-[0.98] group"
                          >
                            <ExternalLink size={16} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            {t('config.obsAutoSetup')}
                          </button>
                        </div>
                      </motion.section>
                    )}

                    {/* AI SETTINGS */}
                    {settingsTab === 'ai' && (
                      <motion.section
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-raised p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6"
                      >
                        <h3 className="text-lg font-bold flex items-center gap-2 text-green-400">
                          <Zap size={20} />
                          {t('settingsAi.title')}
                        </h3>

                        <input type="hidden" name="aiProvider" value="groq" />

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-400">{t('config.analysisModeLabel')}</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className={cn(
                              "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all",
                              config?.analysisMode !== 'standings24'
                                ? "bg-accent-600/10 border-accent-500/50"
                                : "bg-slate-900/50 border-slate-700 hover:border-slate-600"
                            )}>
                              <input
                                type="radio"
                                name="analysisMode"
                                value="standard12"
                                defaultChecked={config?.analysisMode !== 'standings24'}
                                className="mt-1 accent-accent-500"
                              />
                              <span>
                                <span className="block text-sm font-bold text-white">{t('config.analysisModeStandard')}</span>
                                <span className="block text-xs text-slate-400 mt-1">{t('config.analysisModeStandardHelp')}</span>
                              </span>
                            </label>
                            <label className={cn(
                              "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all",
                              config?.analysisMode === 'standings24'
                                ? "bg-green-600/10 border-green-500/50"
                                : "bg-slate-900/50 border-slate-700 hover:border-slate-600"
                            )}>
                              <input
                                type="radio"
                                name="analysisMode"
                                value="standings24"
                                defaultChecked={config?.analysisMode === 'standings24'}
                                className="mt-1 accent-green-500"
                              />
                              <span>
                                <span className="block text-sm font-bold text-white">{t('config.analysisModeStandings')}</span>
                                <span className="block text-xs text-slate-400 mt-1">{t('config.analysisModeStandingsHelp')}</span>
                              </span>
                            </label>
                          </div>
                          <p className="text-xs text-slate-400">{t('config.analysisModeHelp')}</p>
                        </div>

                        {/* 校正プリセットは解析コンテキスト(モード×ゲーム)ごとに管理されるため
                            標準モード中も常時表示する（編集対象はアクティブなコンテキストに連動） */}
                        <StandingsCalibrationPanel config={config} setConfig={setConfig} />

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">{t('config.groqApiKey')}</label>
                            <div className="flex gap-2">
                              <input
                                id="settingsGroqApiKey"
                                name="groqApiKey"
                                type="password"
                                defaultValue={config?.groqApiKey}
                                placeholder={t('config.groqApiKeyPlaceholder')}
                                className="flex-1 min-w-0 bg-surface border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => pasteIntoInput('settingsGroqApiKey')}
                                className="flex items-center gap-1.5 text-xs px-3 rounded-xl border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 transition-all whitespace-nowrap"
                              >
                                <Clipboard size={14} />
                                {t('config.pasteApiKey')}
                              </button>
                            </div>
                            <p className="text-xs text-slate-400 italic">
                              {t('settingsAi.qwenNote')}
                            </p>
                          </div>

                          <div className="border border-slate-700 rounded-xl overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setShowGroqInstructions(!showGroqInstructions)}
                              className="w-full flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800 transition-colors text-sm font-medium text-slate-300"
                            >
                              <span>{t('settingsAi.howToTitle')}</span>
                              <ChevronRight
                                size={16}
                                className={cn("transition-transform duration-200", showGroqInstructions && "rotate-90")}
                              />
                            </button>
                            <AnimatePresence>
                              {showGroqInstructions && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-3 text-sm text-slate-400">
                                    <p className="flex gap-2">
                                      <span className="flex-shrink-0 w-5 h-5 bg-slate-800 rounded-full flex items-center justify-center text-xs text-white">1</span>
                                      <span className="flex-1">
                                        <a
                                          href="https://console.groq.com/keys"
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-accent-400 hover:underline inline-flex items-center gap-1"
                                        >
                                          Groq Cloud Console <ExternalLink size={12} />
                                        </a>
                                        {t('settingsAi.how1')}
                                      </span>
                                    </p>
                                    <p className="flex gap-2">
                                      <span className="flex-shrink-0 w-5 h-5 bg-slate-800 rounded-full flex items-center justify-center text-xs text-white">2</span>
                                      <span className="flex-1">{t('settingsAi.how2')}</span>
                                    </p>
                                    <p className="flex gap-2">
                                      <span className="flex-shrink-0 w-5 h-5 bg-slate-800 rounded-full flex items-center justify-center text-xs text-white">3</span>
                                      <span className="flex-1">{t('settingsAi.how3')}</span>
                                    </p>
                                    <p className="flex gap-2">
                                      <span className="flex-shrink-0 w-5 h-5 bg-slate-800 rounded-full flex items-center justify-center text-xs text-white">4</span>
                                      <span className="flex-1">{t('settingsAi.how4')}</span>
                                    </p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* 利用可能なモデル一覧（画像認識対応判定つき） */}
                          <GroqModelList hasApiKey={!!config?.groqApiKey} />
                        </div>
                      </motion.section>
                    )}

                    {/* 自動保存インジケータ（保存ボタンは廃止） */}
                    <div className="flex justify-end pt-4 border-t border-slate-700/30 h-14 items-center">
                      <span
                        className={cn(
                          "flex items-center gap-1.5 text-xs font-bold text-emerald-400 transition-opacity duration-300",
                          showSavedTick ? "opacity-100" : "opacity-0"
                        )}
                      >
                        <CheckCircle size={14} />
                        {t('messages.configSaved')}
                      </span>
                    </div>
                  </form>
                </motion.div>
              )}

              {activeTab === 'about' && (
                <motion.div
                  key="about"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="max-w-2xl mx-auto text-center space-y-8 py-12"
                >
                  <div className="w-24 h-24 bg-accent-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-accent-900/40 mx-auto mb-8">
                    <Monitor className="text-white" size={48} />
                  </div>
                  <h2 className="text-4xl font-bold text-white">Grosoq</h2>
                  <p className="text-xl text-slate-400 leading-relaxed">
                    {t('app.subtitle')}
                  </p>
                  <div className="bg-raised p-8 rounded-2xl border border-slate-800 shadow-xl text-left space-y-4">
                    <h3 className="font-bold text-lg border-b border-slate-800 pb-2 mb-4">{t('about.developer')}</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {/* GitHub Link */}
                      <button
                        onClick={() => window.electron.ipcRenderer.invoke('open-external', 'https://github.com/eito54/Grosoq')}
                        className="bg-[#24292e] hover:bg-[#2f363d] text-white p-4 rounded-xl border border-slate-700 hover:border-slate-500 transition-all group flex flex-col items-center gap-3 shadow-lg"
                      >
                        <div className="p-1.5 bg-white/10 rounded-full group-hover:scale-110 group-hover:rotate-3 transition-transform">
                          <img
                            src={githubIcon}
                            alt="GitHub"
                            draggable={false}
                            className="w-11 h-11 rounded-full object-cover ring-1 ring-white/25"
                          />
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-sm">GitHub</p>
                          <p className="text-xs text-slate-400">eito54/Grosoq</p>
                        </div>
                      </button>

                      {/* X (Twitter) Link */}
                      <button
                        onClick={() => window.electron.ipcRenderer.invoke('open-external', 'https://x.com/eiteen05')}
                        className="bg-black hover:bg-slate-900 text-white p-4 rounded-xl border border-slate-700 hover:border-slate-500 transition-all group flex flex-col items-center gap-3 shadow-lg"
                      >
                        <div className="p-1.5 bg-white/10 rounded-full group-hover:scale-110 group-hover:-rotate-3 transition-transform">
                          <img
                            src={twitterIcon}
                            alt="X (Twitter)"
                            draggable={false}
                            className="w-11 h-11 rounded-full object-cover ring-1 ring-white/25"
                          />
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-sm">X (Twitter)</p>
                          <p className="text-xs text-slate-400">@eiteen05</p>
                        </div>
                      </button>
                    </div>
                  </div>
                  <p className="text-slate-400 pt-8">
                    {t('footer.madeWith')}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        <MessageModal
          isOpen={!!guiModal}
          onClose={() => setGuiModal(null)}
          type={guiModal?.type || 'info'}
          title={guiModal?.title || ''}
          message={guiModal?.message || ''}
        />

        <ConfirmModal
          isOpen={showConfirmModal}
          onConfirm={confirmTabChange}
          onCancel={() => setShowConfirmModal(false)}
          title={t('modal.unsavedTitle')}
          message={t('modal.unsavedMessage')}
        />

        <WhatsNewModal
          isOpen={showWhatsNew}
          onClose={handleCloseWhatsNew}
          version={whatsNewInfo.version}
          notes={whatsNewInfo.notes}
        />

        <SlotModal
          isOpen={showSlotNameModal}
          onClose={() => setShowSlotNameModal(false)}
          onConfirm={() => {
            switch (slotModalType) {
              case 'load': executeLoadSlot(); break;
              case 'add': executeAddScoresFromSlot(); break;
              case 'delete': executeDeleteSlot(); break;
            }
          }}
          type={slotModalType}
        />

        <ConfirmModal
          isOpen={showResetConfirmModal}
          onConfirm={executeResetScores}
          onCancel={() => setShowResetConfirmModal(false)}
          title={t('modal.resetTitle')}
          message={t('modal.resetMessage')}
          confirmText={t('modal.resetConfirm')}
        />

        <ReconnectModal
          isOpen={showReconnectModal}
          players={reconnectCandidates}
          onRestore={() => resolveReconnect(true)}
          onKeep={() => resolveReconnect(false)}
        />
      </div>
      <div className="fixed inset-0 -z-50 bg-surface-deep" />
      <div className="noise-overlay" />
      <BackgroundEffect liteMode={liteMode} style={bgStyle} />
    </>
  )
}

export default App
