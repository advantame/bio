# FFmpeg.wasm MP4 Video Generation

このディレクトリには、ヒートマップ動画をMP4フォーマットで生成するためのFFmpeg.wasm統合が含まれています。

## 📋 実装の選択肢

### 🌐 Option 1: CDN経由（デフォルト、推奨）

**ファイル:** `ffmpeg-video.js`

- ✅ インストール不要、すぐに使用可能
- ✅ 追加の設定不要
- ⚠️ 初回ロードに約10秒（25MB）
- ⚠️ CDNに依存（オンライン環境必須）

**現在の設定:**
```javascript
// @ffmpeg/ffmpeg: 0.11.6 (via CDN)
// @ffmpeg/core: 0.11.0 (via unpkg)
corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
mainName: 'main'
```

**使用方法:**
```javascript
import { generateMP4WithFFmpeg } from './ffmpeg-video.js';
```

---

### 💾 Option 2: ローカルファイル（CDNが失敗する場合）

**ファイル:** `ffmpeg-video-local.js`

- ✅ CDNに依存しない
- ✅ オフライン環境でも動作
- ⚠️ 初回セットアップが必要

**セットアップ手順:**

```bash
cd web/heatmap
npm install
# これにより自動的に ffmpeg-core/ ディレクトリが作成されます
```

**使用方法:**

1. `heatmap.js`の12行目を変更:
```javascript
// 変更前
import { generateMP4WithFFmpeg } from './ffmpeg-video.js';

// 変更後
import { generateMP4WithFFmpeg } from './ffmpeg-video-local.js';
```

2. ブラウザをリロード

---

## 🔧 トラブルシューティング

### エラー: `Cannot call unknown function proxy_main`

**原因:** FFmpegコアの読み込みに失敗

**解決策:**

1. **ブラウザのコンソールを確認**
   - Chrome DevTools (F12) → Console タブ
   - エラーの詳細を確認

2. **CDN URLを変更**

   `ffmpeg-video.js` 69行目を以下のいずれかに変更:

   ```javascript
   // Option A: unpkg (現在のデフォルト)
   corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',

   // Option B: jsDelivr
   corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',

   // Option C: シングルスレッド専用版
   corePath: 'https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js',
   ```

3. **ローカルファイル版を使用**

   上記「Option 2」を参照

### エラー: `Failed to load FFmpeg.wasm script`

**原因:** ネットワークエラーまたはCDN障害

**解決策:**
- インターネット接続を確認
- ファイアウォール/プロキシ設定を確認
- ローカルファイル版を使用（Option 2）

### エラー: `createFFmpeg not found`

**原因:** FFmpeg.wasmのメインスクリプトが読み込まれていない

**解決策:**
1. ブラウザのキャッシュをクリア
2. ページを再読み込み（Ctrl+Shift+R / Cmd+Shift+R）

---

## 📊 メモリ使用量

| フレーム数 | 解像度 | 予想メモリ使用量 |
|----------|-------|---------------|
| 10       | 900×900 | ~100 MB      |
| 50       | 900×900 | ~200 MB      |
| 150      | 900×900 | ~400 MB      |

**注意:**
- IndexedDBストリーミングを使用しているため、フレーム数が多くてもメモリ使用量は抑えられます
- ブラウザの制限: 通常2GB程度（環境による）

---

## 🧪 テスト手順

### 小規模テスト（10フレーム）

1. ヒートマップページを開く: http://localhost:8000/web/heatmap/
2. 「第3軸（動画）」をON
3. 設定:
   - T軸分割数: `10`
   - 動画の長さ: `5` 秒
   - 動画フォーマット: `MP4 (FFmpeg)`
4. 「🚀 ヒートマップを生成」をクリック
5. コンソールで進捗を確認

### 本番テスト（150フレーム）

1. T軸分割数: `150`
2. 動画の長さ: `5` 秒（30 FPS）
3. 他の設定はデフォルト
4. 生成時間: 約5-10分（環境による）

---

## 📖 仕様

### 動画品質設定

`ffmpeg-video.js` 219-229行目:

```javascript
await ffmpeg.run(
  '-framerate', fps.toString(),        // 入力フレームレート
  '-i', 'frame%04d.png',               // 入力ファイルパターン
  '-c:v', 'libx264',                   // H.264コーデック
  '-pix_fmt', 'yuv420p',               // ピクセルフォーマット
  '-crf', '18',                        // 品質 (18=高品質)
  '-preset', 'medium',                 // エンコード速度
  '-movflags', 'faststart',            // Web最適化
  '-r', fps.toString(),                // 出力フレームレート
  'output.mp4'
);
```

**品質調整:**
- `crf`: 18（高品質） → 23（標準） → 28（低品質）
- `preset`: ultrafast → fast → **medium** → slow → veryslow

---

## 🔗 関連ファイル

- `ffmpeg-video.js` - CDN版実装（デフォルト）
- `ffmpeg-video-local.js` - ローカル版実装（代替）
- `heatmap.js` - メイン統合コード（line 12, 712-716）
- `index.html` - UIフォーマット選択（line 143-152）
- `frame-storage.js` - IndexedDBストリーミング

---

## 📝 更新履歴

- **2025-10-11**: 初期実装
  - CDN版: unpkg + @ffmpeg/core@0.11.0 + mainName対応
  - ローカル版: npm経由インストールサポート
  - 詳細ログ・エラーハンドリング追加

---

## 🆘 サポート

問題が解決しない場合:

1. ブラウザのコンソールログを確認
2. FFmpeg.wasmのログを確認（`[FFmpeg ...]`で始まる行）
3. `ffmpeg-video.js`の87-95行目のエラー詳細を確認
4. GitHubでissueを報告（ログを添付）
