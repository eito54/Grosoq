import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

/**
 * レンダラから呼び出し可能なIPCチャンネルのホワイトリスト。
 * ここに無いチャンネルはpreloadでブロックされるため、
 * レンダラ(XSS等で侵害された場合)から任意IPCを実行できない。
 */
const INVOKE_CHANNELS = new Set([
  'get-config',
  'save-config',
  'get-server-port',
  'open-external',
  'show-message',
  'get-app-version',
  'check-whats-new',
  'mark-whats-new-seen',
  'fetch-race-results',
  'obs-connect',
  'obs-disconnect',
  'obs-get-status',
  'obs-status-detail',
  'obs-get-inputs',
  'obs-get-screenshot',
  'obs-detect-settings',
  'obs-find-best-source',
  'obs-auto-setup',
  'refresh-obs-browser-sources',
  'check-for-updates',
  'start-download-update',
  'quit-and-install',
  'groq-list-models'
])

/** レンダラが購読できるメイン→レンダライベントのホワイトリスト */
const LISTEN_CHANNELS = new Set([
  'trigger-fetch-race-results',
  'trigger-fetch-overall-scores',
  'obs-status-change',
  'obs-status-detail',
  'update-available',
  'update-download-progress',
  'update-downloaded',
  'update-error'
])

// removeListenerで元の関数からラップ関数を引けるように保持
const wrappedListeners = new Map<(...args: any[]) => void, (event: IpcRendererEvent, ...args: any[]) => void>()

const electronApi = {
  ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      if (!INVOKE_CHANNELS.has(channel)) {
        return Promise.reject(new Error(`Blocked IPC channel: ${channel}`))
      }
      return ipcRenderer.invoke(channel, ...args)
    },
    on(channel: string, listener: (...args: any[]) => void): () => void {
      if (!LISTEN_CHANNELS.has(channel)) {
        console.warn(`Blocked IPC listener channel: ${channel}`)
        return () => { }
      }
      const wrapped = (_event: IpcRendererEvent, ...args: any[]) => listener(_event as unknown, ...args)
      wrappedListeners.set(listener, wrapped)
      ipcRenderer.on(channel, wrapped)
      return () => {
        ipcRenderer.removeListener(channel, wrapped)
        wrappedListeners.delete(listener)
      }
    },
    once(channel: string, listener: (...args: any[]) => void): void {
      if (!LISTEN_CHANNELS.has(channel)) {
        console.warn(`Blocked IPC listener channel: ${channel}`)
        return
      }
      const wrapped = (_event: IpcRendererEvent, ...args: any[]) => {
        ipcRenderer.removeListener(channel, wrapped)
        wrappedListeners.delete(listener)
        listener(_event as unknown, ...args)
      }
      wrappedListeners.set(listener, wrapped)
      ipcRenderer.once(channel, wrapped)
    },
    removeListener(channel: string, listener: (...args: any[]) => void): void {
      const wrapped = wrappedListeners.get(listener)
      if (wrapped) {
        ipcRenderer.removeListener(channel, wrapped)
        wrappedListeners.delete(listener)
      }
    }
  }
}

contextBridge.exposeInMainWorld('electron', electronApi)
