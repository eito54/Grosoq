import { app, shell, dialog, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../assets/logo.jpeg?asset'
import { ConfigManager } from './config-manager'
import { EmbeddedServer } from './server'
import { registerIpcHandlers } from './ipc-handlers'

const configManager = new ConfigManager()
const embeddedServer = new EmbeddedServer(configManager)
let mainWindow: BrowserWindow | null = null
let serverPort = 3001

const MAX_PORT_ATTEMPTS = 10

/** ポートが使用中なら +1 ずつ最大10ポート試す。成功したポートは serverPort に反映される */
async function startServerWithFallback(startPort: number): Promise<void> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const port = startPort + attempt
    try {
      await embeddedServer.start(port)
      serverPort = port
      return
    } catch (error: any) {
      lastError = error
      if (typeof error?.message === 'string' && error.message.includes('already in use')) {
        console.warn(`[Main] Port ${port} in use, trying next...`)
        continue
      }
      throw error
    }
  }
  throw lastError ?? new Error('No available port')
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    title: 'Grosoq',
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // http/httpsのみ許可（file:// やカスタムプロトコル経由の任意実行を防ぐ）。
    // IPC側の 'open-external' ハンドラと同じガード。
    if (/^https?:\/\//i.test(details.url)) {
      shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.gemisoku.gui')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 開発時のみ開発者ツールを開けるように設定
  if (is.dev) {
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      const focusedWindow = BrowserWindow.getFocusedWindow()
      if (focusedWindow) {
        focusedWindow.webContents.toggleDevTools()
      }
    })
  }

  // Load config
  await configManager.loadConfig()

  // Start server (ポートが使用中の場合は代替ポートを探す)
  let serverStarted = false
  try {
    await startServerWithFallback(serverPort)
    serverStarted = true
    console.log(`[Main] Embedded server started on port ${serverPort}`)
  } catch (error) {
    console.error(`[Main] Failed to start embedded server:`, error)
    // 起動失敗を握り潰さない: serverPort=0 にして OBS 自動セットアップ等が
    // 存在しないサーバーを参照しないようにし、ユーザーに明示的に通知する
    serverPort = 0
  }

  // Register IPC handlers
  registerIpcHandlers(
    configManager,
    embeddedServer,
    () => mainWindow,
    () => serverPort
  )

  createWindow()

  if (!serverStarted) {
    dialog.showErrorBox(
      'Grosoq - サーバー起動失敗',
      '内蔵サーバーの起動に失敗しました。オーバーレイやスコア保存は利用できません。\nポート 3001-3010 を使用しているアプリケーションを確認して再起動してください。'
    )
  }

  // Register global shortcuts
  globalShortcut.register('F1', () => {
    if (mainWindow) {
      mainWindow.webContents.send('trigger-fetch-race-results')
    }
  })
  globalShortcut.register('F2', () => {
    if (mainWindow) {
      mainWindow.webContents.send('trigger-fetch-overall-scores')
    }
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  embeddedServer.stop()
})
