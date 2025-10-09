# PP振動系シミュレーション実装計画書
**作成日**: 2025-10-10
**対象**: 末端アミノ酸修飾の影響評価（三分解理論の可視化）

---

## 1. 目的と背景

### 1.1 科学的背景
DNA濃度振動系における末端アミノ酸修飾（G → G-amine → G-lysine）が周期延長を引き起こすメカニズムを、三分解理論（r_assoc, r_poly, r_nick）を用いて定量的に解析する。

### 1.2 理論的枠組み
被食者増殖項のパラメータ変化を3つの倍率で表現：
- **r_assoc**: 会合倍率（G:N結合の強さ）
- **r_poly**: ターンオーバー倍率（合成反応速度）
- **r_nick**: 飽和倍率（ニッキング過程の飽和定数）

パラメータ変換則：
```
k1' = k1 × (r_assoc × r_poly / r_nick)
b'  = b  × (r_assoc / r_nick)
```

無次元パラメータへの伝播：
```
g'    = g    × (r_assoc × r_poly / r_nick)
β'    = β    × (1 / r_poly)
```

### 1.3 実装目標
1. **ヒートマップアニメーション**: (r_poly, r_assoc)空間での周期分布、r_nickでアニメーション
2. **(g, β)等高線図**: 無次元空間での周期の等高線とシナリオ矢印

---

## 2. 成果物の仕様

### 2.1 ヒートマップアニメーション
**ファイル名**: `heatmap_rpoly_rassoc_rnick.mp4` (または個別フレーム画像)

**パラメータ範囲**:
- 横軸 (r_poly): 0.6 → 1.0 (ステップ: 0.05, 計9点)
- 縦軸 (r_assoc): 0.8 → 1.5 (ステップ: 0.1, 計8点)
- フレーム (r_nick): [0.8, 1.0, 1.2] (計3フレーム)

**メトリック**: 周期 (period) [分]

**カラーマップ**: Turbo (既存実装)

**総計算数**: 9 × 8 × 3 = 216 シミュレーション

**各シミュレーション条件**:
- 基準パラメータ: SI S5 PP1 optimized値を使用
  ```
  pol = 3.7 nM
  rec = 32.5 nM
  G = 150 nM
  k1 = 0.0020 (基準値)
  k2 = 0.0031
  kN = 0.0210
  kP = 0.0047
  b = 0.000048 (基準値)
  KmP = 34 nM
  N0 = 10 nM
  P0 = 10 nM
  ```
- 時間範囲: t_end = 3000分, dt = 0.5分
- 周期評価: 後半60%のデータを使用（transient除去）

**出力形式**:
- 各フレーム: 1200×900 PNG画像
- 最終成果物: MP4動画（フレームレート: 1 fps）
- 付属データ: 各(r_poly, r_assoc, r_nick)での周期値をCSV保存

### 2.2 (g, β)等高線図
**ファイル名**: `contour_g_beta_period.png`

**パラメータ範囲**:
- 横軸 (g): 1.0 → 4.0 (ステップ: 0.1, 計31点)
- 縦軸 (β): 0.3 → 1.5 (ステップ: 0.05, 計25点)

**メトリック**: 周期 (period) [分]

**総計算数**: 31 × 25 = 775 シミュレーション

**等高線レベル**: 30, 45, 60, 75, 90, 120, 150, 180分（自動調整可）

**シナリオ矢印**（オプション）:
仮想的な基準点から複数の修飾ケースへの移動を矢印で表示：
- 基準点: (g₀, β₀) = (2.5, 0.8)（例示値、要調整）
- シナリオ1（軽度修飾）: (r_assoc, r_poly) = (1.1, 0.9) → (g', β') = (2.75, 0.89)
- シナリオ2（中度修飾）: (r_assoc, r_poly) = (1.2, 0.8) → (g', β') = (3.0, 1.0)
- シナリオ3（強度修飾）: (r_assoc, r_poly) = (1.3, 0.7) → (g', β') = (3.71, 1.14)

**注**: 具体的な点はプロットせず、方向性を示すためのみ使用

**出力形式**:
- 1600×1200 PNG画像
- 等高線データをCSV保存

---

## 3. 実装詳細

### 3.1 既存コードの拡張

#### 3.1.1 heatmap.js への r_poly, r_nick 追加

**現状**: `assoc_r` (r_assoc) のみ実装済み（行44-57）

**追加箇所**: `applyAxisValue()` 関数

```javascript
function applyAxisValue(params, name, value){
  // 既存: assoc_ddg, assoc_r
  if (name === 'assoc_ddg') { /* ... */ }
  if (name === 'assoc_r') { /* ... */ }

  // 【新規追加】
  if (name === 'poly_r') {
    const rPoly = Math.max(value, 0.01);
    params.k1 *= rPoly;
    // b は不変
    return { rPoly };
  }

  if (name === 'nick_r') {
    const rNick = Math.max(value, 0.01);
    params.k1 /= rNick;
    params.b /= rNick;
    return { rNick };
  }

  params[name] = value;
  return {};
}
```

#### 3.1.2 軸ラベル追加

**追加箇所**: `axisLabel()` 関数（行60-69）

```javascript
function axisLabel(name){
  switch (name) {
    case 'assoc_ddg': return 'ΔΔG_assoc [kcal/mol]';
    case 'assoc_r': return 'r_assoc';
    case 'poly_r': return 'r_poly';        // 【新規】
    case 'nick_r': return 'r_nick';        // 【新規】
    case 'k1': return 'k1';
    case 'N0': return 'N0 [nM]';
    case 'P0': return 'P0 [nM]';
    default: return name;
  }
}
```

#### 3.1.3 HTML UIへのパラメータ選択肢追加

**ファイル**: `web/heatmap/index.html`

X軸・Y軸のセレクトボックスに追加：
```html
<option value="poly_r">r_poly (ターンオーバー倍率)</option>
<option value="nick_r">r_nick (飽和倍率)</option>
```

### 3.2 (g, β)等高線図の新規実装

#### 3.2.1 新規ファイル: `web/contour/contour.js`

**機能**:
1. (g, β)のグリッドを生成
2. 各点で以下を計算：
   - 逆算: (g, β) → (k1, b)
     ```
     k1 = g × k2 × KmP / G
     b = β × k1 / (k2 × KmP²)
     ```
   - シミュレーション実行
   - 周期を評価
3. 等高線データを生成（conrec.jsまたはd3-contour使用）
4. Canvas描画（または SVG出力）

**依存ライブラリ**:
- 既存: core.js (WASM シミュレータ)
- 新規: contouring library（候補: d3-contour, conrec.js）

**実装骨子**:
```javascript
import { initWasm, runSimulationAndEvaluate } from "../core.js";
import { contours } from "d3-contour"; // 要インストール

async function generateContourData(gMin, gMax, gSteps, betaMin, betaMax, betaSteps) {
  const grid = [];
  const baseParams = {
    pol: 3.7, rec: 32.5, G: 150,
    k2: 0.0031, kN: 0.0210, kP: 0.0047,
    KmP: 34, N0: 10, P0: 10,
    t_end_min: 3000, dt_min: 0.5
  };

  for (let j = 0; j < betaSteps; j++) {
    const beta = betaMin + (betaMax - betaMin) * (j / (betaSteps - 1));
    for (let i = 0; i < gSteps; i++) {
      const g = gMin + (gMax - gMin) * (i / (gSteps - 1));

      // (g, β) → (k1, b) 逆算
      const k1 = (g * baseParams.k2 * baseParams.KmP) / baseParams.G;
      const b = (beta * k1) / (baseParams.k2 * baseParams.KmP * baseParams.KmP);

      const params = { ...baseParams, k1, b };
      const period = runSimulationAndEvaluate(params, 'period', 60);
      grid.push({ g, beta, period });
    }
  }

  return grid;
}

function drawContours(grid, gSteps, betaSteps, levels) {
  const values = new Array(gSteps * betaSteps);
  grid.forEach((pt, i) => { values[i] = pt.period; });

  const contourGenerator = contours()
    .size([gSteps, betaSteps])
    .thresholds(levels);

  const contourData = contourGenerator(values);

  // Canvas/SVG描画ロジック
  // ...
}
```

#### 3.2.2 シナリオ矢印の描画

**データ構造**:
```javascript
const scenarios = [
  { label: 'Scenario 1', r_assoc: 1.1, r_poly: 0.9, color: '#60a5fa' },
  { label: 'Scenario 2', r_assoc: 1.2, r_poly: 0.8, color: '#3b82f6' },
  { label: 'Scenario 3', r_assoc: 1.3, r_poly: 0.7, color: '#1e40af' }
];

const basePoint = { g: 2.5, beta: 0.8 };

scenarios.forEach(s => {
  const g_new = basePoint.g * s.r_assoc * s.r_poly; // r_nick=1仮定
  const beta_new = basePoint.beta / s.r_poly;

  drawArrow(basePoint.g, basePoint.beta, g_new, beta_new, s.color, s.label);
});
```

### 3.3 アニメーション生成

#### 3.3.1 個別フレーム生成
既存のheatmap.jsを3回実行（r_nick = 0.8, 1.0, 1.2）し、各フレームをPNG保存。

**方法1**: ブラウザのスクリーンショット機能
- Puppeteer/Playwright でヘッドレスChrome制御
- 各r_nick値でページロード → 計算実行 → スクリーンショット

**方法2**: Canvas.toDataURL()でPNG出力
```javascript
const dataURL = cv.toDataURL('image/png');
// サーバーサイドNode.jsで保存、またはダウンロードリンク生成
```

#### 3.3.2 MP4変換
FFmpegを使用：
```bash
ffmpeg -framerate 1 -i frame_%03d.png -c:v libx264 -pix_fmt yuv420p heatmap_animation.mp4
```

---

## 4. データ構造とファイル構成

### 4.1 ディレクトリ構造（シミュレータリポジトリ想定）

```
simulator-repo/
├── web/
│   ├── core.js                    # WASM シミュレータ (既存)
│   ├── heatmap/
│   │   ├── heatmap.js             # 【拡張】r_poly, r_nick 追加
│   │   ├── heatmap-worker.js      # (既存)
│   │   └── index.html             # 【拡張】UI追加
│   ├── contour/                   # 【新規】
│   │   ├── contour.js
│   │   ├── contour.html
│   │   └── d3-contour.min.js      # (ライブラリ)
│   └── ...
├── scripts/
│   ├── generate_heatmap_frames.js # 【新規】自動化スクリプト
│   └── generate_contour.js        # 【新規】
├── output/
│   ├── heatmap_frames/
│   │   ├── frame_rnick080.png
│   │   ├── frame_rnick100.png
│   │   └── frame_rnick120.png
│   ├── heatmap_animation.mp4
│   ├── contour_g_beta.png
│   └── data/
│       ├── heatmap_data.csv       # 生データ
│       └── contour_data.csv
└── README.md
```

### 4.2 CSVデータフォーマット

#### heatmap_data.csv
```csv
r_poly,r_assoc,r_nick,period_min
0.60,0.80,0.8,125.3
0.60,0.80,1.0,118.7
0.60,0.80,1.2,112.4
0.60,0.90,0.8,115.2
...
```

#### contour_data.csv
```csv
g,beta,period_min
1.0,0.30,45.2
1.1,0.30,47.8
...
```

---

## 5. 技術的要件

### 5.1 計算リソース

#### ヒートマップアニメーション
- 総シミュレーション数: 216
- 1シミュレーション時間: 約2秒（WASM最適化済み）
- **総計算時間: 約7分**（4コア並列時）

#### (g, β)等高線図
- 総シミュレーション数: 775
- **総計算時間: 約26分**（4コア並列時）

### 5.2 依存関係

#### JavaScript/Node.js
- d3-contour: `npm install d3-contour`
- Puppeteer (自動化用): `npm install puppeteer`

#### FFmpeg
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

### 5.3 ブラウザ互換性
- Chrome/Edge: 推奨（Web Worker並列化に対応）
- Firefox/Safari: 動作確認必要

---

## 6. 実装手順（優先順位順）

### Phase 1: ヒートマップ拡張（優先度: 高）✅ 完了
1. ✅ heatmap.js に r_poly, r_nick を追加
2. ✅ index.html のUI更新
3. ✅ 動作確認（手動で1フレーム生成）
4. ⬜ 3フレーム（r_nick = 0.8, 1.0, 1.2）を生成
5. ⬜ FFmpegでMP4化

**実装状況**: コア機能完了。フレーム生成とMP4化は手動実行が必要。

### Phase 2: 等高線図実装（優先度: 中）✅ 完了
1. ✅ contour/ ディレクトリ作成
2. ✅ (g, β)グリッド生成ロジック実装
3. ✅ マーチングスクエア法による等高線計算（d3-contour不使用、純粋Canvas実装）
4. ✅ Canvas描画（等高線 + 軸ラベル + ヒートマップ背景）
5. ✅ シナリオ矢印追加（オプション）
6. ✅ PNG/CSV出力

**実装状況**: 完全実装完了。`/web/contour/`でアクセス可能。

### Phase 3: 自動化スクリプト（優先度: 低）
1. ⬜ Puppeteerでヘッドレス実行
2. ⬜ 複数パラメータセットの一括処理
3. ⬜ データCSV自動生成

**推定工数**: 2-3時間

---

## 7. 検証とテスト

### 7.1 単体テスト
- [ ] r_poly = 0.8 で k1 が 0.8倍になることを確認
- [ ] r_nick = 1.2 で k1, b が両方 1/1.2倍になることを確認
- [ ] (g, β)逆算が正しいことを確認（g=2.5, β=0.8 → k1, b → g, β で一致）

### 7.2 結果の妥当性チェック
- [ ] r_poly < 1 で周期が延びる
- [ ] r_assoc > 1 で振動領域が広がる
- [ ] (g, β)空間で右上に行くほど周期が延びる
- [ ] 等高線が滑らかに描画される（アーティファクトなし）

### 7.3 パフォーマンス
- [ ] 並列化が正しく動作（全コア使用）
- [ ] メモリリークなし
- [ ] 計算時間が予測範囲内

---

## 8. 成果物の利用（Wiki統合）

### 8.1 Wikiページへの埋め込み

#### simulation.html への追加セクション
```html
<section class="content-section" aria-labelledby="results-heading">
  <h3 id="results-heading" class="section-title">シミュレーション結果</h3>

  <div class="section-text">
    <h4 class="subsection-title">パラメータ空間の網羅的探索</h4>
    <p>図1は、ターンオーバー倍率$r_{\mathrm{poly}}$と会合倍率$r_{\mathrm{assoc}}$を系統的に変化させたときの周期分布を示す。各フレームは飽和倍率$r_{\mathrm{nick}}$の異なる値に対応する。</p>

    <video controls style="width: 100%; max-width: 900px; border-radius: 16px;">
      <source src="./assets/heatmap_animation.mp4" type="video/mp4">
    </video>
    <p class="caption">図1. $(r_{\mathrm{poly}}, r_{\mathrm{assoc}})$空間における周期のヒートマップ（アニメーション: $r_{\mathrm{nick}}$ = 0.8, 1.0, 1.2）</p>

    <h4 class="subsection-title">無次元空間での理論予測</h4>
    <p>図2は、無次元パラメータ$(g, \beta)$空間における周期の等高線を示す。末端修飾によって$r_{\mathrm{assoc}} > 1$および$r_{\mathrm{poly}} < 1$が生じると、系は右上方向（周期延長の領域）へ移動することが予測される。</p>

    <img src="./assets/contour_g_beta.png" alt="(g, β)等高線図" style="width: 100%; max-width: 900px; border-radius: 16px;">
    <p class="caption">図2. $(g, \beta)$空間における周期の等高線。複数のシナリオ矢印は仮想的な修飾の効果を示す（定量的マッピングには速度定数のフィッティングが必要）。</p>
  </div>
</section>
```

### 8.2 Discussion への記述例

> 三分解理論に基づくシミュレーションにより、$(r_{\mathrm{poly}}, r_{\mathrm{assoc}})$空間での周期分布を網羅的に探索した（図1）。ターンオーバー倍率$r_{\mathrm{poly}}$の減少は周期を系統的に延長し、会合倍率$r_{\mathrm{assoc}}$の増加は振動が持続する領域を拡大することが示された。この結果は、式(4)に基づく無次元パラメータ$(g, \beta)$空間での理論予測（図2）と整合する。
>
> 実験で観測されたG→G-lysineでの周期延長は、ターンオーバー低下（$r_{\mathrm{poly}} < 1$）と会合強化（$r_{\mathrm{assoc}} > 1$）の複合効果として定性的に理解できる。今後、速度定数の実験的決定またはフィッティングを行うことで、実験データを$(g, \beta)$空間に定量的にマッピングし、各倍率の寄与を定量化することが可能になる。

---

## 9. トラブルシューティング

### 9.1 よくある問題

#### 問題: NaN（計算失敗）が多発
**原因**: パラメータが非物理的（負値、極端な値）
**対策**:
- r_poly, r_assoc, r_nick の最小値を 0.01 に制限
- k1, b の計算後に正値チェック

#### 問題: 等高線が描画されない
**原因**: 全グリッドで同じ値、またはNaNだらけ
**対策**:
- パラメータ範囲を調整（振動領域を含むように）
- NaN補間（nearest neighbor）

#### 問題: 計算が遅すぎる
**対策**:
- Web Worker並列化を有効化（既存実装済み）
- グリッド解像度を下げる（テスト時）
- t_end を短縮（2000分でも周期評価可能）

### 9.2 デバッグ方法

#### ステップ1: 単一点の確認
```javascript
const testParams = {
  pol: 3.7, rec: 32.5, G: 150,
  k1: 0.0020, k2: 0.0031, b: 0.000048,
  kN: 0.0210, kP: 0.0047, KmP: 34,
  N0: 10, P0: 10,
  t_end_min: 3000, dt_min: 0.5
};

const period = runSimulationAndEvaluate(testParams, 'period', 60);
console.log('Baseline period:', period); // 期待値: 60-90分程度
```

#### ステップ2: パラメータ変換の確認
```javascript
const r_poly = 0.8;
const modified = { ...testParams };
modified.k1 *= r_poly;

const period2 = runSimulationAndEvaluate(modified, 'period', 60);
console.log('Modified period:', period2); // 期待値: baselineより長い
```

---

## 10. 付録

### 10.1 数式記法統一

**三分解倍率**:
- `r_assoc`, `r_poly`, `r_nick`（アンダースコア、小文字）

**無次元パラメータ**:
- `g`, `beta`（ギリシャ文字βはテキストではbeta）

**速度定数**:
- `k1`, `k2`, `kN`, `kP`, `b`, `KmP`

### 10.2 参考文献

1. 元論文 SI: Predator-Prey Molecular Ecosystems (Supporting Information)
2. Heatmap実装: `web/heatmap/heatmap.js` (既存)
3. d3-contour documentation: https://github.com/d3/d3-contour

### 10.3 連絡先・引き継ぎ

**担当者**: (ここに記入)
**リポジトリ**: (シミュレータメインリポジトリのURL)
**質問先**: (連絡先)

---

## 11. チェックリスト

### Phase 1 完了条件
- [ ] r_poly, r_nick が軸パラメータとして選択可能
- [ ] 3フレーム（r_nick = 0.8, 1.0, 1.2）の PNG画像生成
- [ ] MP4動画が正常に再生できる
- [ ] データCSVが保存されている

### Phase 2 完了条件
- [ ] (g, β)グリッドでシミュレーションが実行できる
- [ ] 等高線が滑らかに描画される
- [ ] シナリオ矢印が正しく表示される
- [ ] PNG画像が高解像度（1600×1200以上）

### Wiki統合完了条件
- [ ] simulation.html に結果セクションが追加されている
- [ ] 動画・画像ファイルが assets/ に配置されている
- [ ] KaTeXでの数式表記が正しい
- [ ] Discussion に考察が記載されている

---

**END OF DOCUMENT**
