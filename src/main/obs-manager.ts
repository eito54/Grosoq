import { OBSWebSocket } from 'obs-websocket-js';
import { Config } from './config-manager';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

export class ObsManager extends EventEmitter {
  private static instance: ObsManager;
  private obs: OBSWebSocket;
  private isConnected: boolean = false;
  private config: Config | null = null;

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

  private setupEventListeners() {
    this.obs.on('ConnectionOpened', () => {
      console.log('OBS Connection Opened');
    });

    this.obs.on('ConnectionClosed', () => {
      console.log('OBS Connection Closed');
      this.isConnected = false;
      this.emit('status-change', false);
    });

    this.obs.on('Identified', () => {
      console.log('OBS Identified');
      this.isConnected = true;
      this.emit('status-change', true);
    });
  }

  public async connect(config: Config): Promise<void> {
    this.config = config;
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
    await this.obs.disconnect();
    this.isConnected = false;
    this.emit('status-change', false);
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
      imageWidth: 1920,
      imageHeight: 1080,
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
