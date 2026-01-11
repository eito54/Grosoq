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
  Github,
  Twitter,
  Clipboard,
  Check,
  Radio,
  Search
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import bootLogo from './assets/boot-logo.png'

import { ScanningOverlay } from './components/ScanningOverlay'
import { ColorPicker } from './components/ColorPicker'
import { MessageModal } from './components/MessageModal'
import { ConfirmModal } from './components/ConfirmModal'
import { SlotModal } from './components/SlotModal'
import { WhatsNewModal } from './components/WhatsNewModal'
import { ScoreItem } from './components/ScoreItem'
import { LogEntry, SlotData } from './types'
import { cn, calculateRaceScore } from './utils'
import { BackgroundEffect } from './components/BackgroundEffect'

// Removed local definitions (CountUp, ScanningOverlay, ColorPicker, MessageModal, ConfirmModal, SlotModal, WhatsNewModal, ScoreItem, cn, calculateRaceScore, LogEntry, SlotData) as they are now imported.


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
  const [showWizard, setShowWizard] = useState(false)
  const [obsStatus, setObsStatus] = useState(false)
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
  const [slotNameInput, setSlotNameInput] = useState('')
  const [slotModalType, setSlotModalType] = useState<'load' | 'add' | 'delete'>('load')
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false)

  // Overlay preview states
  const [selectedOverlayTheme, setSelectedOverlayTheme] = useState<string>('default')
  const [selectedOwnTeamStyle, setSelectedOwnTeamStyle] = useState<string>('rainbow')

  // Persist manually selected current team
  // Persist manually selected current team
  const [manualCurrentTeam, setManualCurrentTeam] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)


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
      // @ts-ignore
      const result = await window.electron.ipcRenderer.invoke('check-for-updates')
      console.log('Update check result:', result);

      if (result.success === false) {
        if (!silent) addLog(`アップデートチェックエラー: ${result.error}`, 'error')
        return
      }

      if (result.hasUpdate) {
        setUpdateInfo(result)
        setShowUpdateToast(true)
        if (!silent) {
          const displayCurrent = result.currentVersion || '不明'
          const displayLatest = result.latestVersion || '不明'
          addLog(`新しいバージョン ${displayLatest} が利用可能です (現在: ${displayCurrent})`, 'info')
        }
      } else {
        if (!silent) {
          const displayCurrent = result.currentVersion || '不明'
          addLog(`最新バージョンを使用しています (現在: ${displayCurrent})`, 'success')
        }
      }
    } catch (error: any) {
      console.error('handleCheckUpdate global error:', error);
      const errorMsg = error.message || JSON.stringify(error)
      if (!silent) addLog(`アップデートチェックに失敗しました: ${errorMsg}`, 'error')
    } finally {
      if (!silent) setIsCheckingUpdate(false)
    }
  }, [addLog])

  const handleStartDownloadUpdate = async () => {
    if (!window.electron || !window.electron.ipcRenderer) return
    setIsDownloadingUpdate(true)
    addLog('アップデートのダウンロードを開始します...', 'info')
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
    // @ts-ignore
    window.electron?.ipcRenderer?.on('obs-status-change', handleObsStatus)

    // Initial check
    // @ts-ignore
    window.electron?.ipcRenderer?.invoke('obs-get-status').then(status => {
      setObsStatus(status)
      if (status) {
        // @ts-ignore
        window.electron?.ipcRenderer?.invoke('obs-get-inputs').then((result: any) => {
          if (result.success) setObsInputs(result.inputs)
        })
      }
    })

    return () => {
      // @ts-ignore
      window.electron?.ipcRenderer?.removeListener('obs-status-change', handleObsStatus)
    }
  }, [])

  const toggleObsConnection = async () => {
    if (obsStatus) {
      // @ts-ignore
      await window.electron.ipcRenderer.invoke('obs-disconnect')
    } else {
      setIsObsConnecting(true)
      try {
        // @ts-ignore
        const result = await window.electron.ipcRenderer.invoke('obs-connect', config)
        if (!result.success) {
          showGuiMessage('error', 'OBS接続エラー', result.error)
        } else {
          // Connected! If source name is empty, try to find a good one
          if (!config?.obsSourceName) {
            // @ts-ignore
            const sourceResult = await window.electron.ipcRenderer.invoke('obs-find-best-source')
            if (sourceResult.success && sourceResult.sourceName) {
              const updatedConfig = { ...config, obsSourceName: sourceResult.sourceName }
              setConfig(updatedConfig)
              // @ts-ignore
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
    // @ts-ignore
    const result = await window.electron.ipcRenderer.invoke('obs-detect-settings')
    if (result.success && result.settings) {
      const { port, password, enabled } = result.settings
      const updatedConfig = { ...config, obsPort: port, obsPassword: password }
      setConfig(updatedConfig)
      setIsDirty(true)

      if (!enabled) {
        showGuiMessage('info', 'OBS設定を読み込みました', '設定を読み込みましたが、OBS側で「WebSocketサーバー」が無効になっているようです。OBSの「ツール」→「WebSocketサーバー設定」から有効にしてください。')
      } else {
        showGuiMessage('info', '成功', 'OBSから設定を自動取得しました。')
      }
    } else {
      showGuiMessage('error', 'エラー', 'OBSの設定ファイルが見つかりませんでした。')
    }
  }

  const autoSetupObsOverlay = async () => {
    if (!obsStatus) {
      showGuiMessage('info', 'OBS', 'まずOBSに接続してください')
      return
    }
    // @ts-ignore
    const result = await window.electron.ipcRenderer.invoke('obs-auto-setup')
    if (result.success) {
      showGuiMessage('info', '成功', 'OBSにブラウザソースを追加しました')
    } else {
      showGuiMessage('error', 'エラー', result.error)
    }
  }

  const loadConfig = useCallback(async () => {
    try {
      if (!window.electron || !window.electron.ipcRenderer) {
        console.warn('Electron IPC is not available. This might be expected in a browser preview.')
        return
      }
      // @ts-ignore
      let cfg = await window.electron.ipcRenderer.invoke('get-config')

      // 完全に新規の場合のデフォルト値
      const defaults = {
        obsIp: '127.0.0.1',
        obsPort: 4455,
        obsSourceName: '映像キャプチャデバイス',
        aiProvider: 'groq',
        theme: 'light',
        language: 'ja',
        overlayTheme: 'default',
        overlayColors: {
          background: 'rgba(15, 23, 42, 0.9)',
          text: '#f8fafc',
          accent: '#3b82f6',
          scoreEffect: '#22c55e',
          ownTeamStyle: 'rainbow',
          ownTeamColor: '#fbbf24',
          ownTeamGradient: 'blue'
        }
      }

      // 既存の設定がある場合はデフォルトとマージし、特定の値を正規化
      let finalConfig = defaults;
      if (cfg) {
        finalConfig = { ...defaults, ...cfg }
        // 空文字や特定のデフォルト無視値を補正
        if (!finalConfig.obsIp || finalConfig.obsIp === 'localhost') {
          finalConfig.obsIp = '127.0.0.1'
        }
        if (!finalConfig.obsPort) {
          finalConfig.obsPort = 4455
        }
        if (!finalConfig.obsSourceName) {
          finalConfig.obsSourceName = '映像キャプチャデバイス'
        }
      }

      setConfig(finalConfig)
      setIsConfigInvalid(!finalConfig?.obsIp || !finalConfig?.obsPort || !finalConfig?.obsSourceName || !finalConfig?.groqApiKey)


      // Auto-connect to OBS on startup if configured
      if (finalConfig.obsIp && finalConfig.obsPort) {
        // @ts-ignore
        window.electron.ipcRenderer.invoke('obs-connect', finalConfig)
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
      addLog('設定の読み込みに失敗しました', 'error')
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

    setStatus('loading')
    addLog(useTotalScore ? 'チーム合計点を取得中...' : 'レース結果を取得中...', 'info')

    try {
      // チーム合計点を取得（useTotalScore）時は、解析前にプレイヤーマッピングをリセット
      if (useTotalScore) {
        await fetch(`http://localhost:${serverPort}/api/player-mapping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })
        loadPlayerMappings() // UI側の状態も即座にリセット
      }

      // @ts-ignore
      const result = await window.electron.ipcRenderer.invoke('fetch-race-results', useTotalScore)

      if (result.success) {
        setStatus('success')
        addLog('結果の取得に成功しました', 'success')

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

        if (useTotalScore) {
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

        await fetch(`http://localhost:${serverPort}/api/scores?isOverallUpdate=${useTotalScore}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalScores)
        })

        loadScores()
        // loadPlayerMappings() // Removed as per instruction
      } else {
        setStatus('error')
        addLog(`エラー: ${result.error}`, 'error')
        showGuiMessage('error', 'エラー', result.error)
      }
    } catch (error: any) {
      setStatus('error')
      addLog(`通信エラー: ${error.message}`, 'error')
    }
  }, [status, scores, addLog, serverPort, loadScores, loadPlayerMappings])

  // Ref for handlers used in Electron listeners to avoid stale closures
  const handleFetchResultsRef = React.useRef(handleFetchResults)
  useEffect(() => {
    handleFetchResultsRef.current = handleFetchResults
  }, [handleFetchResults])


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
      addLog('スコアを更新しました', 'success')
    } catch (error) {
      addLog('スコアの更新に失敗しました', 'error')
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
    const name = slot ? slot.name : `スロット ${slotId + 1} (${new Date().toLocaleTimeString()})`

    try {
      addLog(`スロット ${slotId + 1} に保存中...`, 'info')

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
        addLog(`スロット ${slotId + 1} に「${name}」として保存しました`, 'success')
      } else {
        addLog(`スロットの保存に失敗しました`, 'error')
      }
    } catch (error: any) {
      console.error('Save slot error:', error)
      addLog(`スロットの保存中にエラーが発生しました`, 'error')
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
      addLog(`「${slot.name}」をロード中...`, 'info')
      const response = await fetch(`http://localhost:${serverPort}/api/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slot.scores)
      })

      if (response.ok) {
        loadScores()
        addLog(`「${slot.name}」をロードしました`, 'success')
        setActiveTab('dashboard')
        setShowSlotNameModal(false)
      } else {
        addLog('ロードに失敗しました', 'error')
      }
    } catch (error: any) {
      console.error('Failed to load slot:', error)
      addLog(`ロード中にエラーが発生しました: ${error.message}`, 'error')
    }
  }

  const executeAddScoresFromSlot = async () => {
    if (pendingSlotId === null) return
    const slot = slots.find(s => s.slotId === pendingSlotId)
    if (!slot) return

    try {
      addLog(`「${slot.name}」からスコアを加算中...`, 'info')
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
        addLog(`「${slot.name}」のスコアを加算しました`, 'success')
        setActiveTab('dashboard')
        setShowSlotNameModal(false)
      } else {
        addLog('スコアの加算に失敗しました', 'error')
      }
    } catch (error: any) {
      console.error('Failed to add scores from slot:', error)
      addLog(`加算中にエラーが発生しました: ${error.message}`, 'error')
    }
  }

  const executeDeleteSlot = async () => {
    if (pendingSlotId === null) return
    const slotId = pendingSlotId

    try {
      addLog(`スロット ${slotId + 1} を削除中...`, 'info')
      const response = await fetch(`http://localhost:${serverPort}/api/reopen-slots/${slotId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await fetchSlots()
        addLog(`スロット ${slotId + 1} を削除しました`, 'success')
        setShowSlotNameModal(false)
      } else {
        addLog('削除に失敗しました', 'error')
      }
    } catch (error: any) {
      console.error('Failed to delete slot:', error)
      addLog(`削除中にエラーが発生しました: ${error.message}`, 'error')
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
      addLog('スコアとマッピングをリセットしました', 'success')
      setShowResetConfirmModal(false)
    } catch (error) {
      addLog('リセットに失敗しました', 'error')
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
      addLog('プレイヤーマッピングを更新しました', 'success')
    } catch (error) {
      addLog('マッピングの更新に失敗しました', 'error')
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

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const formData = new FormData(form)

    // フォームに存在するフィールドのみを更新するように修正
    // これにより、別タブのフォーム保存時に既存の設定が null で上書きされるのを防ぐ
    const newConfig = { ...config }

    // フォーム内に特定の名前の入力要素が存在するかチェックする関数
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

    if (hasField('showRemainingRaces')) {
      newConfig.showRemainingRaces = formData.get('showRemainingRaces') === 'on'
    }

    if (hasField('overlayTheme')) {
      newConfig.overlayTheme = formData.get('overlayTheme') as 'default' | 'mkw'
    }

    // カラー設定の更新
    if (!newConfig.overlayColors) {
      newConfig.overlayColors = {
        background: 'rgba(15, 23, 42, 0.9)',
        text: '#f8fafc',
        accent: '#3b82f6',
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

    // スコア設定の更新
    if (hasField('keepScoreOnRestart')) {
      newConfig.scoreSettings = {
        ...config.scoreSettings,
        keepScoreOnRestart: formData.get('keepScoreOnRestart') === 'on'
      }
    }

    try {
      if (!window.electron || !window.electron.ipcRenderer) return
      // @ts-ignore
      const result = await window.electron.ipcRenderer.invoke('save-config', newConfig)
      if (result.success) {
        setConfig(newConfig)
        setIsDirty(false)
        setIsConfigInvalid(!newConfig?.obsIp || !newConfig?.obsPort || !newConfig?.obsSourceName || !newConfig?.groqApiKey)
        addLog(t('messages.configSaved'), 'success')
      } else {
        addLog(t('messages.configSaveError'), 'error')
      }
    } catch (error) {
      addLog('設定の保存に失敗しました', 'error')
    }
  }

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
    // @ts-ignore
    window.electron.ipcRenderer.invoke('open-external', url)
  }

  const toggleLanguage = () => {
    const newLang = i18n.language === 'ja' ? 'en' : 'ja'
    i18n.changeLanguage(newLang)
    if (config) {
      const updatedConfig = { ...config, language: newLang }
      // @ts-ignore
      window.electron.ipcRenderer.invoke('save-config', updatedConfig)
    }
  }

  const Toggle = ({ name, defaultChecked, label, help }: { name: string, defaultChecked: boolean, label: string, help?: string }) => {
    const [checked, setChecked] = useState(defaultChecked)

    useEffect(() => {
      setChecked(defaultChecked)
    }, [defaultChecked])

    return (
      <div className="flex items-center justify-between p-4 bg-[#0f172a] rounded-xl border border-slate-700">
        <div>
          <p className="font-medium text-slate-200">{label}</p>
          {help && <p className="text-xs text-slate-500">{help}</p>}
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            name={name}
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>
    )
  }

  useEffect(() => {
    const bootTimer = setTimeout(() => {
      setIsBooting(false)
      // ブート後に設定が不完全ならウィザードを表示
      if (!config?.obsIp || !config?.obsPort || !config?.groqApiKey) {
        setShowWizard(true)
      }
    }, 2500)
    return () => clearTimeout(bootTimer)
  }, [config])

  useEffect(() => {
    const checkWhatsNew = async () => {
      if (!window.electron || !window.electron.ipcRenderer) return

      try {
        const result = await window.electron.ipcRenderer.invoke('check-whats-new')
        if (result.show) {
          setWhatsNewInfo({ version: result.version, notes: result.notes })
          // 少し遅らせて起動時の情報量過多を避ける
          setTimeout(() => setShowWhatsNew(true), 3000)
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
      // @ts-ignore
      window.electron.ipcRenderer.invoke('get-app-version').then((v) => {
        setAppVersion(v)
        console.log('App version loaded:', v)
      })

      // 初回のみアップデートチェック
      handleCheckUpdate(true)

      window.electron.ipcRenderer.invoke('get-server-port').then((port: number) => {
        setServerPort(port)
        addLog(`内蔵サーバーがポート ${port} で待機中です`, 'success')
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
        addLog('アップデートのダウンロードが完了しました。再起動して適用してください', 'success')
      })

      const removeUpdateError = window.electron.ipcRenderer.on('update-error', (_event: any, err: any) => {
        setIsDownloadingUpdate(false)
        setIsCheckingUpdate(false)
        console.error('Renderer received detailed update-error:', err)
        addLog(`アップデートエラーが発生しました`, 'error')
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
        const data = JSON.parse(event.data)
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
            className="fixed inset-0 z-[999] bg-[#0f172a] flex flex-col items-center justify-center pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                duration: 1.2,
                ease: "easeOut",
                scale: { type: "spring", stiffness: 50 }
              }}
              className="relative"
            >
              <img
                src={bootLogo}
                alt="Boot Logo"
                className="w-[500px] h-auto drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]"
              />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 2, ease: "easeInOut", delay: 0.5 }}
                className="absolute -bottom-8 left-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent rounded-full shadow-[0_0_15px_rgba(59,130,246,0.8)]"
              />
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.8 }}
              className="mt-12 text-blue-400 font-black tracking-[0.2em] text-sm uppercase"
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
            className="fixed inset-0 z-[800] bg-[#0f172a]/95 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#1e293b] w-full max-w-2xl rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Wizard Header */}
              <div className="p-8 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Zap className="text-blue-400" size={24} />
                    初期設定ガイド
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">Grosoqを使い始めるための必須設定を行います</p>
                </div>
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((step) => (
                    <div
                      key={step}
                      className={cn(
                        "w-8 h-1.5 rounded-full transition-all duration-500",
                        wizardStep >= step ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-slate-700"
                      )}
                    />
                  ))}
                </div>
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
                      <div className="w-20 h-20 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Monitor className="text-blue-400" size={40} />
                      </div>
                      <h3 className="text-3xl font-bold text-white">ようこそ、Grosoqへ</h3>
                      <p className="text-slate-300 leading-relaxed max-w-md mx-auto">
                        Grosoqは、Groqの超高速なAIを使用してマリオカート8DXのレース結果を瞬時に分析するツールです。<br />
                        使い始めるために、2つの簡単な設定を行いましょう。
                      </p>
                      <button
                        onClick={() => setWizardStep(1)}
                        className="mt-8 bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-2xl font-black text-lg transition-all shadow-xl shadow-blue-900/40 active:scale-95"
                      >
                        設定を開始する
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
                        1. Groq APIキーの設定
                      </h3>
                      <p className="text-slate-400 text-sm">
                        解析に使用するGroqのAPIキーを入力してください。無料で取得可能です。
                      </p>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Groq API Key</label>
                          <input
                            type="password"
                            placeholder="gsk_..."
                            value={config?.groqApiKey || ''}
                            onChange={(e) => setConfig({ ...config, groqApiKey: e.target.value })}
                            className="w-full bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                          />
                        </div>

                        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-3">
                          <h4 className="text-sm font-bold text-slate-300">取得方法:</h4>
                          <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
                            <li><a href="https://console.groq.com/keys" target="_blank" className="text-blue-400 hover:underline">Groq Console</a>にアクセスしてログイン</li>
                            <li>「Create API Key」からキーを作成してコピー</li>
                            <li>上の入力欄に貼り付け</li>
                          </ol>
                        </div>
                      </div>

                      <div className="flex justify-between pt-6">
                        <button onClick={() => setWizardStep(0)} className="text-slate-500 hover:text-slate-300 font-medium">戻る</button>
                        <button
                          disabled={!config?.groqApiKey}
                          onClick={() => setWizardStep(2)}
                          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg"
                        >
                          次へ進む
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {wizardStep === 2 && (
                    <motion.div
                      key="step1.5"
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -20, opacity: 0 }}
                      className="space-y-6"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                          <Monitor className="text-blue-400" size={20} />
                          2. OBS WebSocket 設定
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
                        マリオカートの画面を取得するためにOBSに接続します。
                      </p>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500">IPアドレス</label>
                          <input
                            type="text"
                            value={config?.obsIp || ''}
                            onChange={(e) => setConfig({ ...config, obsIp: e.target.value })}
                            className="w-full bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                            placeholder="127.0.0.1"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500">ポート</label>
                          <input
                            type="number"
                            value={config?.obsPort || ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : parseInt(e.target.value)
                              setConfig({ ...config, obsPort: val })
                            }}
                            className="w-full bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500">WebSocket パスワード (任意)</label>
                        <input
                          type="password"
                          value={config?.obsPassword || ''}
                          onChange={(e) => setConfig({ ...config, obsPassword: e.target.value })}
                          placeholder="パスワードなし"
                          className="w-full bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        />
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2 relative">
                          <label className="text-xs font-bold text-slate-500">キャプチャソース名</label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              {obsInputs && obsInputs.length > 0 ? (
                                <select
                                  value={config?.obsSourceName || ''}
                                  onChange={(e) => setConfig({ ...config, obsSourceName: e.target.value })}
                                  className="w-full bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-sans"
                                >
                                  <option value="" disabled>ソースを選択してください</option>
                                  {obsInputs.map((input: any) => (
                                    <option key={input.inputName} value={input.inputName}>
                                      {input.inputName} ({input.inputKind.replace('_', ' ')})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={config?.obsSourceName || ''}
                                  onChange={(e) => setConfig({ ...config, obsSourceName: e.target.value })}
                                  placeholder="キャプチャソース名を入力または接続テスト"
                                  className="w-full bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                />
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                setIsObsConnecting(true)
                                try {
                                  // @ts-ignore
                                  const result = await window.electron.ipcRenderer.invoke('obs-connect', config)
                                  if (result.success) {
                                    // @ts-ignore
                                    const inputsResult = await window.electron.ipcRenderer.invoke('obs-get-inputs')
                                    if (inputsResult.success) setObsInputs(inputsResult.inputs)

                                    if (!config?.obsSourceName) {
                                      // @ts-ignore
                                      const sourceResult = await window.electron.ipcRenderer.invoke('obs-find-best-source')
                                      if (sourceResult.success && sourceResult.sourceName) {
                                        setConfig({ ...config, obsSourceName: sourceResult.sourceName })
                                      }
                                    }
                                  } else {
                                    showGuiMessage('error', '接続失敗', result.error)
                                  }
                                } finally {
                                  setIsObsConnecting(false)
                                }
                              }}
                              className={cn(
                                "px-6 rounded-xl font-bold transition-all flex items-center gap-2 border whitespace-nowrap",
                                obsStatus
                                  ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500 cursor-default"
                                  : "bg-blue-600 hover:bg-blue-500 text-white border-transparent shadow-lg shadow-blue-900/20"
                              )}
                            >
                              {isObsConnecting ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                              {obsStatus ? "接続済み" : "接続テスト"}
                            </button>
                          </div>
                          {!obsStatus && !obsInputs.length && (
                            <p className="text-[10px] text-slate-500 italic ml-1">
                              ※ 接続テストに成功すると、OBS内のソース一覧が自動取得されます。
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between pt-6">
                        <button onClick={() => setWizardStep(1)} className="text-slate-500 hover:text-slate-300 font-medium">戻る</button>
                        <button
                          disabled={!config?.obsIp || !config?.obsPort || !config?.obsSourceName}
                          onClick={() => setWizardStep(3)}
                          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg"
                        >
                          最後へ進む
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
                      className="space-y-6 text-center py-8"
                    >
                      <div className="w-20 h-20 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-emerald-500/30">
                        <CheckCircle2 className="text-emerald-500" size={40} />
                      </div>
                      <h3 className="text-3xl font-bold text-white">準備完了！</h3>
                      <p className="text-slate-300 leading-relaxed max-w-md mx-auto">
                        すべての設定が完了しました。これから「Grosoq」の超高速解析を体験しましょう。
                      </p>

                      <div className="pt-8 flex flex-col gap-4">
                        {obsStatus && (
                          <button
                            onClick={autoSetupObsOverlay}
                            className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 px-8 py-3 rounded-xl font-bold transition-all border border-blue-500/30 flex items-center gap-2 mx-auto text-sm"
                          >
                            <ExternalLink size={16} />
                            OBSにオーバーレイを自動追加する
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
                                addLog('初期設定が完了しました', 'success')
                              }
                            }
                          }}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-10 py-4 rounded-2xl font-black text-lg transition-all shadow-xl shadow-emerald-900/40 active:scale-95 flex items-center gap-2 mx-auto"
                        >
                          Grosoqを使い始める
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
            className="absolute -right-3 top-10 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          <div className={cn("p-6 flex items-center gap-3 overflow-hidden", isSidebarCollapsed && "justify-center px-0")}>
            <div className="min-w-[40px] w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
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
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Version</p>
                  <p className="text-[10px] font-mono text-slate-400">{appVersion}</p>
                </div>
              )}
              <button
                onClick={() => handleCheckUpdate()}
                disabled={isCheckingUpdate}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50",
                  updateInfo ? "bg-blue-600 text-white animate-pulse shadow-lg shadow-blue-900/40" : "bg-blue-600/20 hover:bg-blue-600/30 text-blue-400",
                  isSidebarCollapsed && "px-0"
                )}
                title={isSidebarCollapsed ? `v${appVersion} - アップデート確認` : undefined}
              >
                {isCheckingUpdate ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                {!isSidebarCollapsed && (updateInfo ? "アップデートがあります！" : "アップデート確認")}
              </button>
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
            {[
              { id: 'dashboard', icon: BarChart3, label: t('operations.title') },
              { id: 'reopen', icon: History, label: 'リオープンマネージャー' },
              { id: 'mappings', icon: Users, label: 'プレイヤーマッピング' },
              { id: 'overlay', icon: Layout, label: 'オーバーレイ設定' },
              { id: 'settings', icon: Settings, label: t('config.title') },
              { id: 'about', icon: Info, label: 'About' }
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
                    className="absolute inset-0 bg-blue-600 rounded-xl shadow-lg shadow-blue-900/40 -z-10"
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
            <button
              onClick={toggleLanguage}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors",
                isSidebarCollapsed && "px-0"
              )}
            >
              <Globe size={16} />
              {!isSidebarCollapsed && (i18n.language === 'ja' ? 'English' : '日本語')}
            </button>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-transparent relative custom-scrollbar">
          {/* Update Notification Toast */}
          <div className={cn(
            "fixed top-6 right-6 z-[100] transition-all duration-500 transform",
            showUpdateToast && updateInfo ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"
          )}>
            <div className="bg-blue-600 text-white p-1 rounded-2xl shadow-2xl shadow-blue-900/40 flex items-center gap-4 border border-blue-400/30">
              <div className="bg-white/20 p-3 rounded-xl">
                <Download size={24} />
              </div>
              <div className="pr-4">
                <h4 className="font-bold text-sm">アップデートがあります</h4>
                <p className="text-xs text-blue-100 mb-2">v{appVersion} → v{updateInfo?.latestVersion}</p>

                {updateInfo?.releaseNotes && (
                  <button
                    onClick={() => setShowReleaseNotes(true)}
                    className="text-[10px] bg-blue-700 hover:bg-blue-800 text-blue-100 px-2 py-0.5 rounded transition-colors mb-2 flex items-center gap-1"
                  >
                    <FileText size={10} />
                    アップデート内容を確認
                  </button>
                )}

                <div className="flex gap-2 mt-2">
                  {isUpdateDownloaded ? (
                    <button
                      onClick={handleQuitAndInstall}
                      className="bg-emerald-500 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-900/40"
                    >
                      再起動して適用
                    </button>
                  ) : isDownloadingUpdate ? (
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-blue-700 rounded-full overflow-hidden">
                        <div className="h-full bg-white transition-all duration-300" style={{ width: `${updateProgress}%` }} />
                      </div>
                      <span className="text-[10px] font-mono">{Math.round(updateProgress)}%</span>
                    </div>
                  ) : updateInfo?.isAutoUpdater ? (
                    <button
                      onClick={handleStartDownloadUpdate}
                      className="bg-white text-blue-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-blue-50 transition-colors"
                    >
                      アップデート
                    </button>
                  ) : (
                    <button
                      onClick={() => window.electron.ipcRenderer.invoke('open-external', updateInfo.url)}
                      className="bg-white text-blue-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-blue-50 transition-colors"
                    >
                      詳細
                    </button>
                  )}
                  <button
                    onClick={() => setShowUpdateToast(false)}
                    className="bg-blue-500 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-blue-400 transition-colors"
                  >
                    閉じる
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
                  className="relative w-full max-w-xl bg-[#1e293b] border border-slate-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                >
                  <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-600/20 p-2 rounded-xl text-blue-400">
                        <FileText size={20} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">アップデート内容</h3>
                        <p className="text-xs text-slate-400">Ver {updateInfo.latestVersion} の新機能と改善</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowReleaseNotes(false)}
                      className="p-2 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-[#0f172a]">
                    <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {typeof updateInfo.releaseNotes === 'string' ? (
                        <div dangerouslySetInnerHTML={{
                          __html: updateInfo.releaseNotes
                            .replace(/\n/g, '<br/>')
                            .replace(/### (.*)/g, '<h3 class="text-white font-bold text-lg mt-4 mb-2">$1</h3>')
                            .replace(/## (.*)/g, '<h2 class="text-white font-bold text-xl mt-6 mb-3">$1</h2>')
                            .replace(/- (.*)/g, '<div class="flex gap-2 my-1"><span class="text-blue-400">•</span><span>$1</span></div>')
                        }} />
                      ) : Array.isArray(updateInfo.releaseNotes) ? (
                        <div className="space-y-6">
                          {updateInfo.releaseNotes.map((note: any, i: number) => (
                            <div key={i} className="border-b border-slate-800 pb-4 last:border-0">
                              {note.version && <div className="text-blue-400 font-bold mb-2">v{note.version}</div>}
                              <div dangerouslySetInnerHTML={{ __html: note.note }} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-500 italic">リリースノートはありません。</p>
                      )}
                    </div>
                  </div>

                  <div className="p-6 bg-slate-800/30 border-t border-slate-800 flex justify-end">
                    <button
                      onClick={() => setShowReleaseNotes(false)}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold transition-all active:scale-95"
                    >
                      閉じる
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
                        {t('operations.fetchRace')}
                      </button>
                      <button
                        onClick={() => handleFetchResults(true)}
                        disabled={status === 'loading'}
                        className="glass-btn bg-purple-600/20 hover:bg-purple-600/30 border-purple-500/30 text-purple-200 hover:text-purple-100 flex items-center gap-2 shadow-[0_0_15px_rgba(147,51,234,0.1)] hover:shadow-[0_0_20px_rgba(147,51,234,0.2)]"
                      >
                        <History size={20} />
                        {t('operations.fetchOverall')}
                      </button>
                      <button
                        onClick={handleOpenOverlay}
                        className="glass-btn flex items-center gap-2"
                      >
                        <ExternalLink size={20} />
                        {t('operations.openOverlay')}
                      </button>
                    </div>
                  </header>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/30" />
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-emerald-500/10 rounded-xl group-hover:scale-110 transition-transform">
                          <CheckCircle2 className="text-emerald-500" size={24} />
                        </div>
                        <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full dot-pulse-success" />
                          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tight">Active</span>
                        </div>
                      </div>
                      <h3 className="text-slate-400 text-sm font-medium mb-1">内蔵サーバー</h3>
                      <p className="text-2xl font-bold text-white font-mono tracking-tight">Port {serverPort}</p>
                    </div>

                    <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-full h-1 bg-blue-500/30" />
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-blue-500/10 rounded-xl group-hover:scale-110 transition-transform">
                          <Monitor className="text-blue-500" size={24} />
                        </div>
                        {config?.obsIp ? (
                          <div className="flex items-center gap-1.5 bg-blue-500/10 px-2.5 py-1 rounded-full">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full dot-pulse-success" />
                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-tight">Connected</span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2.5 py-1 rounded-full uppercase tracking-tight">Disconnected</span>
                        )}
                      </div>
                      <h3 className="text-slate-400 text-sm font-medium mb-1">OBS 接続</h3>
                      <p className="text-2xl font-bold text-white font-mono tracking-tight">{config?.obsIp || '未設定'}</p>
                    </div>

                    <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-full h-1 bg-purple-500/30" />
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-purple-500/10 rounded-xl group-hover:scale-110 transition-transform">
                          <Settings className="text-purple-500" size={24} />
                        </div>
                        {config?.groqApiKey ? (
                          <div className="flex items-center gap-1.5 bg-purple-500/10 px-2.5 py-1 rounded-full">
                            <div className="w-1.5 h-1.5 bg-purple-500 rounded-full dot-pulse-success" />
                            <span className="text-[10px] font-bold text-purple-500 uppercase tracking-tight">Ready</span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2.5 py-1 rounded-full uppercase tracking-tight">Offline</span>
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
                          <BarChart3 size={20} className="text-blue-500" />
                          <BarChart3 size={20} className="text-blue-500" />
                          現在のスコア
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const sortedRatio = [...scores].sort((a, b) => b.score - a.score);
                              const text = sortedRatio.map((s, i) => `${i + 1}. ${s.name || s.team}: ${s.score}pts`).join('\n');
                              navigator.clipboard.writeText(text);
                              addLog('順位をクリップボードにコピーしました', 'success');
                              setIsCopied(true);
                              setTimeout(() => setIsCopied(false), 2000);
                            }}
                            className={cn(
                              "text-sm flex items-center gap-1 transition-all mr-2 px-2 py-1 rounded-md",
                              isCopied
                                ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                                : "text-slate-400 hover:text-white hover:bg-slate-800"
                            )}
                            title={isCopied ? "コピーしました！" : "順位をコピー"}
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
                                追加
                              </button>
                              <button
                                onClick={() => handleSaveEditedScores()}
                                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                              >
                                保存
                              </button>
                              <button
                                onClick={() => setIsEditing(false)}
                                className="text-sm text-slate-400 hover:text-slate-300 flex items-center gap-1 transition-colors"
                              >
                                キャンセル
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={handleStartEdit}
                                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                              >
                                編集
                              </button>
                              <button
                                onClick={handleResetScores}
                                className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                              >
                                <Trash2 size={14} />
                                リセット
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="p-0 px-4 pb-4">
                        <table className="w-full text-left border-separate border-spacing-y-2">
                          <thead>
                            <tr className="text-slate-400 text-xs uppercase tracking-wider">
                              <th className="px-6 py-3 font-semibold">チーム名</th>
                              <th className="px-6 py-3 font-semibold text-right">スコア</th>
                              {isEditing && <th className="px-6 py-3 font-semibold text-right">操作</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            <AnimatePresence mode="popLayout">
                              {(isEditing ? editingScores : [...scores].sort((a, b) => b.score - a.score)).length > 0 ? (isEditing ? editingScores : [...scores].sort((a, b) => b.score - a.score)).map((team, i) => (
                                <ScoreItem
                                  key={team.name || team.team || i}
                                  team={team}
                                  index={i}
                                  isEditing={isEditing}
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
                                  <td colSpan={isEditing ? 3 : 2} className="px-6 py-12 text-center text-slate-500 italic">
                                    データがありません
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
                          アクティビティログ
                        </h3>
                      </div>
                      <div className="p-6 space-y-4 flex-1 overflow-y-auto max-h-[400px] scrollbar-thin scrollbar-thumb-slate-700">
                        {logs.length > 0 ? logs.map((log, i) => (
                          <div key={i} className="flex gap-4 items-start animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className={cn(
                              "w-2 h-2 mt-2 rounded-full shrink-0",
                              log.type === 'success' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                                log.type === 'error' ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                                  "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                            )} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-300 break-words">{log.message}</p>
                              <p className="text-xs text-slate-500">{log.timestamp}</p>
                            </div>
                          </div>
                        )) : (
                          <p className="text-center text-slate-500 py-8 italic">ログはありません</p>
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
                      <h2 className="text-3xl font-bold text-white">リオープンマネージャー</h2>
                      <p className="text-slate-400 mt-1">過去のスコア状態を保存・復元できます</p>
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
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Slot {i + 1}</span>
                            {slot && (
                              <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30">
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
                                    <div className="text-[10px] text-slate-500 uppercase">チーム数</div>
                                    <div className="text-sm font-bold text-blue-400">{slot.scores.length}</div>
                                  </div>
                                  <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                                    <div className="text-sm font-bold text-emerald-400">
                                      {slot.scores.reduce((sum: number, s: any) => sum + s.score, 0)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="h-full flex flex-col items-center justify-center py-4 text-slate-600">
                                <Save size={32} className="mb-2 opacity-20" />
                                <p className="text-sm italic">空のスロット</p>
                              </div>
                            )}
                          </div>
                          <div className="p-4 bg-slate-800/30 border-t border-slate-800 flex flex-col gap-2">
                            {slot ? (
                              <>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleLoadSlot(i)}
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-blue-900/20"
                                  >
                                    ロード
                                  </button>
                                  <button
                                    onClick={() => handleAddScoresFromSlot(i)}
                                    title="現在のスコアに加算"
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-emerald-900/20"
                                  >
                                    加点
                                  </button>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleSaveSlot(i)}
                                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 rounded-lg text-sm transition-colors"
                                  >
                                    上書き
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
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-900/30 active:scale-95 flex items-center justify-center gap-2 group"
                              >
                                <Save size={18} className="group-hover:rotate-12 transition-transform" />
                                現在の状態を保存
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
                    <h2 className="text-3xl font-bold text-white mb-2">プレイヤーマッピング</h2>
                    <p className="text-slate-400">特定のプレイヤー名を常に特定のチームとして扱います（OCR誤認識対策）</p>
                  </header>

                  <div className="glass-panel rounded-2xl overflow-hidden border-none">
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        <Users size={20} className="text-blue-500" />
                        マッピング一覧
                      </h3>
                      <div className="flex gap-2">
                        {isEditingMappings ? (
                          <>
                            <button
                              onClick={handleAddMapping}
                              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                              追加
                            </button>
                            <button
                              onClick={handleSaveMappings}
                              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                              <Save size={16} />
                              保存
                            </button>
                            <button
                              onClick={() => setIsEditingMappings(false)}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                              キャンセル
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={handleStartEditMappings}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            編集
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="p-6">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-slate-500 text-sm border-b border-slate-800">
                            <th className="pb-4 font-medium">プレイヤー名</th>
                            <th className="pb-4 font-medium">チーム名</th>
                            {isEditingMappings && <th className="pb-4 font-medium w-16">操作</th>}
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
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                    placeholder="プレイヤー名"
                                  />
                                </td>
                                <td className="py-4 pr-4">
                                  <input
                                    type="text"
                                    value={mapping.team}
                                    onChange={(e) => handleMappingChange(index, 'team', e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                    placeholder="チーム名"
                                  />
                                </td>
                                <td className="py-4">
                                  <button
                                    onClick={() => handleRemoveMapping(index)}
                                    className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
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
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                      {team}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={2} className="py-12 text-center text-slate-500">
                                  マッピングが設定されていません
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
                    <h2 className="text-3xl font-bold text-white mb-2">オーバーレイ設定</h2>
                    <p className="text-slate-400">配信画面に表示するスコアボードの外観をカスタマイズします</p>
                  </header>

                  <div className="grid grid-cols-1 gap-8">
                    <div className="space-y-6">
                      <div className="glass-panel rounded-3xl p-8 border-none">
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                          <Layout className="text-blue-500" size={24} />
                          表示設定
                        </h3>
                        <form
                          onSubmit={handleSaveConfig}
                          onChange={() => setIsDirty(true)}
                          className="space-y-6"
                        >
                          <Toggle
                            name="keepScoreOnRestart"
                            defaultChecked={config?.scoreSettings?.keepScoreOnRestart ?? true}
                            label="アプリ再起動時にスコアを保持する"
                            help="無効にすると、アプリを閉じて再度開いた時にスコアがリセットされます"
                          />
                          <Toggle
                            name="showRemainingRaces"
                            defaultChecked={config?.showRemainingRaces ?? true}
                            label="残りレース数を表示"
                            help="1位のチームの横に残りレース数を表示します"
                          />

                          <div className="space-y-2 p-4 bg-[#0f172a] rounded-xl border border-slate-700">
                            <label className="text-sm font-medium text-slate-200">オーバーレイテーマ</label>
                            <select
                              name="overlayTheme"
                              defaultValue={config?.overlayTheme || 'default'}
                              onChange={(e) => {
                                setSelectedOverlayTheme(e.target.value)
                                setIsDirty(true)
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-sans"
                            >
                              <option value="default">デフォルト</option>
                              <option value="mkw">MK8DX風</option>
                            </select>
                            <p className="text-xs text-slate-500">オーバーレイの見た目を変更します。</p>
                          </div>

                          {/* デフォルトテーマ設定 */}
                          {selectedOverlayTheme === 'default' && (
                            <div className="space-y-6 pt-4 border-t border-slate-700/50">
                              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
                                <Palette size={16} className="text-blue-400" />
                                デフォルトテーマ配色設定
                              </h4>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2 p-4 bg-[#0f172a] rounded-xl border border-slate-700">
                                  <label className="text-sm font-medium text-slate-200">スコア加算エフェクト色</label>
                                  <div className="flex flex-col gap-2">
                                    <ColorPicker
                                      name="scoreEffect"
                                      initialValue={config?.overlayColors?.scoreEffect || '#22c55e'}
                                      onChange={() => setIsDirty(true)}
                                    />
                                  </div>
                                  <p className="text-[10px] text-slate-500">点数が加算された時の光の色を変更します。</p>
                                </div>

                                <div className="space-y-2 p-4 bg-[#0f172a] rounded-xl border border-slate-700">
                                  <label className="text-sm font-medium text-slate-200">自チームの強調スタイル</label>
                                  <select
                                    name="ownTeamStyle"
                                    defaultValue={config?.overlayColors?.ownTeamStyle || 'rainbow'}
                                    onChange={(e) => {
                                      setSelectedOwnTeamStyle(e.target.value)
                                      setIsDirty(true)
                                    }}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-sans"
                                  >
                                    <option value="solid">単色</option>
                                    <option value="rainbow">虹色</option>
                                    <option value="gradient">グラデーション</option>
                                  </select>
                                  <p className="text-[10px] text-slate-500">自チーム（または選択中）の枠線のスタイル。</p>
                                </div>
                              </div>

                              {/* 条件付き表示: 自チームの詳細設定 */}
                              {(selectedOwnTeamStyle === 'solid' || selectedOwnTeamStyle === 'gradient') && (
                                <motion.div
                                  initial={{ opacity: 0, y: -10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="p-4 bg-[#0f172a] rounded-xl border border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-6"
                                >
                                  <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-200">自チームの色 (単色)</label>
                                    <ColorPicker
                                      name="ownTeamColor"
                                      initialValue={config?.overlayColors?.ownTeamColor || '#fbbf24'}
                                      onChange={() => setIsDirty(true)}
                                    />
                                  </div>

                                  {selectedOwnTeamStyle === 'gradient' && (
                                    <div className="space-y-2">
                                      <label className="text-sm font-medium text-slate-200">グラデーション・バリエーション</label>
                                      <select
                                        name="ownTeamGradient"
                                        defaultValue={config?.overlayColors?.ownTeamGradient || 'blue'}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-sans"
                                      >
                                        <option value="blue">ブルー（青〜水色）</option>
                                        <option value="pink">ピンク（ピンク〜紫）</option>
                                        <option value="orange">オレンジ（オレンジ〜黄）</option>
                                        <option value="emerald">エメラルド（緑〜青碧）</option>
                                      </select>
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </div>
                          )}

                          <div className="pt-4">
                            <button
                              type="submit"
                              className="w-full bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-blue-900/20 active:scale-95"
                            >
                              設定を保存
                            </button>
                          </div>
                        </form>
                      </div>
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
                            ? "bg-blue-600 text-white shadow-lg"
                            : "text-slate-400 hover:text-white hover:bg-slate-800"
                        )}
                      >
                        {tab === 'system' && "システム (System)"}
                        {tab === 'obs' && "OBS設定"}
                        {tab === 'ai' && "AI解析 (Groq)"}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleSaveConfig} className="space-y-8">

                    {/* SYSTEM SETTINGS */}
                    {settingsTab === 'system' && (
                      <motion.section
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-[#1e293b] p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6"
                      >
                        <h3 className="text-lg font-bold flex items-center gap-2 text-purple-400">
                          <Monitor size={20} />
                          表示・パフォーマンス (Appearance)
                        </h3>

                        <div className="space-y-6">
                          {/* Background Style */}
                          <div className="space-y-3">
                            <label className="text-sm font-medium text-slate-400">背景スタイル (Background Style)</label>
                            <div className="grid grid-cols-2 gap-4">
                              <button
                                type="button"
                                onClick={() => setBgStyle('planetarium')}
                                className={cn(
                                  "p-4 rounded-xl border transition-all flex flex-col items-center gap-2",
                                  bgStyle === 'planetarium'
                                    ? "bg-blue-900/40 border-blue-500 text-blue-200"
                                    : "bg-slate-900/40 border-slate-700 text-slate-400 hover:bg-slate-800"
                                )}
                              >
                                <div className="w-full h-24 rounded-lg bg-gradient-to-br from-indigo-900 to-purple-900 overflow-hidden relative mb-2">
                                  <div className="absolute inset-0 opacity-50 flex items-center justify-center text-xs text-white/50">Planetarium Preview</div>
                                </div>
                                <span className="font-bold">プラネタリウム</span>
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
                                ライトモード (Lite Mode)
                              </div>
                              <p className="text-xs text-slate-400">
                                アニメーションを停止し、低スペックPCでの動作を軽量化します。
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setLiteMode(!liteMode)}
                              className={cn(
                                "relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2",
                                liteMode ? "bg-blue-600" : "bg-slate-700"
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
                        className="bg-[#1e293b] p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6"
                      >
                        <h3 className="text-lg font-bold flex items-center gap-2 text-blue-400">
                          <Radio size={20} />
                          OBS WebSocket 設定
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">{t('config.obsIp')}</label>
                            <input
                              name="obsWsIp"
                              type="text"
                              defaultValue={config?.obsIp || '127.0.0.1'}
                              placeholder="127.0.0.1"
                              className="w-full bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">{t('config.obsPort')}</label>
                            <input
                              name="obsWsPort"
                              type="text"
                              defaultValue={config?.obsPort || '4455'}
                              placeholder="4455"
                              className="w-full bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                            />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-slate-400">{t('config.obsPassword')}</label>
                            <input
                              name="obsWsPassword"
                              type="password"
                              defaultValue={config?.obsPassword}
                              placeholder="OBS WebSocket Password"
                              className="w-full bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                            />
                          </div>
                        </div>

                        <div className="pt-4 border-t border-slate-700/50">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                              OBSソース名 (Browser Source Name)
                              <span className="text-[10px] text-yellow-500 border border-yellow-500/30 px-1 rounded bg-yellow-500/10">重要</span>
                            </label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search size={16} className="text-slate-500" />
                              </div>
                              <input
                                name="obsSourceName"
                                list="obs-source-list"
                                type="text"
                                defaultValue={config?.obsSourceName}
                                placeholder={t('config.obsSourceNamePlaceholder')}
                                className="w-full bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3 pl-10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                              />
                              <datalist id="obs-source-list">
                                {obsInputs && obsInputs.map((input: any) => (
                                  <option key={input.inputName} value={input.inputName}>
                                    {input.inputKind}
                                  </option>
                                ))}
                              </datalist>
                            </div>
                            {!obsStatus && (
                              <p className="text-xs text-slate-500 mt-1">
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
                            ソースをリフレッシュ
                          </button>
                          <button
                            type="button"
                            onClick={autoSetupObsOverlay}
                            className="flex items-center justify-center gap-2 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white py-3 rounded-xl font-bold transition-all border border-blue-500/30 active:scale-[0.98] group"
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
                        className="bg-[#1e293b] p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6"
                      >
                        <h3 className="text-lg font-bold flex items-center gap-2 text-green-400">
                          <Zap size={20} />
                          AI 解析設定 (Groq)
                        </h3>

                        <input type="hidden" name="aiProvider" value="groq" />

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">{t('config.groqApiKey')}</label>
                            <input
                              name="groqApiKey"
                              type="password"
                              defaultValue={config?.groqApiKey}
                              placeholder={t('config.groqApiKeyPlaceholder')}
                              className="w-full bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all font-mono"
                            />
                            <p className="text-xs text-slate-500 italic">
                              ※ 現在は爆速かつ無料で利用可能な Groq (Llama 4 Scout) のみを使用します。
                            </p>
                          </div>

                          <div className="border border-slate-700 rounded-xl overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setShowGroqInstructions(!showGroqInstructions)}
                              className="w-full flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800 transition-colors text-sm font-medium text-slate-300"
                            >
                              <span>Groq APIキーを取得する方法</span>
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
                                          className="text-blue-400 hover:underline inline-flex items-center gap-1"
                                        >
                                          Groq Cloud Console <ExternalLink size={12} />
                                        </a>
                                        にアクセスします。
                                      </span>
                                    </p>
                                    <p className="flex gap-2">
                                      <span className="flex-shrink-0 w-5 h-5 bg-slate-800 rounded-full flex items-center justify-center text-xs text-white">2</span>
                                      <span className="flex-1">Googleアカウント、またはメールアドレスでサインアップ/ログインします。</span>
                                    </p>
                                    <p className="flex gap-2">
                                      <span className="flex-shrink-0 w-5 h-5 bg-slate-800 rounded-full flex items-center justify-center text-xs text-white">3</span>
                                      <span className="flex-1">「Create API Key」ボタンを押します。</span>
                                    </p>
                                    <p className="flex gap-2">
                                      <span className="flex-shrink-0 w-5 h-5 bg-slate-800 rounded-full flex items-center justify-center text-xs text-white">4</span>
                                      <span className="flex-1">適当な名前（例: MK8DX）を付けて作成し、表示されたコード（gsk-...）をコピーして上の入力欄に貼り付けます。</span>
                                    </p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </motion.section>
                    )}

                    <div className="flex justify-end pt-4 border-t border-slate-700/30">
                      <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/40 active:scale-95 flex items-center gap-2"
                      >
                        <Save size={20} />
                        {t('config.saveButton')}
                      </button>
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
                  <div className="w-24 h-24 bg-blue-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-900/40 mx-auto mb-8">
                    <Monitor className="text-white" size={48} />
                  </div>
                  <h2 className="text-4xl font-bold text-white">Grosoq</h2>
                  <p className="text-xl text-slate-400 leading-relaxed">
                    {t('app.subtitle')}
                  </p>
                  <div className="bg-[#1e293b] p-8 rounded-2xl border border-slate-800 shadow-xl text-left space-y-4">
                    <h3 className="font-bold text-lg border-b border-slate-800 pb-2 mb-4">開発者情報 (Developer)</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {/* GitHub Link */}
                      <button
                        onClick={() => window.electron.ipcRenderer.invoke('open-external', 'https://github.com/eito54/Grosoq')}
                        className="bg-[#24292e] hover:bg-[#2f363d] text-white p-4 rounded-xl border border-slate-700 hover:border-slate-500 transition-all group flex flex-col items-center gap-3 shadow-lg"
                      >
                        <div className="p-3 bg-white/10 rounded-full group-hover:scale-110 transition-transform">
                          <Github size={24} />
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-sm">GitHub</p>
                          <p className="text-[10px] text-slate-400">eito54/Grosoq</p>
                        </div>
                      </button>

                      {/* X (Twitter) Link */}
                      <button
                        onClick={() => window.electron.ipcRenderer.invoke('open-external', 'https://x.com/eiteen05')}
                        className="bg-black hover:bg-slate-900 text-white p-4 rounded-xl border border-slate-700 hover:border-slate-500 transition-all group flex flex-col items-center gap-3 shadow-lg"
                      >
                        <div className="p-3 bg-white/10 rounded-full group-hover:scale-110 transition-transform">
                          <Twitter size={24} />
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-sm">X (Twitter)</p>
                          <p className="text-[10px] text-slate-400">@eiteen05</p>
                        </div>
                      </button>
                    </div>
                  </div>
                  <p className="text-slate-500 pt-8">
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
          title="未保存の変更"
          message="編集中のデータがあります。保存せずに移動しますか？変更内容は破棄されます。"
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
          name={slotNameInput}
          setName={setSlotNameInput}
          slotId={pendingSlotId}
        />

        <ConfirmModal
          isOpen={showResetConfirmModal}
          onConfirm={executeResetScores}
          onCancel={() => setShowResetConfirmModal(false)}
          title="スコアリセット"
          message="すべてのチームのスコアとプレイヤーマッピングをリセットします。この操作は取り消せません。よろしいですか？"
          confirmText="リセットする"
        />
      </div>
      <div className="fixed inset-0 -z-50 bg-[#020617]" />
      <div className="noise-overlay" />
      <BackgroundEffect liteMode={liteMode} style={bgStyle} />
    </>
  )
}

export default App
