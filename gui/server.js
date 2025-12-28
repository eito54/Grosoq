const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');

class EmbeddedServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.port = 3001; // メインの開発サーバーと重複しないポート
    this.sseClients = new Map(); // SSEクライアントを管理（接続時刻も保存）
    this.sseCleanupInterval = null; // クリーンアップ用のタイマー
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSSECleanup();
  }

  setupMiddleware() {
    //静的ファイルの提供
    this.app.use(express.static(path.join(__dirname, 'static')));
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // CORS設定
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  setupRoutes() {
    // メインページ
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'static', 'index.html'));
    });

    // 静的ページ（オーバーレイ用）
    this.app.get('/static/', (req, res) => {
      res.sendFile(path.join(__dirname, 'static', 'index.html'));
    });

    // SSE エンドポイント（スコア更新通知用）- 改良版
    this.app.get('/api/scores/events', (req, res) => {
      try {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control'
        });

        // クライアント情報を追加（接続時刻付き）
        const clientInfo = {
          response: res,
          connectedAt: Date.now(),
          lastPing: Date.now()
        };
        this.sseClients.set(res, clientInfo);

        console.log(`SSE client connected. Total clients: ${this.sseClients.size}`);

        // 接続時に初期データを送信
        res.write('data: {"type":"connected"}\n\n');

        // 定期的なハートビート（30秒毎）
        const heartbeatInterval = setInterval(() => {
          try {
            res.write('data: {"type":"heartbeat"}\n\n');
            clientInfo.lastPing = Date.now();
          } catch (error) {
            console.error('Heartbeat error:', error);
            clearInterval(heartbeatInterval);
            this.sseClients.delete(res);
          }
        }, 30000);

        // クライアントが切断した時のクリーンアップ
        const cleanup = () => {
          clearInterval(heartbeatInterval);
          this.sseClients.delete(res);
          console.log(`SSE client disconnected. Total clients: ${this.sseClients.size}`);
        };

        req.on('close', cleanup);
        req.on('error', (error) => {
          console.error('SSE request error:', error);
          cleanup();
        });
        res.on('error', (error) => {
          console.error('SSE response error:', error);
          cleanup();
        });

      } catch (error) {
        console.error('SSE endpoint error:', error);
        res.status(500).json({ error: 'SSE接続の初期化に失敗しました' });
      }
    });

    // OBS API
    this.app.post('/api/obs', async (req, res) => {
      const OBSWebSocket = require('obs-websocket-js').default;
      let obs = null;
      
      try {
        obs = new OBSWebSocket();

        // 設定ファイルを動的に読み込み
        let config;
        try {
          const fs = require('fs');
          
          // ユーザーデータディレクトリから読み込み
          const { app } = require('electron');
          const userDataPath = app ? app.getPath('userData') : __dirname;
          const configPath = path.join(userDataPath, 'config.json');
          
          console.log('Looking for config file at:', configPath);
          
          if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(configData);
            console.log('Config loaded successfully:', JSON.stringify(config, null, 2));
          } else {
            console.log('Config file not found, using default settings');
            throw new Error('設定ファイルが見つかりません');
          }
        } catch (configError) {
          console.error('Config loading error:', configError.message);
          return res.json({
            success: false,
            error: `設定読み込みエラー: ${configError.message}`
          });
        }

        // OBS WebSocketのURL構築（ポート設定対応、IPv4強制）
        const obsPort = config.obsPort || '4455';
        // localhostの場合は明示的に127.0.0.1を使用してIPv6を回避
        const obsIp = config.obsIp === 'localhost' ? '127.0.0.1' : config.obsIp;
        const obsUrl = `ws://${obsIp}:${obsPort}`;
        console.log('Using OBS config:', {
          ip: config.obsIp,
          port: obsPort,
          hasPassword: !!(config.obsPassword && config.obsPassword.trim()),
          sourceName: config.obsSourceName
        });

        // 接続タイムアウトを設定
        const connectTimeout = setTimeout(() => {
          if (obs) {
            console.log('OBS connection timeout, attempting gentle disconnection...');
            obs.disconnect().catch(e => console.error('Error during timeout disconnect:', e));
          }
        }, 15000); // 15秒タイムアウト（より長めに設定）
        
        try {
          console.log(`Connecting to OBS at ${obsUrl}...`);
          
          if (config.obsPassword && config.obsPassword.trim() !== '') {
            console.log('Connecting to OBS with password authentication...');
            await obs.connect(obsUrl, config.obsPassword);
          } else {
            console.log('Connecting to OBS without authentication...');
            // パスワードが設定されていない場合は認証なしで接続
            await obs.connect(obsUrl);
          }
          
          clearTimeout(connectTimeout); // 接続成功したらタイムアウトをクリア
          console.log('OBS connection successful');
        } catch (connectError) {
          clearTimeout(connectTimeout); // エラー時もタイムアウトをクリア
          console.error('OBS connection failed:', connectError.message);
          console.error('Full error:', connectError);
          
          // 認証エラーの場合、異なるアプローチを試行
          if (connectError.message.includes('authentication')) {
            console.log('Authentication error detected, trying alternative methods...');
            
            // パスワードが設定されている場合でも、一度認証なしを試行
            try {
              console.log('Retrying without authentication...');
              await obs.connect(obsUrl);
              console.log('Connection successful without authentication');
            } catch (retryError) {
              console.error('Retry without auth failed:', retryError.message);
              // 空文字でのパスワード認証を試行
              try {
                console.log('Retrying with empty password...');
                await obs.connect(obsUrl, '');
                console.log('Connection successful with empty password');
              } catch (finalError) {
                console.error('Final retry failed:', finalError.message);
                throw new Error(`OBS接続に失敗しました。設定を確認してください。詳細: ${finalError.message}`);
              }
            }
          } else {
            throw connectError;
          }
        }

        const screenshot = await obs.call('GetSourceScreenshot', {
          sourceName: config.obsSourceName,
          imageFormat: 'jpg',
          imageWidth: 1920,
          imageHeight: 1080,
          imageCompressionQuality: 80
        });

        // 優しくWebSocket接続を切断
        try {
          console.log('Disconnecting from OBS WebSocket...');
          await obs.disconnect();
          console.log('OBS WebSocket disconnected successfully');
        } catch (disconnectError) {
          console.error('Error during OBS disconnect:', disconnectError);
          // 切断エラーが発生してもOBSプロセスには影響しないよう、ログのみ出力
        }

        res.json({
          success: true,
          screenshot: screenshot.imageData
        });
      } catch (error) {
        console.error('OBS API Error:', error);
        
        // エラー時も優しく切断を試行
        if (obs) {
          try {
            console.log('Attempting to disconnect OBS WebSocket after error...');
            await obs.disconnect();
            console.log('OBS WebSocket disconnected after error');
          } catch (disconnectError) {
            console.error('Error during cleanup disconnect:', disconnectError);
            // OBSプロセスに影響しないよう、エラーログのみ出力
          }
        }
        
        res.json({
          success: false,
          error: error.message
        });
      } finally {
        // 最終的なクリーンアップ（OBSプロセスに影響しないよう優しく処理）
        if (obs) {
          try {
            // WebSocketインスタンスの参照をクリア
            console.log('Cleaning up OBS WebSocket reference...');
          } catch (finalError) {
            console.error('Error during final cleanup:', finalError);
          }
          obs = null;
        }
      }
    });

    // Gemini API
    this.app.post('/api/gemini', async (req, res) => {
      try {
        const { GoogleGenerativeAI, GoogleGenerativeAIError } = require('@google/generative-ai');
        
        // 設定ファイルを動的に読み込み
        let config;
        try {
          const fs = require('fs');
          const { app } = require('electron');
          const userDataPath = app ? app.getPath('userData') : __dirname;
          const configPath = path.join(userDataPath, 'config.json');
          
          if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(configData);
          } else {
            throw new Error('設定ファイルが見つかりません');
          }
        } catch (configError) {
          return res.json({
            success: false,
            error: `設定読み込みエラー: ${configError.message}`
          });
        }
        
        if (!config.geminiApiKey || config.geminiApiKey.trim() === '') {
          return res.json({
            success: false,
            error: 'Gemini APIキーが設定されていません'
          });
        }
        
        console.log('Using Gemini API key (first 10 chars):', config.geminiApiKey.substring(0, 10) + '...');
        
        const genAI = new GoogleGenerativeAI(config.geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const { prompt, imageData } = req.body;

        // MIMEタイプを動的に検出
        function extractMimeTypeAndData(base64Data) {
          const match = base64Data.match(/^data:(.+);base64,(.+)$/);
          if (!match || match.length !== 3) {
            // フォールバック: 古い形式の場合
            return {
              data: base64Data.replace(/^data:image\/[a-z]+;base64,/, ''),
              mimeType: "image/jpeg"
            };
          }
          
          // MIMEタイプを正規化
          let mimeType = match[1];
          const mimeTypeMap = {
            'image/jpg': 'image/jpeg',
            'image/jpeg': 'image/jpeg',
            'image/png': 'image/png',
            'image/gif': 'image/gif',
            'image/webp': 'image/webp'
          };
          
          if (mimeTypeMap[mimeType]) {
            mimeType = mimeTypeMap[mimeType];
          } else {
            console.warn(`Warning: Unsupported MIME type: ${mimeType}. Using image/jpeg as fallback.`);
            mimeType = 'image/jpeg';
          }
          
          console.log(`Processing image with MIME type: ${mimeType}`);
          
          return {
            data: match[2],
            mimeType: mimeType
          };
        }

        const imageInfo = extractMimeTypeAndData(imageData);

        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: imageInfo.data,
              mimeType: imageInfo.mimeType
            }
          }
        ]);

        const response = await result.response;
        const text = response.text();

        res.json({
          success: true,
          response: text
        });
      } catch (error) {
        console.error('Gemini API Error:', error);
        
        let errorMessage = error.message;
        let statusCode = 500;
        
        // GoogleGenerativeAIErrorの詳細処理
        if (error instanceof GoogleGenerativeAIError) {
          console.error('Gemini API specific error:', error);
          
          if (error.message.includes('API key not valid') || error.message.includes('API_KEY_INVALID')) {
            errorMessage = 'APIキーが無効です。正しいGemini APIキーを設定してください。';
            statusCode = 400;
          } else if (error.message.includes('quota') || error.message.includes('RATE_LIMIT')) {
            errorMessage = 'API使用量の上限に達しました。しばらく待ってから再試行してください。';
            statusCode = 429;
          } else {
            errorMessage = `Gemini APIエラー: ${error.message}`;
          }
        }
        
        res.status(statusCode).json({
          success: false,
          error: errorMessage
        });
      }
    });

    // レース結果取得API
    this.app.post('/api/fetch-race-results', async (req, res) => {
      try {
        const { imageUrl } = req.body;
        const useTotalScore = req.query.useTotalScore === 'true';

        // 既存のプレイヤー名マッピングを取得
        const existingMappings = getAllPlayerMappings();
        console.log('Existing player mappings:', existingMappings);

        // 既存マッピングを含むプロンプトを構築
        const existingMappingsText = Object.keys(existingMappings).length > 0 ?
          `\n  ## existing_player_mappings ##
  以下のプレイヤーについては、過去に決定されたチーム名を必ず使用してください：
  ${Object.entries(existingMappings).map(([player, team]) => `  - "${player}" → "${team}"`).join('\n')}
  
  これらのプレイヤーが今回の画像に含まれている場合は、上記のチーム名を使用し、新たなチーム名判別は行わないでください。\n` : '';

        const prompt = useTotalScore ?
          `## instruction ##
  これは「マリオカート8DX」のレース結果画面の画像です。
  画像を解析して、全プレイヤーのユーザー名、チーム情報、および画面右端に表示されている総合得点を抽出してください。
  総合得点は、各プレイヤーの行の一番右に表示されている数字です。
  指定されたJSON形式で出力してください。
${existingMappingsText}
  ## extraction_rules ##
  - [name]: プレイヤーのユーザー名をそのまま抽出してください。
  - [team]: 以下の厳格なルールでチーム名を識別してください：
    
    **基本方針：同じ先頭文字のプレイヤー全員の最長連続共通先頭部分をチーム名とする**
    
    **ステップ1：同じ先頭文字のプレイヤーをグループ化**
    - 先頭文字が同じプレイヤーを全て特定する
    - アルファベットは大文字で統一（「a」と「A」は同じ「A」グループ）
    - 「AKSKDあいうえお」「AKSKDかきくけこ」は同じ「A」グループとして扱う
    
    **ステップ2：各グループ内で全プレイヤーの最長連続共通先頭部分を正確に決定**
    - 同じ先頭文字のプレイヤー全員で、1文字ずつ順番に比較して連続で一致する部分を特定
    - **重要：連続で一致する最長の部分のみをチーム名とする**
    - 例：「AKSKDあいうえお」「AKSKDかきくけこ」→ 連続共通部分「AKSKD」（5文字）
    - 例：「かんとつシトラリ」「かんとつヌヴィレット」→ 連続共通部分「かんとつ」（4文字）
    - 例：「ABC123」「ABD456」→ 連続共通部分「AB」（2文字、3文字目以降は不一致）
    - 例：「TeamAlpha01」「TeamAlpha02」→ 連続共通部分「TeamAlpha0」（10文字）
    
    **ステップ3：動的なチーム名再計算（重要）**
    - 新しいプレイヤーが追加された場合、そのグループ内の全プレイヤーで連続共通部分を再計算する
    - 例：「AKSKDあいうえお」「AKSKDかきくけこ」→「AKSKD」チーム
    - その後「AKSKさしすせそ」が追加された場合：
      - 3名全員で再計算：「AKSKD」「AKSKD」「AKSK」
      - 連続共通部分は「AKSK」（4文字）になる
      - チーム名を「AKSKD」から「AKSK」に更新する
    
    **ステップ4：チーム名を決定し、アルファベットは大文字で統一**
    - 連続共通部分が2文字以上ある場合：その連続共通部分をチーム名とする
    - 連続共通部分が1文字のみの場合：先頭1文字をチーム名とする
    - **重要**：アルファベットのチーム名は必ず大文字で統一する
    
    **具体例**：
    - 「AKSKDあいうえお」「AKSKDかきくけこ」→ 「AKSKD」チーム（連続共通部分）
    - その後「AKSKさしすせそ」追加 → 全員で再計算して「AKSK」チーム（連続共通部分）
    - 「かんとつシトラリ」「かんとつヌヴィレット」→ 「かんとつ」チーム（連続共通部分）
    - 「TeamRed01」「TeamRed02」「TeamBlue01」→ 「T」チーム（連続共通部分は1文字のみ）
    
    **例外処理**
    - 空白や特殊文字のみの場合は "UNKNOWN"
  - [total_score]: プレイヤーの総合得点を整数で抽出してください。これは通常、各プレイヤー行の最も右側に表示される数字です。
  - [isCurrentPlayer]: プレイヤーの行の背景が黄色かどうかを判別してください。
    - 黄色背景は、そのプレイヤーが操作プレイヤー（マイプレイヤー）であることを示します。
    - 黄色背景が検出された場合、true を設定してください。それ以外の場合は false を設定してください。(boolean値で返す)
    - 背景色は完全な黄色 (#FFFF00) ではない可能性があります。濃い黄色やオレンジに近い黄色も黄色背景とみなしてください。
    - 透明度や他の色との混合により、判別が難しい場合があるため、慎重に判断してください。明らかに黄色系の背景と識別できる場合にのみ true としてください。

  ## output_format ##
  以下のJSON形式で、全プレイヤーの情報を "results" 配列に含めてください。
  もし、提供された画像が「マリオカート8DX」のリザルト画面ではない、またはリザルト情報を読み取れない場合は、代わりに以下の形式のエラーJSONを出力してください:
  {
    "error": "リザルト画面ではないか、情報を読み取れませんでした。"
  }

  リザルト情報が読み取れる場合のJSON形式 (キーと値はダブルクォートで囲んでください):
  {
    "results": [
      {
        "name": "[name]",
        "team": "[team]",
        "score": [total_score],
        "isCurrentPlayer": [isCurrentPlayer]
      }
    ]
  }
  ## important_notes ##
  - 必ず指定されたJSON形式のいずれかで応答してください。
  - ユーザー名は画像に表示されている通りに正確に抽出してください。
  - プレイヤーは最大12人です。画像に表示されている全プレイヤーの情報を抽出してください。
  - 総合得点の抽出を最優先してください。
  - チーム名の判別は非常に重要です。同じチームに所属するプレイヤーが同じチーム名になるよう注意してください。` : `
  ## instruction ##
  これは「マリオカート8DX」のレース結果画面の画像です。
  画像を解析して、全プレイヤーの順位、ユーザー名、チーム情報、および合計得点を抽出し、指定されたJSON形式で出力してください。

  結果画面には通常、各プレイヤーについて左から以下の情報が含まれています（レイアウトは若干異なる場合があります）：
  1. 順位 (例: 1st, 2nd, 3rd... または単に数字)
  2. ユーザー名
  3. プレイヤーごとの合計得点 (例: 1500, 1250...)
${existingMappingsText}
  ## extraction_rules ##
  - [rank]: プレイヤーの順位を整数で抽出してください (例: 1, 2, 3, ..., 12)。
  - [name]: プレイヤーのユーザー名をそのまま抽出してください。
  - [totalScore]: プレイヤーの合計得点を整数で抽出してください (例: 1500, 1250)。
  - [team]: 以下の厳格なルールでチーム名を識別してください：
    
    **基本方針：同じ先頭文字のプレイヤー全員の最長連続共通先頭部分をチーム名とする**
    
    **ステップ1：同じ先頭文字のプレイヤーをグループ化**
    - 先頭文字が同じプレイヤーを全て特定する
    - アルファベットは大文字で統一（「a」と「A」は同じ「A」グループ）
    - 「AKSKDあいうえお」「AKSKDかきくけこ」は同じ「A」グループとして扱う
    
    **ステップ2：各グループ内で全プレイヤーの最長連続共通先頭部分を正確に決定**
    - 同じ先頭文字のプレイヤー全員で、1文字ずつ順番に比較して連続で一致する部分を特定
    - **重要：連続で一致する最長の部分のみをチーム名とする**
    - 例：「AKSKDあいうえお」「AKSKDかきくけこ」→ 連続共通部分「AKSKD」（5文字）
    - 例：「かんとつシトラリ」「かんとつヌヴィレット」→ 連続共通部分「かんとつ」（4文字）
    - 例：「ABC123」「ABD456」→ 連続共通部分「AB」（2文字、3文字目以降は不一致）
    - 例：「TeamAlpha01」「TeamAlpha02」→ 連続共通部分「TeamAlpha0」（10文字）
    
    **ステップ3：動的なチーム名再計算（重要）**
    - 新しいプレイヤーが追加された場合、そのグループ内の全プレイヤーで連続共通部分を再計算する
    - 例：「AKSKDあいうえお」「AKSKDかきくけこ」→「AKSKD」チーム
    - その後「AKSKさしすせそ」が追加された場合：
      - 3名全員で再計算：「AKSKD」「AKSKD」「AKSK」
      - 連続共通部分は「AKSK」（4文字）になる
      - チーム名を「AKSKD」から「AKSK」に更新する
    
    **ステップ4：チーム名を決定し、アルファベットは大文字で統一**
    - 連続共通部分が2文字以上ある場合：その連続共通部分をチーム名とする
    - 連続共通部分が1文字のみの場合：先頭1文字をチーム名とする
    - **重要**：アルファベットのチーム名は必ず大文字で統一する
    
    **具体例**：
    - 「AKSKDあいうえお」「AKSKDかきくけこ」→ 「AKSKD」チーム（連続共通部分）
    - その後「AKSKさしすせそ」追加 → 全員で再計算して「AKSK」チーム（連続共通部分）
    - 「かんとつシトラリ」「かんとつヌヴィレット」→ 「かんとつ」チーム（連続共通部分）
    - 「TeamRed01」「TeamRed02」「TeamBlue01」→ 「T」チーム（連続共通部分は1文字のみ）
    
    **例外処理**
    - 空白や特殊文字のみの場合は "UNKNOWN"
  - [isCurrentPlayer]: プレイヤーの行の背景が黄色かどうかを判別してください。
    - 黄色背景は、そのプレイヤーが操作プレイヤー（マイプレイヤー）であることを示します。
    - 黄色背景が検出された場合、true を設定してください。それ以外の場合は false を設定してください。(boolean値で返す)
    - 背景色は完全な黄色 (#FFFF00) ではない可能性があります。濃い黄色やオレンジに近い黄色も黄色背景とみなしてください。
    - 透明度や他の色との混合により、判別が難しい場合があるため、慎重に判断してください。明らかに黄色系の背景と識別できる場合にのみ true としてください。

  ## output_format ##
  以下のJSON形式で、全プレイヤーの情報を "results" 配列に含めてください。
  もし、提供された画像が「マリオカート8DX」のリザルト画面ではない、またはリザルト情報を読み取れない場合は、代わりに以下の形式のエラーJSONを出力してください:
  {
    "error": "リザルト画面ではないか、情報を読み取れませんでした。"
  }

  リザルト情報が読み取れる場合のJSON形式 (キーと値はダブルクォートで囲んでください):
  {
    "results": [
      {
        "rank": "[rank]",
        "name": "[name]",
        "team": "[team]",
        "totalScore": "[totalScore]",
        "isCurrentPlayer": [isCurrentPlayer] // boolean (true/false) を直接記述
      }
      // ... 他のプレイヤー情報が続く
    ]
  }
  ## important_notes ##
  - 必ず指定されたJSON形式のいずれかで応答してください。
  - ユーザー名は画像に表示されている通りに正確に抽出してください。
  - プレイヤーは最大12人です。画像に表示されている全プレイヤーの情報を抽出してください。
  - チーム名の判別は非常に重要です。同じチームに所属するプレイヤーが同じチーム名になるよう注意してください。
  
  ## チーム名判別例 ##
  例1: 以下のような結果の場合
  1. かんとつシトラリ
  2. かんとつヌヴィレット
  3. かんとつアルレッキーノ
  → 全て「かんとつ」というチーム名を使用（先頭共通部分）

  例2: 以下のような結果の場合
  5. ABCメンバー1
  6. ABCメンバー2
  7. ABCメンバー3
  12. ABCメンバー4
  → 全て「ABC」というチーム名を使用（先頭共通部分）

  例3: 以下のような結果の場合
  4. Team_Alpha_01
  8. Team_Alpha_02
  11. Team_Alpha_03
  → 全て「Team_Alpha_」というチーム名を使用（先頭共通部分）
`;

        // Gemini APIを直接呼び出し（設定からAPIキーを使用）
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        
        // 設定ファイルを読み込み
        let config;
        try {
          const fs = require('fs');
          const { app } = require('electron');
          const userDataPath = app ? app.getPath('userData') : __dirname;
          const configPath = path.join(userDataPath, 'config.json');
          
          if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(configData);
          } else {
            throw new Error('設定ファイルが見つかりません');
          }
        } catch (configError) {
          throw new Error(`設定読み込みエラー: ${configError.message}`);
        }
        
        if (!config.geminiApiKey) {
          throw new Error('Gemini APIキーが設定されていません');
        }
        
        console.log('Using Gemini API key (first 10 chars):', config.geminiApiKey.substring(0, 10) + '...');
        
        const genAI = new GoogleGenerativeAI(config.geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Base64データからGemini用のパートを作成
        function fileToGenerativePart(base64Data) {
          const match = base64Data.match(/^data:(.+);base64,(.+)$/);
          if (!match || match.length !== 3) {
            throw new Error("Invalid base64 data URL format.");
          }
          
          // MIMEタイプを正規化（Gemini APIサポート形式に変換）
          let mimeType = match[1];
          const mimeTypeMap = {
            'image/jpg': 'image/jpeg',
            'image/jpeg': 'image/jpeg',
            'image/png': 'image/png',
            'image/gif': 'image/gif',
            'image/webp': 'image/webp'
          };
          
          if (mimeTypeMap[mimeType]) {
            mimeType = mimeTypeMap[mimeType];
          } else {
            console.warn(`Warning: Unsupported MIME type: ${mimeType}. Attempting to use as-is.`);
          }
          
          console.log(`Processing image with MIME type: ${mimeType}`);
          
          return {
            inlineData: {
              data: match[2],
              mimeType: mimeType,
            },
          };
        }
        
        const imagePart = fileToGenerativePart(imageUrl);
        
        let geminiResponse;
        
        try {
          console.log('Calling Gemini API directly...');
          const result = await model.generateContent([prompt, imagePart]);
          const response = result.response;
          const text = response.text();
          
          if (!text) {
            throw new Error('Gemini APIからレスポンスが取得できませんでした');
          }
          
          console.log('Gemini API raw response:', text);
          
          // JSONレスポンスをクリーンアップ
          const cleanedText = text
            .replaceAll("\n", "")
            .replaceAll("```json", "")
            .replaceAll("```", "");
          
          geminiResponse = {
            success: true,
            response: cleanedText
          };
          
          console.log('Gemini API call successful');
        } catch (geminiError) {
          console.error('Gemini API Error:', geminiError);
          throw new Error(`Gemini APIエラー: ${geminiError.message}`);
        }

        // レスポンスをパース
        try {
          const cleanText = geminiResponse.response.replace(/```json\s*|\s*```/g, '').trim();
          console.log('Gemini API raw response (cleaned):', cleanText);
          const parsedResponse = JSON.parse(cleanText);
          
          // プレイヤー名マッピングを動的に更新
          if (parsedResponse.results && Array.isArray(parsedResponse.results)) {
            // 新しいプレイヤーの追加に基づいてマッピングを動的に更新
            const updatedMappings = updatePlayerMappingsForNewPlayers(parsedResponse.results);
            
            // 更新されたマッピングに基づいて結果のチーム名を修正
            parsedResponse.results.forEach(result => {
              if (result.name && updatedMappings[result.name]) {
                const correctTeamName = updatedMappings[result.name];
                if (result.team !== correctTeamName) {
                  console.log(`Correcting team name for "${result.name}" from "${result.team}" to "${correctTeamName}"`);
                  result.team = correctTeamName;
                }
              }
            });
          }
          
          res.json({
            success: true,
            response: parsedResponse
          });
        } catch (parseError) {
          console.error('Response parsing error:', parseError);
          console.error('Raw response:', geminiResponse.response);
          throw new Error('レスポンスのパースに失敗しました');
        }

      } catch (error) {
        console.error('Race Results API Error:', error);
        res.json({
          success: false,
          error: error.message
        });
      }
    });

    // 共通関数: スコアファイルパスを取得
    const getScoresPath = () => {
      try {
        const { app } = require('electron');
        if (app && app.getPath) {
          // Electronアプリの場合はユーザーデータディレクトリを使用
          const userDataPath = app.getPath('userData');
          return path.join(userDataPath, 'scores.json');
        }
      } catch (electronError) {
        // Electronが利用できない場合のフォールバック
      }
      // フォールバック: 開発環境用
      return path.join(__dirname, 'scores.json');
    };

    // 共通関数: プレイヤー名マッピングファイルパスを取得
    const getPlayerMappingPath = () => {
      try {
        const { app } = require('electron');
        if (app && app.getPath) {
          const userDataPath = app.getPath('userData');
          return path.join(userDataPath, 'player-mapping.json');
        }
      } catch (electronError) {
        // Electronが利用できない場合のフォールバック
      }
      return path.join(__dirname, 'player-mapping.json');
    };

    // プレイヤー名からチーム名への履歴を保存
    const savePlayerMapping = (playerName, teamName) => {
      try {
        const fs = require('fs');
        const mappingPath = getPlayerMappingPath();
        
        let mapping = {};
        if (fs.existsSync(mappingPath)) {
          mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
        }
        
        mapping[playerName] = teamName;
        
        // ディレクトリが存在しない場合は作成
        const mappingDir = path.dirname(mappingPath);
        if (!fs.existsSync(mappingDir)) {
          fs.mkdirSync(mappingDir, { recursive: true });
        }
        
        fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
        console.log(`Player mapping saved: "${playerName}" -> "${teamName}"`);
      } catch (error) {
        console.error('Error saving player mapping:', error);
      }
    };

    // プレイヤー名からチーム名への履歴を取得
    const getPlayerMapping = (playerName) => {
      try {
        const fs = require('fs');
        const mappingPath = getPlayerMappingPath();
        
        if (!fs.existsSync(mappingPath)) {
          return null;
        }
        
        const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
        return mapping[playerName] || null;
      } catch (error) {
        console.error('Error reading player mapping:', error);
        return null;
      }
    };

    // すべてのプレイヤー名マッピングを取得
    const getAllPlayerMappings = () => {
      try {
        const fs = require('fs');
        const mappingPath = getPlayerMappingPath();
        
        if (!fs.existsSync(mappingPath)) {
          return {};
        }
        
        return JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
      } catch (error) {
        console.error('Error reading all player mappings:', error);
        return {};
      }
    };

    // 連続共通先頭部分を計算する関数
    const findLongestCommonPrefix = (names) => {
      if (!names || names.length === 0) return '';
      if (names.length === 1) return names[0];
      
      let prefix = '';
      const firstName = names[0];
      
      for (let i = 0; i < firstName.length; i++) {
        const char = firstName[i];
        let allMatch = true;
        
        for (let j = 1; j < names.length; j++) {
          if (i >= names[j].length || names[j][i] !== char) {
            allMatch = false;
            break;
          }
        }
        
        if (allMatch) {
          prefix += char;
        } else {
          break;
        }
      }
      
      return prefix;
    };

    // プレイヤー名マッピングを動的に更新する関数
    const updatePlayerMappingsForNewPlayers = (newResults) => {
      try {
        const fs = require('fs');
        const mappingPath = getPlayerMappingPath();
        
        // 現在のマッピングを取得
        let currentMappings = getAllPlayerMappings();
        
        // 先頭文字でグループ化
        const playerGroups = {};
        
        // 新しい結果から全プレイヤーを取得
        newResults.forEach(result => {
          if (result.name) {
            const firstChar = result.name.charAt(0).toUpperCase();
            if (!playerGroups[firstChar]) {
              playerGroups[firstChar] = [];
            }
            playerGroups[firstChar].push(result.name);
          }
        });
        
        // 既存のマッピングからも同じ先頭文字のプレイヤーを追加
        Object.keys(currentMappings).forEach(playerName => {
          const firstChar = playerName.charAt(0).toUpperCase();
          if (playerGroups[firstChar] && !playerGroups[firstChar].includes(playerName)) {
            playerGroups[firstChar].push(playerName);
          }
        });
        
        // 各グループで連続共通部分を再計算してマッピングを更新
        let mappingsUpdated = false;
        
        Object.entries(playerGroups).forEach(([firstChar, players]) => {
          if (players.length > 1) {
            const commonPrefix = findLongestCommonPrefix(players);
            let teamName = commonPrefix.length >= 2 ? commonPrefix : firstChar;
            
            // アルファベットのチーム名は大文字に統一
            if (/^[A-Za-z]+/.test(teamName)) {
              teamName = teamName.toUpperCase();
            }
            
            // このグループの全プレイヤーのマッピングを更新
            players.forEach(playerName => {
              const currentTeamName = currentMappings[playerName];
              if (!currentTeamName || currentTeamName !== teamName) {
                console.log(`Updating player mapping: "${playerName}" from "${currentTeamName || 'none'}" to "${teamName}"`);
                currentMappings[playerName] = teamName;
                mappingsUpdated = true;
              }
            });
          }
        });
        
        // マッピングが更新された場合のみファイルに保存
        if (mappingsUpdated) {
          const mappingDir = path.dirname(mappingPath);
          if (!fs.existsSync(mappingDir)) {
            fs.mkdirSync(mappingDir, { recursive: true });
          }
          
          fs.writeFileSync(mappingPath, JSON.stringify(currentMappings, null, 2));
          console.log('Player mappings updated dynamically');
        }
        
        return currentMappings;
      } catch (error) {
        console.error('Error updating player mappings:', error);
        return getAllPlayerMappings();
      }
    };

    // スコア保存/取得API（アニメーション制御フラグ対応）
    this.app.get('/api/scores', (req, res) => {
      try {
        const fs = require('fs');
        const scoresPath = getScoresPath();
        const metaPath = path.join(path.dirname(scoresPath), 'scores-meta.json');
        
        let scores = [];
        let isOverallUpdate = false;
        let showRemainingRaces = true;
        
        if (fs.existsSync(scoresPath)) {
          scores = JSON.parse(fs.readFileSync(scoresPath, 'utf8'));
        }
        
        // メタデータから更新種別を読み取り
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            isOverallUpdate = meta.isOverallUpdate || false;
            
            // フラグを読み取った後、リセット
            if (isOverallUpdate) {
              fs.writeFileSync(metaPath, JSON.stringify({ isOverallUpdate: false }, null, 2));
            }
          } catch (metaError) {
            console.log('Meta file read error (non-critical):', metaError.message);
          }
        }
        
        // 設定から残りレース数表示設定と色設定を取得
        let scoreEffectColor = '#22c55e';
        let currentPlayerColor = '#fbbf24';
        
        try {
          const { app } = require('electron');
          const userDataPath = app ? app.getPath('userData') : __dirname;
          const configPath = path.join(userDataPath, 'config.json');
          
          if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);
            showRemainingRaces = config.showRemainingRaces !== false; // デフォルトはtrue
            scoreEffectColor = config.scoreEffectColor || '#22c55e';
            currentPlayerColor = config.currentPlayerColor || '#fbbf24';
          }
        } catch (configError) {
          console.log('Config read error (non-critical):', configError.message);
          showRemainingRaces = true; // デフォルト値
        }
        
        // 残りレース数を計算
        // 12レース完了時の総合計点数は984点（82 × 12）
        // 残りレース数 = (984 - 現在の全プレイヤーの合計点数) ÷ 82
        const totalScores = scores.reduce((sum, team) => sum + (team.score || 0), 0);
        const remainingRaces = Math.max(0, Math.floor((984 - totalScores) / 82));
        
        res.json({
          scores,
          isOverallUpdate,
          remainingRaces: showRemainingRaces ? remainingRaces : null, // 設定に応じて表示制御
          showRemainingRaces,
          scoreEffectColor,
          currentPlayerColor
        });
      } catch (error) {
        console.error('Error reading scores:', error);
        res.json({ scores: [], isOverallUpdate: false, remainingRaces: null, showRemainingRaces: true });
      }
    });

    this.app.post('/api/scores', (req, res) => {
      try {
        const fs = require('fs');
        const scoresPath = getScoresPath();
        const metaPath = path.join(path.dirname(scoresPath), 'scores-meta.json');
        const scores = req.body;
        const isOverallUpdate = req.query.isOverallUpdate === 'true';
        
        // ディレクトリが存在しない場合は作成
        const scoreDir = path.dirname(scoresPath);
        if (!fs.existsSync(scoreDir)) {
          fs.mkdirSync(scoreDir, { recursive: true });
        }
        
        // スコアデータを保存
        fs.writeFileSync(scoresPath, JSON.stringify(scores, null, 2));
        
        // メタデータを保存（合計点計測の場合）
        if (isOverallUpdate) {
          fs.writeFileSync(metaPath, JSON.stringify({ isOverallUpdate: true }, null, 2));
        }
        
        console.log('Scores saved with metadata:', { isOverallUpdate });
        
        // SSEクライアントに更新通知を送信
        this.broadcastScoreUpdate();
        
        res.json({ success: true });
      } catch (error) {
        console.error('Error saving scores:', error);
        res.json({ success: false, error: error.message });
      }
    });

    // 設定保存API
    this.app.post('/api/config', async (req, res) => {
      try {
        const fs = require('fs');
        const ConfigManager = require('./config-manager');
        const configManager = new ConfigManager();
        
        // 実行時の正確なパスを確認
        console.log('Current __dirname:', __dirname);
        console.log('Process cwd:', process.cwd());
        console.log('App path:', process.execPath);
        
        // ユーザーデータディレクトリを使用（Electronアプリの場合）
        const { app } = require('electron');
        const userDataPath = app ? app.getPath('userData') : __dirname;
        const configPath = path.join(userDataPath, 'config.json');
        
        const config = req.body;
        console.log('Setting save request received:', JSON.stringify(config, null, 2));
        console.log('Config will be saved to:', configPath);
        
        // 設定の検証（OBSパスワードは必須ではない）
        if (!config.obsIp || !config.obsPort || !config.obsSourceName || !config.geminiApiKey) {
          console.log('Validation failed - missing required fields');
          return res.json({
            success: false,
            error: 'OBS IPアドレス、ポート、ソース名、Gemini APIキーは必須です'
          });
        }
        
        // Gemini APIキーの有効性をテスト
        console.log('Testing Gemini API key...');
        const apiKeyTest = await configManager.testGeminiApiKey(config.geminiApiKey);
        if (!apiKeyTest.isValid) {
          console.log('API key validation failed:', apiKeyTest.error);
          return res.json({
            success: false,
            error: apiKeyTest.error
          });
        }
        console.log('API key validation successful');
        
        console.log('Writing config to:', configPath);
        
        // ディレクトリが存在しない場合は作成
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
          console.log('Creating config directory:', configDir);
          fs.mkdirSync(configDir, { recursive: true });
        }
        
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('Config file written successfully');
        
        // .envファイルも更新
        await configManager.updateEnvFile(config);
        
        // ファイルが実際に作成されたか確認
        if (fs.existsSync(configPath)) {
          const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          console.log('Saved config verification:', JSON.stringify(savedConfig, null, 2));
        } else {
          console.error('Config file was not created!');
        }
        
        res.json({ success: true, message: 'APIキーが有効で、設定が正常に保存されました' });
      } catch (error) {
        console.error('Config save error:', error);
        res.json({ success: false, error: error.message });
      }
    });

    // 設定取得API
    this.app.get('/api/config', (req, res) => {
      try {
        const fs = require('fs');
        
        // ユーザーデータディレクトリから読み込み
        const { app } = require('electron');
        const userDataPath = app ? app.getPath('userData') : __dirname;
        const configPath = path.join(userDataPath, 'config.json');
        
        console.log('Config retrieval from:', configPath);
        
        if (fs.existsSync(configPath)) {
          const configData = fs.readFileSync(configPath, 'utf8');
          const config = JSON.parse(configData);
          console.log('Config retrieved:', JSON.stringify(config, null, 2));
          res.json(config);
        } else {
          console.log('Config file not found, returning defaults');
          // デフォルト設定を返す
          res.json({
            obsIp: '127.0.0.1',
            obsPort: '4455',
            obsPassword: '',
            obsSourceName: '映像キャプチャデバイス',
            geminiApiKey: '',
            theme: 'light',
            showRemainingRaces: true
          });
        }
      } catch (error) {
        console.error('Config retrieval error:', error);
        res.json({
          obsIp: '127.0.0.1',
          obsPort: '4455',
          obsPassword: '',
          obsSourceName: '映像キャプチャデバイス',
          geminiApiKey: '',
          theme: 'light',
          showRemainingRaces: true
        });
      }
    });

    // OBSブラウザソース再読み込みAPI
    this.app.post('/api/obs/refresh-browser-source', async (req, res) => {
      const OBSWebSocket = require('obs-websocket-js').default;
      let obs = null;
      
      try {
        obs = new OBSWebSocket();

        // 設定ファイルを動的に読み込み
        let config;
        try {
          const fs = require('fs');
          const { app } = require('electron');
          const Store = require('electron-store');
          const store = new Store();
          
          config = {
            obsIp: store.get('obsIp', '127.0.0.1'),
            obsPort: store.get('obsPort', '4455'),
            obsPassword: store.get('obsPassword', ''),
            obsSourceName: store.get('obsSourceName', '映像キャプチャデバイス')
          };
        } catch (error) {
          console.error('Failed to load config for OBS refresh:', error);
          throw new Error('設定の読み込みに失敗しました');
        }

        // OBS WebSocketのURL構築
        const obsPort = config.obsPort || '4455';
        const obsIp = config.obsIp === 'localhost' ? '127.0.0.1' : config.obsIp;
        const obsUrl = `ws://${obsIp}:${obsPort}`;
        
        console.log('Connecting to OBS for browser source refresh...', { obsUrl });

        // OBS接続（タイムアウト付き）
        const connectTimeout = setTimeout(() => {
          if (obs) {
            obs.disconnect().catch(e => console.error('Error during timeout disconnect:', e));
          }
        }, 10000);

        try {
          if (config.obsPassword && config.obsPassword.trim() !== '') {
            await obs.connect(obsUrl, config.obsPassword);
          } else {
            await obs.connect(obsUrl);
          }
          clearTimeout(connectTimeout);
          console.log('OBS connection successful for browser source refresh');
        } catch (connectError) {
          clearTimeout(connectTimeout);
          throw new Error(`OBS接続に失敗しました: ${connectError.message}`);
        }

        // ブラウザソースの一覧を取得
        const sourcesResponse = await obs.call('GetInputList');
        const browserSources = sourcesResponse.inputs.filter(input =>
          input.inputKind === 'browser_source'
        );

        console.log(`Found ${browserSources.length} browser sources`);

        // 各ブラウザソースを再読み込み
        const refreshPromises = browserSources.map(async (source) => {
          try {
            await obs.call('PressInputPropertiesButton', {
              inputName: source.inputName,
              propertyName: 'refreshnocache'
            });
            console.log(`Refreshed browser source: ${source.inputName}`);
            return { source: source.inputName, success: true };
          } catch (error) {
            console.error(`Failed to refresh browser source ${source.inputName}:`, error);
            return { source: source.inputName, success: false, error: error.message };
          }
        });

        const results = await Promise.all(refreshPromises);

        // 接続を閉じる
        try {
          await obs.disconnect();
          console.log('OBS WebSocket disconnected after browser source refresh');
        } catch (disconnectError) {
          console.error('Error during OBS disconnect:', disconnectError);
        }

        res.json({
          success: true,
          message: `${browserSources.length}個のブラウザソースを再読み込みしました`,
          results: results
        });

      } catch (error) {
        console.error('OBS browser source refresh error:', error);

        // エラー時も優しく切断を試行
        if (obs) {
          try {
            await obs.disconnect();
          } catch (disconnectError) {
            console.error('Error during cleanup disconnect:', disconnectError);
          }
        }

        res.status(500).json({
          success: false,
          error: error.message || 'ブラウザソースの再読み込みに失敗しました'
        });
      } finally {
        obs = null;
      }
    });

    // ローカルIP取得API
    this.app.get('/api/localIp', (req, res) => {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      let localIP = 'localhost';

      for (const interfaceName of Object.keys(interfaces)) {
        for (const iface of interfaces[interfaceName]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            localIP = iface.address;
            break;
          }
        }
      }

      res.json({ ip: localIP });
    });

    // スコアリセットAPI
    this.app.post('/api/scores/reset', (req, res) => {
      try {
        const fs = require('fs');
        const scoresPath = getScoresPath();
        const playerMappingPath = getPlayerMappingPath();
        
        console.log('Resetting scores at path:', scoresPath);
        console.log('Resetting player mappings at path:', playerMappingPath);
        
        // ディレクトリが存在しない場合は作成
        const scoreDir = path.dirname(scoresPath);
        if (!fs.existsSync(scoreDir)) {
          fs.mkdirSync(scoreDir, { recursive: true });
          console.log('Created scores directory:', scoreDir);
        }
        
        // 空の配列でスコアをリセット
        fs.writeFileSync(scoresPath, JSON.stringify([], null, 2));
        console.log('Scores reset successfully at:', scoresPath);
        
        // プレイヤー名マッピングもリセット
        fs.writeFileSync(playerMappingPath, JSON.stringify({}, null, 2));
        console.log('Player mappings reset successfully at:', playerMappingPath);
        
        // メタファイルも削除（存在する場合）
        const metaPath = path.join(path.dirname(scoresPath), 'scores-meta.json');
        if (fs.existsSync(metaPath)) {
          fs.unlinkSync(metaPath);
          console.log('Meta file deleted:', metaPath);
        }
        
        // SSEクライアントにリセット通知を送信
        this.broadcastScoreUpdate();
        
        res.json({
          success: true,
          message: 'スコアとプレイヤー名マッピングがリセットされました'
        });
      } catch (error) {
        console.error('Reset error:', error);
        console.error('Error details:', error.message);
        res.status(500).json({
          success: false,
          error: `リセットに失敗しました: ${error.message}`
        });
      }
    });

    // プレイヤー名マッピング取得API
    this.app.get('/api/player-mappings', (req, res) => {
      try {
        const mappings = getAllPlayerMappings();
        res.json({
          success: true,
          mappings: mappings
        });
      } catch (error) {
        console.error('Player mappings retrieval error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // プレイヤー名マッピング手動更新API
    this.app.post('/api/player-mappings', (req, res) => {
      try {
        const { playerName, teamName } = req.body;
        
        if (!playerName || !teamName) {
          return res.status(400).json({
            success: false,
            error: 'プレイヤー名とチーム名は必須です'
          });
        }
        
        savePlayerMapping(playerName, teamName);
        
        res.json({
          success: true,
          message: `プレイヤー "${playerName}" のチーム名を "${teamName}" に更新しました`
        });
      } catch (error) {
        console.error('Player mapping update error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // リオープンスロット管理API
    
    // リオープンスロットファイルパスを取得
    const getReopenSlotsPath = () => {
      try {
        const { app } = require('electron');
        if (app && app.getPath) {
          const userDataPath = app.getPath('userData');
          return path.join(userDataPath, 'reopen-slots.json');
        }
      } catch (electronError) {
        // Electronが利用できない場合のフォールバック
      }
      return path.join(__dirname, 'reopen-slots.json');
    };

    // 全リオープンスロットを取得
    this.app.get('/api/reopen-slots', (req, res) => {
      try {
        const fs = require('fs');
        const slotsPath = getReopenSlotsPath();
        
        let slots = [];
        if (fs.existsSync(slotsPath)) {
          const slotsData = fs.readFileSync(slotsPath, 'utf8');
          slots = JSON.parse(slotsData);
        }
        
        res.json(slots);
      } catch (error) {
        console.error('Error reading reopen slots:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 特定のリオープンスロットを取得
    this.app.get('/api/reopen-slots/:slotId', (req, res) => {
      try {
        const fs = require('fs');
        const slotsPath = getReopenSlotsPath();
        const slotId = parseInt(req.params.slotId);
        
        if (isNaN(slotId) || slotId < 0 || slotId >= 10) {
          return res.status(400).json({
            success: false,
            error: '無効なスロットIDです (0-9の範囲で指定してください)'
          });
        }
        
        let slots = [];
        if (fs.existsSync(slotsPath)) {
          const slotsData = fs.readFileSync(slotsPath, 'utf8');
          slots = JSON.parse(slotsData);
        }
        
        const slot = slots.find(s => s.slotId === slotId);
        if (!slot) {
          return res.status(404).json({
            success: false,
            error: 'スロットが見つかりません'
          });
        }
        
        res.json({
          success: true,
          data: slot
        });
      } catch (error) {
        console.error('Error reading reopen slot:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // リオープンスロットにセーブ
    this.app.post('/api/reopen-slots', (req, res) => {
      try {
        const fs = require('fs');
        const slotsPath = getReopenSlotsPath();
        const saveData = req.body;
        
        // バリデーション
        if (typeof saveData.slotId !== 'number' || saveData.slotId < 0 || saveData.slotId >= 10) {
          return res.status(400).json({
            success: false,
            error: '無効なスロットIDです (0-9の範囲で指定してください)'
          });
        }
        
        if (!saveData.scores || !Array.isArray(saveData.scores)) {
          return res.status(400).json({
            success: false,
            error: 'スコアデータが無効です'
          });
        }
        
        // 既存のスロットデータを読み込み
        let slots = [];
        if (fs.existsSync(slotsPath)) {
          const slotsData = fs.readFileSync(slotsPath, 'utf8');
          slots = JSON.parse(slotsData);
        }
        
        // 既存のスロットがあれば更新、なければ追加
        const existingSlotIndex = slots.findIndex(s => s.slotId === saveData.slotId);
        if (existingSlotIndex >= 0) {
          slots[existingSlotIndex] = saveData;
        } else {
          slots.push(saveData);
        }
        
        // ディレクトリが存在しない場合は作成
        const slotsDir = path.dirname(slotsPath);
        if (!fs.existsSync(slotsDir)) {
          fs.mkdirSync(slotsDir, { recursive: true });
        }
        
        // ファイルに保存
        fs.writeFileSync(slotsPath, JSON.stringify(slots, null, 2));
        
        res.json({
          success: true,
          message: `スロット ${saveData.slotId + 1} にセーブしました`
        });
      } catch (error) {
        console.error('Error saving reopen slot:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // リオープンスロットを削除
    this.app.delete('/api/reopen-slots/:slotId', (req, res) => {
      try {
        const fs = require('fs');
        const slotsPath = getReopenSlotsPath();
        const slotId = parseInt(req.params.slotId);
        
        if (isNaN(slotId) || slotId < 0 || slotId >= 10) {
          return res.status(400).json({
            success: false,
            error: '無効なスロットIDです (0-9の範囲で指定してください)'
          });
        }
        
        let slots = [];
        if (fs.existsSync(slotsPath)) {
          const slotsData = fs.readFileSync(slotsPath, 'utf8');
          slots = JSON.parse(slotsData);
        }
        
        // 指定されたスロットを削除
        const filteredSlots = slots.filter(s => s.slotId !== slotId);
        
        if (filteredSlots.length === slots.length) {
          return res.status(404).json({
            success: false,
            error: 'スロットが見つかりません'
          });
        }
        
        // ファイルに保存
        fs.writeFileSync(slotsPath, JSON.stringify(filteredSlots, null, 2));
        
        res.json({
          success: true,
          message: `スロット ${slotId + 1} を削除しました`
        });
      } catch (error) {
        console.error('Error deleting reopen slot:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // オーバーレイ色設定管理API
    
    // 色設定ファイルパスを取得
    const getOverlayColorsPath = () => {
      try {
        const { app } = require('electron');
        if (app && app.getPath) {
          const userDataPath = app.getPath('userData');
          return path.join(userDataPath, 'overlay-colors.json');
        }
      } catch (electronError) {
        // Electronが利用できない場合のフォールバック
      }
      return path.join(__dirname, 'overlay-colors.json');
    };

    // 色設定を取得
    this.app.get('/api/overlay-colors', (req, res) => {
      try {
        const fs = require('fs');
        const colorsPath = getOverlayColorsPath();
        
        let colors = {
          scoreEffectColor: '#22c55e',
          currentPlayerColor: '#fbbf24'
        };
        
        if (fs.existsSync(colorsPath)) {
          const colorsData = fs.readFileSync(colorsPath, 'utf8');
          colors = { ...colors, ...JSON.parse(colorsData) };
        }
        
        res.json(colors);
      } catch (error) {
        console.error('Error reading overlay colors:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 色設定を保存
    this.app.post('/api/overlay-colors', (req, res) => {
      try {
        const fs = require('fs');
        const colorsPath = getOverlayColorsPath();
        const { scoreEffectColor, currentPlayerColor } = req.body;
        
        // バリデーション
        if (!scoreEffectColor || !currentPlayerColor) {
          return res.status(400).json({
            success: false,
            error: '色設定が無効です'
          });
        }
        
        const colors = {
          scoreEffectColor,
          currentPlayerColor,
          updatedAt: new Date().toISOString()
        };
        
        // ディレクトリが存在しない場合は作成
        const colorsDir = path.dirname(colorsPath);
        if (!fs.existsSync(colorsDir)) {
          fs.mkdirSync(colorsDir, { recursive: true });
        }
        
        // ファイルに保存
        fs.writeFileSync(colorsPath, JSON.stringify(colors, null, 2));
        
        res.json({
          success: true,
          message: '色設定を保存しました'
        });
      } catch (error) {
        console.error('Error saving overlay colors:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  makeHttpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      };
      
      const req = httpModule.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, '127.0.0.1', () => {
        console.log(`Embedded server running on http://127.0.0.1:${this.port}`);
        resolve(this.port);
      });
      
      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          this.port += 1;
          this.start().then(resolve).catch(reject);
        } else {
          reject(error);
        }
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        console.log('Stopping embedded server...');
        
        // SSEクリーンアップタイマーを停止
        if (this.sseCleanupInterval) {
          clearInterval(this.sseCleanupInterval);
          this.sseCleanupInterval = null;
        }
        
        // 全てのSSE接続を閉じる
        console.log(`Closing ${this.sseClients.size} SSE connections...`);
        this.sseClients.forEach((clientInfo, res) => {
          try {
            res.write('data: {"type":"server-shutdown"}\n\n');
            res.end();
          } catch (error) {
            console.error('Error closing SSE client:', error);
          }
        });
        this.sseClients.clear();
        
        // タイムアウトを設定（強制終了用）
        const forceCloseTimeout = setTimeout(() => {
          console.log('Force closing server due to timeout...');
          if (this.server) {
            // 強制的にサーバーを破棄
            this.server.destroy?.();
            this.server = null;
          }
          resolve();
        }, 5000); // 5秒タイムアウト
        
        // 全ての接続を強制終了
        if (this.server.closeAllConnections) {
          try {
            this.server.closeAllConnections();
            console.log('All server connections closed');
          } catch (connectionError) {
            console.error('Error closing connections:', connectionError);
          }
        }
        
        // サーバーを正常に停止
        this.server.close((error) => {
          clearTimeout(forceCloseTimeout);
          if (error) {
            console.error('Error during server close:', error);
          } else {
            console.log('Embedded server stopped successfully');
          }
          this.server = null;
          resolve();
        });
        
        // リスニング状態を確認
        if (!this.server.listening) {
          clearTimeout(forceCloseTimeout);
          this.server = null;
          console.log('Server was not listening, cleanup completed');
          resolve();
        }
      } else {
        console.log('Server was not running, nothing to stop');
        resolve();
      }
    });
  }

  broadcastScoreUpdate() {
    const message = JSON.stringify({ type: 'scores-updated', timestamp: Date.now() });
    const deadClients = [];
    
    console.log(`Broadcasting score update to ${this.sseClients.size} clients`);
    
    this.sseClients.forEach((clientInfo, res) => {
      try {
        res.write(`data: ${message}\n\n`);
        clientInfo.lastPing = Date.now();
      } catch (error) {
        console.error('Error sending SSE message:', error);
        deadClients.push(res);
      }
    });
    
    // 送信に失敗したクライアントを削除
    deadClients.forEach(res => {
      this.sseClients.delete(res);
    });
    
    if (deadClients.length > 0) {
      console.log(`Removed ${deadClients.length} dead SSE clients`);
    }
  }

  setupSSECleanup() {
    // 5分毎に古い接続をクリーンアップ
    this.sseCleanupInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 10 * 60 * 1000; // 10分でタイムアウト
      const deadClients = [];
      
      this.sseClients.forEach((clientInfo, res) => {
        if (now - clientInfo.lastPing > timeout) {
          console.log('SSE client timed out, removing...');
          deadClients.push(res);
        }
      });
      
      deadClients.forEach(res => {
        try {
          res.end();
        } catch (error) {
          console.error('Error closing timed out SSE client:', error);
        }
        this.sseClients.delete(res);
      });
      
      if (deadClients.length > 0) {
        console.log(`Cleaned up ${deadClients.length} timed out SSE clients`);
      }
      
      console.log(`Active SSE clients: ${this.sseClients.size}`);
    }, 5 * 60 * 1000); // 5分毎
  }

  getPort() {
    return this.port;
  }
}

module.exports = EmbeddedServer;