# Simple Flow Implementation Handoff (Oct 2025)

## 現在の状態

**Branch:** `main`
**Last commit:** `7e0d27a` — "Implement Phase 2 (Step ① 設計 - Card Editor)"

### 完了済みフェーズ

✅ **Phase 0** — Schema & Preferences Migration
✅ **Phase 1** — Routing & Shell
✅ **Phase 2** — Step ① 設計 (Card Editor)
✅ **Phase 3** — Step ② 即時予測 (Time Series Visualization)
✅ **Phase 6** — Detail (Legacy) View

### 実装済みファイル構成

```
/web/
  ├── modifications.js          (v2 schema, migration, preferences)
  ├── index.html               (redirects to /simple/)
  ├── legacy-redirect.js       (optional migration banner helper)
  ├── simple/
  │   ├── index.html           (shell with header, stepper, CTA)
  │   ├── router.js            (hash-based navigation #/simple/1-4)
  │   ├── simple.css           (shared styles)
  │   └── steps/
  │       ├── step1.js         (✅ COMPLETE - card editor)
  │       ├── step1.css        (✅ COMPLETE)
  │       ├── step2.js         (✅ COMPLETE - time series visualization)
  │       ├── step2.css        (✅ COMPLETE)
  │       ├── step3.js         (placeholder)
  │       └── step4.js         (placeholder)
  └── detail/
      ├── index.html           (legacy Workbench with banner)
      ├── workbench.js         (v1↔v2 compatibility)
      ├── library.js
      └── fit/                 (importer, prey_fit, titration)
```

## 次のタスク（優先順位順）

### Phase 4 — Step ③ 同定

**目標:** Fit/Titration ワークフローの簡素化版

**実装内容:**
1. ドラッグ&ドロップ CSV インポート
2. 最小限のオプション（デフォルトで十分動作）
3. 詳細設定は展開可能
4. 滴定ヘルパー（GN binding）
5. 結果を active card に反映
6. Detail view へのリンク（詳細調整用）

**参考ファイル:**
- `/web/detail/fit/importer.js`
- `/web/detail/fit/prey_fit.js`
- `/web/detail/fit/titration.js`

**出力ファイル:**
- `/web/simple/steps/step3.js`
- `/web/simple/steps/step3.css`

### Phase 5 — Step ④ 比較

**目標:** 分岐図・ヒートマップのタブビュー

**実装内容:**
1. `/web/bifurcation/` と `/web/heatmap/` をタブとして埋め込み
2. オーバーレイ表（baseline/active/overlays メトリクス）
3. プリセット選択、軸オーバーライド
4. CSV/PNG エクスポート（プレースホルダー可）
5. Step 2 のオーバーレイ選択と同期

**参考ファイル:**
- `/web/bifurcation/bifurcation.js`
- `/web/heatmap/heatmap.js`

**出力ファイル:**
- `/web/simple/steps/step4.js`
- `/web/simple/steps/step4.css`

### Phase 7 — KaTeX Integration

**目標:** 数式説明パネルの追加

**実装内容:**
1. KaTeX CDN 読み込み（フォールバック付き）
2. 再利用可能な数式解説フラグメント
3. Step 1 フッター + Detail view 折りたたみパネル
4. k₁′, b′, g′, β′, ΔΔG↔r, Nb/ETSSB 変換の説明

### Phase 8 — QA & Documentation

**実装内容:**
1. 回帰ハーネス強化（fetch shim、ステップナビゲーションテスト）
2. 手動 QA（Chrome/Firefox/Edge、キーボードナビゲーション）
3. ドキュメント最終更新

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

- `AGENTS.md` — プロジェクト全体ガイド
- `docs/new-Implementation-request.md` — Simple Flow 要件
- `docs/workbench-simple-mode-plan.md` — フェーズ詳細
- `docs/specification.md` — 仕様書（更新予定）

## 次のエージェントへ

Phase 4（Step ③ 同定）から始めてください。`/web/detail/fit/` の既存ロジックを参考に、Fit/Titration ワークフローの簡素化版を Step 3 に組み込んでください。

---

**作成日:** 2025-10-05
**更新日:** 2025-10-05
**作成者:** Claude Code Agent
**状態:** Phase 0, 1, 2, 3, 6 完了 / Phase 4-5, 7-8 未実装
