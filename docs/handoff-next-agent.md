# Simple Flow Implementation Handoff (Oct 2025)

## 現在の状態

**Branch:** `main`
**Last commit:** `0a5fd99` — "Fix Simple Flow routing and navigation issues"

### 完了済みフェーズ

✅ **Phase 0** — Schema & Preferences Migration
✅ **Phase 1** — Routing & Shell
✅ **Phase 2** — Step ① 設計 (Card Editor)
✅ **Phase 3** — Step ② 即時予測 (Time Series Visualization)
✅ **Phase 4** — Step ③ 同定 (Fit & Titration)
✅ **Phase 5** — Step ④ 比較 (Bifurcation & Heatmap)
✅ **Phase 6** — Detail (Legacy) View
✅ **Phase 7** — KaTeX Integration & Japanese Localization

### 実装済みファイル構成

```
/web/
  ├── modifications.js          (v2 schema, migration, preferences)
  ├── index.html               (redirects to /simple/)
  ├── legacy-redirect.js       (optional migration banner helper)
  ├── simple/
  │   ├── index.html           (shell with header, stepper, CTA, KaTeX CDN)
  │   ├── router.js            (hash-based navigation #/simple/1-4)
  │   ├── simple.css           (shared styles)
  │   ├── mathExplainer.js     (✅ NEW - KaTeX helpers & explanation templates)
  │   └── steps/
  │       ├── step1.js         (✅ COMPLETE - card editor + Japanese UI + math explanation)
  │       ├── step1.css        (✅ COMPLETE - includes explanation styles)
  │       ├── step2.js         (✅ COMPLETE - time series + Japanese UI + math explanation)
  │       ├── step2.css        (✅ COMPLETE - includes explanation styles)
  │       ├── step3.js         (✅ COMPLETE - fit & titration + Japanese UI + math explanation)
  │       ├── step3.css        (✅ COMPLETE - includes explanation styles)
  │       ├── step4.js         (✅ COMPLETE - bifurcation & heatmap + Japanese UI + math explanation)
  │       └── step4.css        (✅ COMPLETE - includes explanation styles)
  └── detail/
      ├── index.html           (legacy Workbench with banner)
      ├── workbench.js         (v1↔v2 compatibility)
      ├── library.js
      └── fit/                 (importer, prey_fit, titration)
```

## 次のタスク（優先順位順）

### ✅ Phase 7 — KaTeX Integration（完了）

**実装済み内容:**
1. ✅ KaTeX CDN 読み込み（v0.16.9、auto-render付き）
2. ✅ `mathExplainer.js`: 再利用可能な数式レンダリング関数
3. ✅ 各ステップ下部に詳細な日本語説明セクション（数式付き）
4. ✅ k₁′, b′, g′, β′, ΔΔG↔r, Nb/ETSSB 変換の理論説明
5. ✅ UI の日本語化（ボタン、ラベル、ヘルプテキスト、検証メッセージ）

### Phase 8 — QA & Documentation（次の優先タスク）

**実装内容:**
1. 回帰ハーネス強化（fetch shim、ステップナビゲーションテスト）
2. 手動 QA（Chrome/Firefox/Edge、キーボードナビゲーション、数式表示確認）
3. ドキュメント最終更新（AGENTS.md、specification.md）
4. アクセシビリティ確認（KaTeX出力のスクリーンリーダー対応）

## 重要な実装詳細

### Schema v2 構造

```javascript
{
  schemaVersion: 2,
  id: "...",
  label: "...",
  inputs: {
    r_assoc: 1,
    r_poly: 1,
    r_nick: 1,
    deltaDeltaGAssoc: null,
    deltaDeltaGFold: null,
    temperatureC: 37,
    useHairpin: false,
    assocLock: 'r' | 'delta',
    Nb_nM: 32.5,
    ETSSB_nM: 3.7,
    aminoAcid: null,
    linker: null,
  },
  derived: { k1Eff, bEff, gEff, betaEff, ... }, // cached
  workflow: {
    fitHistory: [],
    titrationHistory: [],
    lastModified: timestamp,
  },
  notes: "",
}
```

### v1 ↔ v2 互換性

- `loadModifications()`: v2 オブジェクトに v1 互換プロパティを追加（読み取り用）
- `upsertModification()`: v1 プロパティを v2 に変換（書き込み時）
- 保存時は v1 互換プロパティを削除
- レガシー UI は変更不要で動作

### ベースラインパラメータ

```javascript
const BASELINE = {
  pol: 3.7,
  rec: 32.5,
  G: 150,
  k1: 0.0020,
  k2: 0.0031,
  kN: 0.0210,
  kP: 0.0047,
  b: 0.000048,
  KmP: 34,
  N0: 10,
  P0: 10,
};

const BASELINE_ENZYMES = {
  Nb_nM: 32.5,    // rec baseline
  ETSSB_nM: 3.7,  // pol baseline
};
```

### 濃度 ↔ 比率変換

```javascript
// 濃度 → 比率
r_nick = Nb_nM / BASELINE_ENZYMES.Nb_nM;
r_poly = ETSSB_nM / BASELINE_ENZYMES.ETSSB_nM;

// 比率 → 濃度
Nb_nM = r_nick * BASELINE_ENZYMES.Nb_nM;
ETSSB_nM = r_poly * BASELINE_ENZYMES.ETSSB_nM;
```

## ビルド & テスト

```bash
# WASM ビルド
wasm-pack build --target web --release --out-dir web/pkg crate/

# ローカルサーバー起動
python3 -m http.server --directory web 8080

# アクセス
# http://localhost:8080/simple/#/simple/1  (Step 1)
# http://localhost:8080/detail/           (Legacy view)
```

## コミット規約

```bash
git commit -m "Implement Phase N (...)"

# 本文に以下を含める：
# - 実装内容の詳細
# - 新規ファイル一覧
# - 次のステップ
# - 🤖 Generated with Claude Code (https://claude.com/claude-code)
# - Co-Authored-By: Claude <noreply@anthropic.com>
```

## ドキュメント更新

各フェーズ完了時に以下を更新：
- `docs/workbench-simple-mode-plan.md` (チェックリスト)
- `docs/modification-workbench-development-plan.md` (Milestone D)
- `docs/modification-workbench-roadmap.md` (Priority Queue)

## トラブルシューティング

### 問題: ステップが表示されない
- ブラウザコンソールで import エラーを確認
- `step[N].js` の `render()` 関数が export されているか確認

### 問題: 修飾カードが保存されない
- localStorage が有効か確認
- `upsertModification()` が正しく v2 形式で保存しているか確認

### 問題: レガシー UI で v2 カードが読めない
- `loadModifications()` が v1 互換プロパティを追加しているか確認
- ブラウザコンソールで `loadModifications()` の出力を確認

## 参考資料

### 主要ドキュメント
- `AGENTS.md` — プロジェクト全体ガイド
- `docs/new-Implementation-request.md` — Simple Flow 要件
- `docs/workbench-simple-mode-plan.md` — フェーズ詳細
- `docs/specification.md` — 仕様書（更新予定）

### 数理モデル参照

**⚠️ 重要:** 数理モデルの精査や詳細な理論確認が必要な場合は、以下のSIドキュメントを参照してください：

- **ファイル:** `docs/reference/Supplementary_Information.md`
- **サイズ:** 520行、82KB（非常に大きい）
- **内容:** 論文のSupplementary Information（反応ネットワーク、ODEモデル、実験手法、パラメータ測定など）

**📌 推奨アプローチ:**
- このファイルは非常に長いため、**サブエージェント（Task tool with general-purpose agent）に委託**することを強く推奨
- 特定のセクション（例：S3のODE定式化、Table S5のパラメータ値）を指定して検索・要約を依頼
- 数式の正確性確認、パラメータの単位換算、実験条件の詳細などを確認する際に使用

**使用例:**
```javascript
// サブエージェントへの委託例
Task tool: "Search docs/reference/Supplementary_Information.md for Section S3
equations and verify that our ODE implementation in crate/src/lib.rs
matches Eq. 3 and 4 exactly."
```

## 次のエージェントへ

**🎉 すべての主要フェーズ（Phase 0-7）が完了しました！**

### 完成状況
- ✅ **Phase 0-6**: Simple Flow 4ステップワークフロー完全実装
- ✅ **Phase 7**: KaTeX統合 + 日本語詳細説明 + UI日本語化
- ✅ **Routing Fixes**: ステッパーナビゲーション、URL同期修正
- ✅ **Legacy UI Improvements**: ヒートマップ軸目盛り、カラーバー修正
- ✅ **FFT Period Detection**: 実験的フーリエ変換周期検出実装
- ⏳ **Phase 8**: QA & Documentation（残タスク）

### 現在のアプリ状態
- `/simple/` — 完全に動作する4ステップガイド付きワークフロー（日本語UI、数式説明付き）
- `/detail/` → `/simulator/` — レガシーUIのエントリポイント（Physical-Parameter Simulator）
- `/heatmap/` — 軸目盛り、カラーバー表示改善、FFT周期検出実験機能
- すべてのステップが自動保存、オーバーレイ、バリデーション機能を持つ

### 新規実装された実験的機能

**FFT周期検出** (レガシーヒートマップ):
- `web/heatmap/heatmap.js`: `USE_FFT_PERIOD = true` でFFT方式に切り替え
- ピーク検出より耐ノイズ性が高い（要検証）
- ドキュメント: `docs/fft-period-detection.md`

### 次の優先タスク

#### Option A: Phase 8（QA & Documentation）
1. **テスト・デバッグ**: ブラウザ互換性、数式表示、ステップ遷移
2. **回帰テスト強化**: Node.js fetch shim 修正、ステップナビゲーションテスト追加
3. **ドキュメント最終化**: AGENTS.md、specification.md 更新
4. **アクセシビリティ確認**: キーボードナビゲーション、スクリーンリーダー対応

#### Option B: Performance Optimization（推奨）⭐
**ヒートマップ・分岐図の高速化**

現在の性能: 20×15グリッド = 0.3-15秒（300セル）
目標性能: <1秒（Phase 1）、<0.2秒（Phase 2）

**実装プラン**: `docs/performance-optimization-plan.md`
**ハンドオフ**: `docs/handoff-performance-optimization.md`

**Phase 1** (Rust統合): 5-10倍高速化
- 周期検出をRustに移動（`simulate_and_evaluate`）
- rustfftでFFT実装
- データ転送オーバーヘッド削減

**Phase 2A** (Web Workers): 追加3-4倍高速化
- マルチコア並列実行
- 実装容易、全ブラウザ対応

**Phase 3** (WebGPU): 50-100倍高速化（実験的）
- GPU並列実行（10,000セル同時）
- Chrome 113+限定
- 100×100グリッドで5-10秒

**推奨**: Phase 1から着手（最もコスパ良い）

### テスト・デバッグ開始の準備

すぐに作業を再開できるよう、以下を整備済み：
- ✅ ハンドオフドキュメント（このファイル）
- ✅ SI参照情報（サブエージェント活用推奨）
- ✅ トラブルシューティングガイド
- ✅ ビルド・実行手順

新しいエージェントは、このドキュメントを読めばすぐにテスト・デバッグ作業を開始できます。

---

**作成日:** 2025-10-05
**最終更新:** 2025-10-05 17:00 JST
**作成者:** Claude Code Agent
**状態:** Phase 0-7 完了（主要機能100%完成）/ Phase 8 未実装（QA・最終調整）
