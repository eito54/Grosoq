import { ipcMain, shell, dialog, app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { ConfigManager } from './config-manager'
import { EmbeddedServer } from './server'
import { ApiManager } from './api-manager'
import { makeHttpRequest, compareVersions } from './utils'
import { ObsManager } from './obs-manager'

export function registerIpcHandlers(
  configManager: ConfigManager,
  embeddedServer: EmbeddedServer,
  getMainWindow: () => BrowserWindow | null,
  getServerPort: () => number
): void {
  const apiManager = new ApiManager(configManager)
  const obsManager = ObsManager.getInstance()

  // Notify renderer about OBS status changes
  obsManager.on('status-change', (isConnected) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('obs-status-change', isConnected)
    }
  })

  // Configure auto-updater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // 署名なしアプリでのアップデートを許可
  // @ts-ignore
  autoUpdater.forceDevUpdateConfig = true

  // アップデート速度向上のための設定
  autoUpdater.logger = console
  // キャッシュを有効化し、差分更新（Differential Update）を支援
  autoUpdater.allowDowngrade = false

  autoUpdater.on('update-available', (info) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info)
    }
  })

  autoUpdater.on('download-progress', (progressObj) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', progressObj)
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      // リリースノートをコンフィグに一時保存（次回起動時に表示するため）
      const config = configManager.getConfig()
      config.lastReleaseNotes = Array.isArray(info.releaseNotes)
        ? info.releaseNotes.map(n => typeof n === 'string' ? n : n.note).join('\n')
        : (typeof info.releaseNotes === 'string' ? info.releaseNotes : '')

      configManager.saveConfig(config)
      mainWindow.webContents.send('update-downloaded', info)
    }
  })

  autoUpdater.on('error', (err) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      console.error('AutoUpdater Error Detailed Log:', err)
      let errorMessage = '不明なエラー'

      if (err instanceof Error) {
        errorMessage = `${err.name}: ${err.message}`
      } else if (typeof err === 'object' && err !== null) {
        try {
          // すべてのプロパティを抽出
          errorMessage = JSON.stringify(err, Object.getOwnPropertyNames(err))
        } catch (e) {
          errorMessage = `Object Error(stringify failed): ${String(err)}`
        }
      } else {
        errorMessage = String(err)
      }

      console.log('Main process sending update-error:', errorMessage)
      mainWindow.webContents.send('update-error', errorMessage)
    }
  })

  ipcMain.handle('get-config', async () => {
    return await configManager.loadConfig()
  })

  ipcMain.handle('save-config', async (_event, config) => {
    try {
      await configManager.saveConfig(config)
      embeddedServer.broadcastScoreUpdate('config-updated')
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('get-server-port', () => {
    return getServerPort()
  })

  ipcMain.handle('open-external', async (_event, url) => {
    await shell.openExternal(url)
    return { success: true }
  })

  ipcMain.handle('show-message', (_event, type, title, message) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type,
        title,
        message
      })
    }
  })

  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('check-whats-new', async () => {
    const config = configManager.getConfig()
    const currentVersion = app.getVersion()

    // バージョンが上がっていたら、WHAT'S NEWを表示対象とする
    if (config.lastSeenVersion && config.lastSeenVersion !== currentVersion) {
      let notes = config.lastReleaseNotes

      // リリースノートが空の場合、GitHub APIから取得を試みる
      if (!notes) {
        console.log(`Release notes missing for v${currentVersion}, fetching from GitHub...`)

        // タグ名の候補（vあり / vなし / そのまま）
        const tagCandidates = [`v${currentVersion}`, currentVersion]

        for (const tag of tagCandidates) {
          try {
            console.log(`Trying to fetch release notes for tag: ${tag}`)
            const release = await makeHttpRequest(`https://api.github.com/repos/eito54/Grosoq/releases/tags/${tag}`, {
              headers: { 'User-Agent': 'Grosoq' }
            })

            if (release && release.body) {
              notes = release.body
              console.log(`Successfully fetched notes for tag: ${tag}`)
              // 次回のために保存
              config.lastReleaseNotes = notes
              await configManager.saveConfig(config)
              break // 取得できたら終了
            }
          } catch (error) {
            console.error(`Failed to fetch release notes for tag ${tag}:`, error)
          }
        }
      }

      return {
        show: true,
        version: currentVersion,
        notes: notes
      }
    }

    // 初回起動時やバージョンが変わっていない時は表示しない
    // ただし、lastSeenVersionを保存しておく
    if (!config.lastSeenVersion) {
      config.lastSeenVersion = currentVersion
      await configManager.saveConfig(config)
    }

    return { show: false }
  })

  ipcMain.handle('mark-whats-new-seen', async () => {
    const config = configManager.getConfig()
    config.lastSeenVersion = app.getVersion()
    // リリースノートをクリア（表示済みのため）
    config.lastReleaseNotes = ''
    await configManager.saveConfig(config)
    return { success: true }
  })

  ipcMain.handle('fetch-race-results', async (_event, useTotalScore = false) => {
    try {
      const imageData = await apiManager.getObsScreenshot()
      const result = await apiManager.analyzeRace(imageData, useTotalScore)
      return result
    } catch (error: any) {
      console.error('Fetch Race Results Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('obs-connect', async (_, testConfig?: any) => {
    try {
      // マージして、足りない項目は現在の設定またはデフォルトで補完する
      // 空文字や 0 の場合はデフォルトを優先するようにガードを入れる
      let baseConfig = configManager.getConfig()
      let merged = { ...baseConfig, ...testConfig }
      
      if (!merged.obsIp || merged.obsIp.trim() === '') merged.obsIp = baseConfig.obsIp || '127.0.0.1'
      if (!merged.obsPort) merged.obsPort = baseConfig.obsPort || 4455

      await obsManager.connect(merged)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('obs-disconnect', async () => {
    try {
      await obsManager.disconnect()
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('obs-get-status', () => {
    return obsManager.getStatus()
  })

  ipcMain.handle('obs-get-inputs', async () => {
    try {
      const inputs = await obsManager.getInputList()
      return { success: true, inputs }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('obs-detect-settings', async () => {
    try {
      const result = await obsManager.detectLocalSettings()
      return { success: true, settings: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('obs-find-best-source', async () => {
    try {
      const sourceName = await obsManager.findBestCaptureSource()
      return { success: true, sourceName }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('obs-auto-setup', async () => {
    try {
      await obsManager.autoSetupOverlay(getServerPort())
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('refresh-obs-browser-sources', async () => {
    try {
      if (!obsManager.getStatus()) {
        const config = configManager.getConfig()
        await obsManager.connect(config)
      }

      const inputs = await obsManager.getInputList()
      const browserSources = inputs.filter(i => i.inputKind === 'browser_source')
      const port = getServerPort().toString()

      for (const source of browserSources) {
        const inputName = source.inputName as string
        const settings = await obsManager.call('GetInputSettings', { inputName })
        const url = settings.inputSettings.url as string
        if (url && (url.includes('localhost') || url.includes('127.0.0.1')) && url.includes(port)) {
          await obsManager.call('PressInputPropertiesButton', {
            inputName,
            propertyName: 'refreshnocache'
          })
        }
      }
      return { success: true, message: 'OBSブラウザソースを再読み込みしました' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('check-for-updates', async () => {
    const currentVersion = app.getVersion()
    console.log('Main process check-for-updates: currentVersion =', currentVersion)

    try {
      if (app.isPackaged) {
        console.log('App is packaged, attempting autoUpdater.checkForUpdates()')
        try {
          const result = await autoUpdater.checkForUpdates()
          const latestVersion = result?.updateInfo.version || currentVersion
          const releaseNotes = result?.updateInfo.releaseNotes

          console.log('Latest version from autoUpdater:', latestVersion)
          const hasUpdate = compareVersions(latestVersion, currentVersion) > 0

          return {
            hasUpdate: hasUpdate,
            latestVersion: latestVersion,
            currentVersion: currentVersion,
            releaseNotes: releaseNotes,
            isAutoUpdater: true
          }
        } catch (updaterError: any) {
          console.warn('autoUpdater failed, falling back to GitHub API check:', updaterError.message)
          // autoUpdater が失敗した（latest.yml がない等）場合のフォールバック
          const latestRelease = await makeHttpRequest('https://api.github.com/repos/eito54/grosoq/releases/latest', {
            headers: { 'User-Agent': 'Grosoq' }
          })

          if (!latestRelease || !latestRelease.tag_name) {
            console.error('Fallback check also failed to get latest release info')
            throw updaterError // もともとのエラーを投げる
          }

          const latestVersion = latestRelease.tag_name.replace('v', '')
          console.log('Latest version found via fallback API:', latestVersion)

          return {
            hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
            latestVersion,
            currentVersion,
            releaseNotes: latestRelease.body,
            url: latestRelease.html_url,
            isAutoUpdater: false
          }
        }
      } else {
        console.log('App is NOT packaged, using GitHub API mock')
        const latestRelease = await makeHttpRequest('https://api.github.com/repos/eito54/grosoq/releases/latest', {
          headers: { 'User-Agent': 'Grosoq' }
        })

        if (!latestRelease || !latestRelease.tag_name) {
          console.error('Failed to fetch latest release from GitHub')
          throw new Error('最新リリースの取得に失敗しました')
        }

        const latestVersion = latestRelease.tag_name.replace('v', '')
        console.log('Latest version from GitHub mock:', latestVersion)
        const hasUpdate = compareVersions(latestVersion, currentVersion) > 0

        return {
          hasUpdate: hasUpdate,
          latestVersion,
          currentVersion,
          releaseNotes: latestRelease.body,
          url: latestRelease.html_url,
          isAutoUpdater: false
        }
      }
    } catch (error: any) {
      console.error('Update check error details:', error)
      let errorMessage = '不明なエラー'
      if (typeof error === 'string') errorMessage = error
      else if (error && error.message) errorMessage = error.message
      else {
        try {
          errorMessage = JSON.stringify(error)
        } catch (e) {
          errorMessage = 'オブジェクト形式のエラー'
        }
      }
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('start-download-update', async () => {
    try {
      if (app.isPackaged) {
        console.log('Main: Starting downloadUpdate()')
        await autoUpdater.downloadUpdate()
        return { success: true }
      }
      return { success: false, error: '開発モードではダウンロードできません' }
    } catch (error: any) {
      console.error('Download start error:', error)
      return { success: false, error: error.message || 'ダウンロードの開始に失敗しました' }
    }
  })

  ipcMain.handle('quit-and-install', () => {
    if (app.isPackaged) {
      autoUpdater.quitAndInstall()
    }
  })
}
