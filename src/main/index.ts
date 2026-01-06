import { app, shell, BrowserWindow, ipcMain, globalShortcut } from 'electron'
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
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
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

  // 常に開発者ツールを開けるように設定（デバッグ中のみ）
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow) {
      focusedWindow.webContents.toggleDevTools()
    }
  })

  // Load config
  await configManager.loadConfig()

  // Start server
  try {
    await embeddedServer.start(serverPort)
    console.log(`[Main] Embedded server started on port ${serverPort}`)
  } catch (error) {
    console.error(`[Main] Failed to start embedded server:`, error)
  }

  // Register IPC handlers
  registerIpcHandlers(
    configManager,
    embeddedServer,
    () => mainWindow,
    () => serverPort
  )

  createWindow()

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
