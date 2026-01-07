# Grosoq アーキテクチャ移行ガイド

## 概要

このガイドでは、既存のGrosoqから新しいアーキテクチャへの移行手順を説明します。

## 主な変更点

### ファイル構造の変更
```
旧構造:
gui/
├── main.js (1000+ lines)
├── config-manager.js
├── server.js
├── renderer.js
├── index.html
└── edit-window.html

新構造:
gui/
├── src/
│   ├── main.js (簡潔化)
│   ├── managers/
│   ├── config/
│   ├── server/
│   ├── ui/
│   └── utils/
├── views/
└── static/
```

### 設定ファイルの変更
- 設定ファイルが `userData/config/app-config.json` に移動
- より詳細な設定項目の追加
- バリデーション機能の強化

### 依存関係の変更
- より明確なモジュール分離
- IPC通信の最適化
- セキュリティの向上

## 移行手順

### 1. バックアップの作成

移行前に、重要なデータをバックアップしてください：

```bash
# 設定ファイル
cp config.json config.json.backup

# スコアファイル
cp scores.json scores.json.backup

# プレイヤーマッピング
cp player-mappings.json player-mappings.json.backup

# 環境設定
cp .env .env.backup
```

### 2. 新バージョンのインストール

1. 新しいバージョンをダウンロード
2. 古いバージョンをアンインストール（オプション）
3. 新しいバージョンをインストール

### 3. 自動移行

新しいバージョンを初回起動時に、自動移行が実行されます：

- 既存の設定ファイルを新形式に変換
- データファイルの形式を更新
- 新しいディレクトリ構造に移行

### 4. 手動での設定確認

自動移行後、以下の設定を確認してください：

#### 基本設定
- Groq API Key
- OBS WebSocket設定
- サーバーポート設定
- 言語設定

#### 詳細設定（新機能）
- ログレベル設定
- テーマ設定
- 自動更新設定
- UI設定

## トラブルシューティング

### 1. 移行が失敗した場合

```bash
# 手動での設定復旧
1. アプリケーションを停止
2. バックアップファイルから設定を復元
3. 設定を手動で新形式に変換
```

### 2. 設定が認識されない場合

```javascript
// 設定ファイルの形式確認
{
  "geminiApiKey": "your-api-key",
  "obsWebSocketUrl": "ws://localhost:4455",
  "obsPassword": "",
  "serverPort": 3001,
  "language": "ja",
  "theme": "light"
}
```

### 3. パフォーマンスの問題

- ログレベルを `info` に設定
- 古いログファイルを削除
- 設定ファイルの破損チェック

## 新機能の活用

### 1. 改善されたログ機能
- リアルタイムログ監視
- エラーの詳細追跡
- パフォーマンス分析

### 2. 多言語対応の強化
- 新しい翻訳システム
- 動的言語切り替え
- カスタム翻訳サポート

### 3. テーマシステム
- ダークモード対応
- カスタムテーマ作成
- システム設定連動

## 開発者向け情報

### カスタマイズする場合の注意点

1. **新しいAPIの使用**
```javascript
// 設定取得
const config = await electronAPI.config.get();

// ウィンドウ操作
await electronAPI.window.openEditWindow();

// API呼び出し
const result = await electronAPI.api.fetchRaceResults(false);
```

2. **イベントリスナー**
```javascript
// アップデート通知
electronAPI.update.onUpdateAvailable((info) => {
  console.log('Update available:', info);
});

// 言語変更通知
document.addEventListener('languageChanged', (event) => {
  console.log('Language changed:', event.detail.language);
});
```

3. **テーマ対応**
```css
/* CSS変数を使用 */
.my-component {
  background-color: var(--bg-color);
  color: var(--text-color);
}
```

## 既知の問題と解決策

### 1. Windows での権限問題
- 管理者権限での実行が必要な場合があります
- ユーザーデータフォルダの権限を確認

### 2. macOS での署名問題
- 初回起動時にセキュリティ設定の変更が必要な場合があります

### 3. Linux での依存関係
- 一部のディストリビューションで追加パッケージが必要な場合があります

## サポート

問題が発生した場合は、以下の情報とともにIssueを作成してください：

1. OS とバージョン
2. アプリケーションバージョン
3. エラーメッセージ
4. ログファイルの内容
5. 再現手順

## 移行後の確認チェックリスト

- [ ] アプリケーションが正常に起動する
- [ ] 設定が正しく移行されている
- [ ] OBS接続が正常に動作する
- [ ] Groq API接続が正常に動作する
- [ ] レース結果取得が正常に動作する
- [ ] スコア編集機能が正常に動作する
- [ ] 言語切り替えが正常に動作する
- [ ] テーマ切り替えが正常に動作する
- [ ] 自動更新機能が正常に動作する

移行が完了したら、このチェックリストを確認して、すべての機能が正常に動作することを確認してください。