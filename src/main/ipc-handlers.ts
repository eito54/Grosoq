import { ipcMain, shell, dialog, app, BrowserWindow } from 'electron'
import { ConfigManager } from './config-manager'
import { EmbeddedServer } from './server'
import { ApiManager } from './api-manager'
import { makeHttpRequest, compareVersions } from './utils'
import https from 'https'
import { OBSWebSocket } from 'obs-websocket-js'

export function registerIpcHandlers(
  configManager: ConfigManager,
  embeddedServer: EmbeddedServer,
  getMainWindow: () => BrowserWindow | null,
  getServerPort: () => number
): void {
  const apiManager = new ApiManager(configManager)

  ipcMain.handle('get-config', async () => {
    return await configManager.loadConfig()
  })

  ipcMain.handle('save-config', async (_event, config) => {
    try {
      await configManager.saveConfig(config)
      embeddedServer.broadcastScoreUpdate()
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

  ipcMain.handle('get-gemini-models', async () => {
    return await apiManager.getModels()
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

  ipcMain.handle('refresh-obs-browser-sources', async () => {
    try {
      const config = configManager.getConfig()
      const obs = new OBSWebSocket()
      const obsPort = config.obsPort || 4455
      const obsIp = config.obsIp === 'localhost' ? '127.0.0.1' : config.obsIp
      const obsUrl = `ws://${obsIp}:${obsPort}`

      if (config.obsPassword && config.obsPassword.trim() !== '') {
        await obs.connect(obsUrl, config.obsPassword)
      } else {
        await obs.connect(obsUrl)
      }

      const sources = await obs.call('GetInputList', { inputKind: 'browser_source' })
      for (const source of sources.inputs) {
        const settings = await obs.call('GetInputSettings', { inputName: source.inputName as string })
        const url = settings.inputSettings.url as string
        if (url && (url.includes('localhost') || url.includes('127.0.0.1')) && url.includes(getServerPort().toString())) {
          await obs.call('PressInputPropertiesButton', {
            inputName: source.inputName as string,
            propertyName: 'refreshnocache'
          })
        }
      }
      await obs.disconnect()
      return { success: true, message: 'OBSブラウザソースを再読み込みしました' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('check-for-updates', async () => {
    try {
      const currentVersion = app.getVersion()
      const latestRelease = await makeHttpRequest('https://api.github.com/repos/eito54/Gemisoku-GUI/releases/latest', {
        headers: { 'User-Agent': 'Gemisoku-GUI' }
      })
      
      const latestVersion = latestRelease.tag_name.replace('v', '')
      const hasUpdate = compareVersions(latestVersion, currentVersion) > 0
      
      return {
        hasUpdate,
        latestVersion,
        currentVersion,
        url: latestRelease.html_url
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
