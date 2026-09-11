import { OBSWebSocket } from 'obs-websocket-js';
import { Config } from './config-manager';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

/**
 * スクリーンショットの正規化サイズ。
 * OBS GetSourceScreenshot の imageWidth/imageHeight により、ソース解像度
 * （Switch 2 の WQHD/4K 出力を含む）に関係なく常にこのサイズにスケールされる。
 * ビジョンモデルは内部でダウンスケールするため、これ以上大きくしても精度は向上しない。
 */
export const CAPTURE_WIDTH = 1920
export const CAPTURE_HEIGHT = 1080

export class ObsManager extends EventEmitter {
  private static instance: ObsManager;
  private obs: OBSWebSocket;
  private isConnected: boolean = false;
  private connecting: Promise<void> | null = null;
  private config: Config | null = null;

  // 自動再接続・品質計測用の状態
  private lastConfig: Config | null = null;
  private intentionalDisconnect = false;
  private pingTimer: NodeJS.Timeout | null = null;
  // 再接続ループの世代管理（旧ループが新しい接続と競合しないようにする）
  private reconnectGeneration = 0;
  private statusDetail: { connected: boolean; reconnecting: boolean; attempt: number; latencyMs: number | null } =
    { connected: false, reconnecting: false, attempt: 0, latencyMs: null };

  private constructor() {
    super();
    this.obs = new OBSWebSocket();
    this.setupEventListeners();
  }

  public static getInstance(): ObsManager {
    if (!ObsManager.instance) {
      ObsManager.instance = new ObsManager();
    }
    return ObsManager.instance;
  }

  private updateStatusDetail(patch: Partial<typeof this.statusDetail>) {
    this.statusDetail = { ...this.statusDetail, ...patch };
    this.emit('detail-change', this.getDetailedStatus());
  }

  public getDetailedStatus() {
    return { ...this.statusDetail };
  }

  /** 接続品質計測（RTT）: 10秒間隔で GetStats を呼び、往復時間を ms 記録 */
  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(async () => {
      try {
        const t0 = Date.now();
        await this.obs.call('GetStats');
        this.updateStatusDetail({ latencyMs: Date.now() - t0 });
      } catch {
        // 計測失敗は無視（切断検知は ConnectionClosed イベントに任せる）
      }
    }, 10000);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * 意図しない切断時に指数バックオフで自動再接続する。
   * backoff: 2s → 4s → 8s → 16s → 30s(上限)。Identified が来たら世代を進めて停止。
   */
  private async autoReconnect(gen: number) {
    for (let attempt = 1; gen === this.reconnectGeneration; attempt++) {
      const delaySec = Math.min(30, 2 ** Math.min(attempt - 1, 5) * 2);
      console.log(`OBS auto-reconnect attempt ${attempt} in ${delaySec}s`);
      await new Promise((r) => setTimeout(r, delaySec * 1000));
      if (gen !== this.reconnectGeneration || !this.lastConfig) return;
      try {
        await this.connect(this.lastConfig);
        return; // 成功時は Identified ハンドラが状態を更新する
      } catch {
        // 失敗したら次のattemptへ
      }
    }
  }

  private setupEventListeners() {
    this.obs.on('ConnectionOpened', () => {
      console.log('OBS Connection Opened');
    });

    this.obs.on('ConnectionClosed', () => {
      console.log('OBS Connection Closed');
      this.isConnected = false;
      this.stopPing();
      this.emit('status-change', false);
      const gen = ++this.reconnectGeneration;
      if (!this.intentionalDisconnect && this.lastConfig) {
        // 手動切断でない場合のみ自動再接続を開始
        void this.autoReconnect(gen);
      } else {
        this.intentionalDisconnect = false;
      }
      this.updateStatusDetail({ connected: false, latencyMs: null });
    });

    this.obs.on('Identified', () => {
      console.log('OBS Identified');
      this.isConnected = true;
      // 再接続ループが走っていれば止める
      this.reconnectGeneration++;
      this.emit('status-change', true);
      this.updateStatusDetail({ connected: true, reconnecting: false, attempt: 0 });
      this.startPing();
    });
  }

  public async connect(config: Config): Promise<void> {
    // 多重接続ガード: OBS自動接続(api-manager)と手動接続(IPC)が同時に走ると
    // 同一 OBSWebSocket インスタンスで connect が競合して状態が壊れる
    if (this.connecting) return this.connecting;
    this.connecting = this.doConnect(config).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async doConnect(config: Config): Promise<void> {
    this.config = config;
    // 自動再接続は「最後に成功した設定」に対して行うため保存しておく
    if (config.obsIp && config.obsPort) this.lastConfig = config;
    try {
      if (this.isConnected) {
        await this.obs.disconnect();
      }
      await this.obs.connect(`ws://${config.obsIp}:${config.obsPort}`, config.obsPassword);
    } catch (error) {
      this.isConnected = false;
      this.emit('status-change', false);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    // 手動切断: 自動再接続を抑止するフラグを立ててから切る
    this.intentionalDisconnect = true;
    try {
      await this.obs.disconnect();
    } finally {
      this.isConnected = false;
      this.stopPing();
      this.emit('status-change', false);
      this.updateStatusDetail({ connected: false, reconnecting: false, attempt: 0, latencyMs: null });
    }
  }

  public getStatus(): boolean {
    return this.isConnected;
  }

  public async detectLocalSettings(): Promise<any> {
    const isWindows = process.platform === 'win32';
    if (!isWindows) return null;

    try {
      const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library/Application Support') : '');
      const configPath = path.join(appData, 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json');

      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        const data = JSON.parse(content);
        return {
          port: data.server_port || 4455,
          password: data.server_password || '',
          enabled: data.server_enabled ?? false
        };
      }
    } catch (error) {
      console.error('Failed to detect OBS settings:', error);
    }
    return null;
  }

  public async getScreenshot(sourceName: string): Promise<string> {
    if (!this.isConnected) {
      throw new Error('OBS not connected');
    }
    const response = await this.obs.call('GetSourceScreenshot', {
      sourceName,
      imageFormat: 'jpg',
      imageWidth: CAPTURE_WIDTH,
      imageHeight: CAPTURE_HEIGHT,
    });
    return response.imageData;
  }

  public async getInputList(): Promise<any[]> {
    if (!this.isConnected) {
      throw new Error('OBS not connected');
    }
    const response = await this.obs.call('GetInputList');
    return response.inputs;
  }

  public async call(method: string, data?: any): Promise<any> {
    if (!this.isConnected) {
      throw new Error('OBS not connected');
    }
    return await this.obs.call(method as any, data);
  }

  public async autoSetupOverlay(port: number): Promise<void> {
    if (!this.isConnected) {
      throw new Error('OBS not connected');
    }

    const sourceName = 'Grosoq Overlay';
    const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
    
    // Check if it already exists
    const { inputs } = await this.obs.call('GetInputList');
    const existing = inputs.find(i => i.inputName === sourceName);

    const inputSettings = {
      url: `http://localhost:${port}/overlay/index.html`,
      width: 800,
      height: 600,
      css: '',
      is_local_file: false,
      restart_when_active: true
    };

    if (existing) {
      await this.obs.call('SetInputSettings', {
        inputName: sourceName,
        inputSettings
      });
    } else {
      await this.obs.call('CreateInput', {
        sceneName: currentProgramSceneName,
        inputName: sourceName,
        inputKind: 'browser_source',
        inputSettings
      });
    }
  }

  public async findBestCaptureSource(): Promise<string | null> {
    if (!this.isConnected) return null;
    const { inputs } = await this.obs.call('GetInputList');
    
    // Priorities: 1. Video Capture Device (HDMI), 2. Game Capture, 3. Window Capture
    const priorities = ['dshow_input', 'game_capture', 'window_capture', 'monitor_capture'];
    
    for (const kind of priorities) {
      const found = inputs.find(i => i.inputKind === kind);
      if (found) return found.inputName as string;
    }
    
    return null;
  }
}
