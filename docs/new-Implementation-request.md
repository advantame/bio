# 実装依頼書（ドラフト）— 修飾ワークベンチ改修

**対象**：/workbench（WASM + JS/TS フロントエンド、既存の Simulator / Bifurcation / Heatmap と深リンク連携）  
**目的**：シンプルに使える“シンプルモード”を新設し、既存UIを“詳細モード”として残しつつ両者を同期。Nb・ETSSBの**濃度入力←→比率入力**を明示的にサポートし、数式・導線・プリセットを整備して**仮説→即時予測→同定→比較**の一連フローを迷いなく実行できるようにする。

---

## 構成（アウトライン）

1. **はじめに（背景・目的・スコープ）** ← まず本ターンでここまで記述  
    1.1 背景と課題（現状のUXギャップ）  
    1.2 目的（成功条件）  
    1.3 スコープ／非スコープ  
    1.4 影響範囲（UI・状態管理・URL/深リンク・計算式）
    
2. **全体方針（モード構成・導線・同期）**  
    2.1 デフォルト表示：シンプルモード／ヘッダートグルで詳細モードへ  
    2.2 進行ステッパー（①設計→②予測→③同定→④比較）  
    2.3 修飾カードの単一ソース化（メモ・履歴・派生値の共有）  
    2.4 深リンク／オーバーレイのURLエンコード仕様
    
3. **シンプルモードUI仕様**  
    3.1 画面レイアウト（ヘッダー／ステッパー／各ステップ）  
    3.2 ステップ①：設計（プリセット・フォーム・バリデーション）  
    3.3 ステップ②：即時予測（派生パラメータ・支配タイプ・比較準備）  
    3.4 ステップ③：同定（CSV取込・最小入力・出力反映）  
    3.5 ステップ④：比較（バインディング表・深リンク）  
    3.6 ページ下部：詳細解説（数式・変換）  
    3.7 空状態／エラーハンドリング／初心者向けコピー
    
4. **詳細モードUI仕様（現行ベースの増分）**  
    4.1 メモブロック追加／小型ステッパー追加  
    4.2 Nb/ETSSB：**濃度入力と比率入力のトグル**  
    4.3 表示・バリデーション・ツールチップ差分
    
5. **数理定義・変換仕様（厳密）**  
    5.1 基本式（k₁′, b′, g′, β′, f_open）  
    5.2 会合：ΔΔG_assoc ↔ r_assoc（温度依存）  
    5.3 Nb：濃度→r_nick（べき乗既定／Hill代替）  
    5.4 ETSSB：濃度→f_open（ヘアピン）、濃度→r_poly（速度促進）  
    5.5 既定値・推奨レンジ・ユニット
    
6. **データモデル／状態管理**  
    6.1 修飾カードスキーマ（共通）  
    6.2 派生値キャッシュと再計算トリガー  
    6.3 履歴（Fit/Titration）とエクスポート
    
7. **バリデーション・アクセシビリティ・国際化**  
    7.1 入力制約／警告・エラーのルール  
    7.2 キーボード操作／ARIA／色覚配慮  
    7.3 日本語コピー（シンプル）／英語コピー（詳細）
    
8. **パフォーマンス／テレメトリ**  
    8.1 WASM呼び出し境界の最適化  
    8.2 UI応答性・遅延指標  
    8.3 匿名イベント（ステップ到達率・失敗理由）
    
9. **受け入れ基準（Acceptance Criteria）**  
    9.1 ユースケース駆動のE2Eシナリオ  
    9.2 数式準拠のスナップショットテスト  
    9.3 深リンク・オーバーレイの相互運用
    
10. **リスク／既知の制限／将来拡張**  
    10.1 パラメータ非同定時のフォールバック  
    10.2 追加チャンネル（例：KmP, kN/kP の自動調整）  
    10.3 研究段階の推奨値の扱い
    

---

## 1. はじめに（背景・目的・スコープ）

### 1.1 背景と課題

現行の Workbench は**機能的には十分**だが、初見ユーザーが「どこから手を付ければよいか」を掴みにくい。特に、

- `r_assoc / r_poly / r_nick` といった**比率パラメータの意味**、
    
- Nb・ETSSB の**濃度（U/mL, µg/mL）と比率の往復**、
    
- **仮説→即時予測→同定→分岐/熱図比較**という**標準フロー**、
    
- **数式とUI操作の対応**、  
    の**結びつきがUI上で薄い**ため、試行錯誤の負荷が高い。
    

### 1.2 目的（成功条件）

本改修のゴールは、次の**成功条件**を満たす“シンプルに使える”体験を提供すること：

- アプリ初回表示で**誰でも**「①設計→②予測→③同定→④比較」の流れに沿って操作できる。
    
- Nb・ETSSB は**濃度入力を第一級**とし、**比率入力とトグル**で選択可能。UI内の**数式と自動換算**が明示される。
    
- **ΔΔG_assoc ↔ r_assoc** は温度依存換算を**一貫**して行い、整合チェック（±0.2 kcal/mol）を内蔵。
    
- **派生値（k₁′, b′, g′, β′, f_open）**が**基準比との差分**で可視化され、**支配タイプ**（会合/速度/飽和/混合）が即時判定される。
    
- **ライブラリ／オーバーレイ**と**分岐/熱図深リンク**が**ワンクリック**で繋がり、アクティブ/オーバーレイが**URLにエンコード**される。
    
- 既存の「詳細モード」は保持しつつ、**メモブロック・トグル入力・小型ステッパー**で**情報同期**が取れる。
    
- すべての数式・既定値・変換経路が**ページ下の詳細解説**に**日本語で明示**される。
    

### 1.3 スコープ／非スコープ

**スコープ**

- シンプルモードの新規実装（UI・コピー・数式換算・導線）
    
- 詳細モードの増分（メモブロック、小型ステッパー、濃度/比率トグル、ツールチップ）
    
- Nb/ETSSB 濃度フォーム ↔ 比率（r_nick / r_poly / f_open）変換の実装
    
- 派生値計算と表示（k₁′, b′, g′, β′, f_open、支配タイプ判定）
    
- 深リンクの `active` / `overlays` 反映（既存仕様の明文化と微修正）
    
- バリデーション／空状態／エラーハンドリングの整備（日本語コピー）
    

**非スコープ**

- 新規サーバAPI（全てクライアント内計算）
    
- コアODEの数式そのものの変更（有効パラメータ前計算のみを追加）
    
- 追加の物理チャンネル（KmP, kN/kP 自動推定など）の導入
    

### 1.4 影響範囲

- **UI**：/workbench のページ構成、フォーム、導線、コピー、ヘルプ解説
    
- **状態管理**：修飾カードのスキーマ（メモ・入出力形態・プリセット）、派生値キャッシュ
    
- **URL/深リンク**：`preset` + `active`/`overlays` のエンコード維持・同期
    
- **計算**：ΔΔG↔r_assoc、Nb濃度→r_nick、ETSSB濃度→f_open / r_poly、派生値（k₁′, b′, g′, β′）
    

---

## 2. 全体方針（モード構成・導線・同期）

### 2.1 モード構成と既定表示

- 既定表示は**シンプルモード**。ヘッダー右端に **[詳細モード]** トグルを常設。
    
- ルーティング：`/workbench?mode=simple|detail`（既定 `simple`）。
    
    - モードは `localStorage.workbench.mode` にも保存し、次回起動時に反映。
        
    - 無効値は自動で `simple` にフォールバック。
        
- モード間で**修飾カード／選択状態／派生値**を**単一ストア**で共有（後述 6章）。
    
    - 画面スイッチ時の再計算は**差分検知**（依存フィールドが変わった時のみ）。
        

### 2.2 進行ステッパー（共通）

- ステップ：**① 設計 → ② 予測 → ③ 同定 → ④ 比較**。
    
- ステップ状態は `incomplete / in_progress / done` の3値。
    
    - 既定：① `in_progress`、他 `incomplete`。
        
    - ③完了（Fit成功）で自動的に④を `in_progress` に。
        
- 右下に固定CTA：**[次へ] / [戻る]**。
    
- 各ステップの完了条件と遷移条件は 3章の各サブセクションに明記。
    

### 2.3 修飾カードの単一ソース化

- **カード＝単一の真実（SSOT）**。モードやページを跨いで同一の `cardId` を参照。
    
- 共通フィールド（例）：`label, aminoAcid, notes, temperature, assocInputMode, r_assoc, ddG_assoc, nickInputMode, Nb_uMl, r_nick, ssbInputMode, SSB_ugMl, r_poly, hairpinEnabled, ddG_fold, presets, history, derived`（詳細は 6章）。
    
- **アクティブ**は常に単一、**オーバーレイ**は配列。両者はURL深リンクにも出力。
    

### 2.4 深リンク／URLエンコード

- Bifurcation/Heatmap への遷移は**ワンクリック深リンク**。
    
    - 形式：`/bifurcation?preset=<id>&wbv=1&active=<cardId>&overlays=<id1,id2,...>`
        
    - `/heatmap` も同様。`wbv` はワークベンチ・リンクのバージョン。
        
- 遷移直前に**ストアへ同期**（アクティブ/オーバーレイの確定保存・派生値の最終再計算）。
    
- 受け側ページは、クエリ→ストアへ**マージ**し、UIに反映（未存在カードIDは無視し、トーストで通知）。
    

### 2.5 文言と言語

- **シンプルモード：日本語固定**（コピーは本書に同梱）。
    
- **詳細モード：現行英語UI**に日本語を追加（i18nキーは 7章で付与ルールを定義）。
    

---

## 3. シンプルモード UI 仕様

> 目的：初回でも「何をするのか」「次に何が起きるか」が**明快**な1本道。  
> 画面は縦スクロール1ページ。各ステップは**カード状セクション**で、上から順に操作。

### 3.1 レイアウト（共通）

- ヘッダー：タイトル「修飾ワークベンチ（シンプル）」／右端に **[詳細モード]**。
    
- 直下に**進行ステッパー**。
    
- 本文は 4 つのステップカード＋最下部の**詳細解説**。
    
- 最小幅 360px、ブレークポイント 768px/1024px。
    
- 主要コントロールには `data-testid` を付与（例：`wbSimple.step1.rAssocInput`）。
    

---

### 3.2 ステップ① 設計（仮説の入力）

**完了条件**：少なくとも「会合（ΔΔGまたはr）」「ニッキング（Nbまたはr_nick）」「SSB（濃度またはr_poly）」の**いずれか1つ**が入力 or 既定の1.0/基準値。  
**[次へ]** を押すと派生値を確定して②へ。

#### 3.2.1 プリセット

- ドロップダウン：**プリセット**（未選択 / 無修飾 / Lys / Arg / Asp / Phe / Tyr / Trp）。
    
- 選択時：`temperature, r_assoc or ddG_assoc, Nb_uMl (基準), SSB_ugMl (基準)` を自動入力。
    
- 変更はフォームに反映され、ユーザー編集で上書き可。
    

#### 3.2.2 基本フォーム（上から順）

1. **温度 [°C]**（`wbSimple.step1.temperature`）
    
    - 既定 50。数値入力。
        
2. **会合の変化**（`wbSimple.step1.assoc`）
    
    - トグル：**[比 r_assoc] / [ΔΔG_assoc (kcal/mol)]**（既定：**ΔΔG** を隠し、**比**を露出）。
        
    - 片方編集→もう片方は**温度依存換算**で自動表示（編集不可）。
        
    - バリデーション：r>0、推奨 0.2–5、許容 0.05–20。ΔΔG↔r の乖離 ±0.2 kcal/mol 超で黄色警告。
        
    - ツールチップ：**「会合が強まると r_assoc>1、k₁ と b が同率に増えます」**。
        
3. **ニッキング/飽和**（`wbSimple.step1.nick`）
    
    - トグル：**[Nb 濃度 (U/mL)] / [r_nick]**（既定：**濃度**）。
        
    - 変換：**べき乗則**（α=1.0）で `r_nick = (Nb/Nb_ref)^(-α)`（式はカード下に表示）。
        
    - **Nb_ref** 未設定時はモーダルで設定を促す（既定 600 U/mL）。
        
    - 代替モデル（Hill）は詳細モード専用。
        
4. **SSB/速度**（`wbSimple.step1.ssb`）
    
    - トグル：**[ETSSB 濃度 (µg/mL)] / [r_poly]**（既定：**濃度**）。
        
    - **ヘアピン補正**チェック（`hairpinEnabled`）ONで `f_open` を自動算出（読み取り表示）。
        
    - 速度促進 `r_poly` は既定で 1.0（OFF）。濃度入力時は `r_poly`=1.0 を維持（詳細は 5章）。
        
5. **メモ**（`wbSimple.step1.notes`）
    
    - 複数行。仮説・材料ロット・参考文献等を自由記入。カードに保存。
        

#### 3.2.3 保存とアクティブ化

- **[カードとして保存]**（新規の場合は作成／既存なら更新）。
    
- **[アクティブに設定]**（保存と同時にアクティブ化）。
    
- オーバーレイの選択は②で行う。
    

---

### 3.3 ステップ② 予測（派生パラメータと比較準備）

**完了条件**：アクティブカードが存在。  
**[次へ]** で③へ。**[分岐図を開く] / [ヒートマップを開く]** はいつでも押下可。

#### 3.3.1 派生パネル（大）

- 表示項目（Baseline 比との差分を大アイコンで）：
    
    - **k₁′**（↑↓と％）
        
    - **b′**（↑↓と％）
        
    - **g′**（↑↓と％）
        
    - **β′**（↑↓と％）
        
    - **g′×f_open**（ヘアピンON時のみ）
        
- **支配タイプ**バッジ：**会合 / 速度 / 飽和 / 混合**。
    
    - ルール：|Δlog r_assoc|, |Δlog r_poly|, |Δlog r_nick| の最大が“主”／閾値±二番手で混合。
        
- 右上に **[分岐図を開く] [ヒートマップを開く]**（深リンク。active/overlays 反映）。
    

#### 3.3.2 オーバーレイ（簡易ライブラリ）

- 横スクロールのカードチップ。チェックで**比較に追加**。
    
- 追加・削除は派生パネルと深リンクに即時反映。
    
- チップには `label / バッジ（電荷・芳香族）` を表示。
    

---

### 3.4 ステップ③ 同定（Prey-only）

**完了条件**：CSV取込→フィット成功（k₁′, b′ 推定）。  
**[次へ]** で④へ。成功時には**カードに自動反映**。

- **CSV ドロップゾーン**＋**サンプルをダウンロード**。
    
- **最小入力**：`pol, G, N0, 時間単位`。
    
- **詳細設定（折りたたみ）**：`ベースライン点数, 損失関数(LS/Huber), クロストーク, Green→nMスケール`。
    
- 実行結果：
    
    - **k₁′, b′** と **95%CI**、**R²**、**残差の要約**。
        
    - **整合ピル**：`会合主導/速度主導/飽和主導` の示唆（β変化や k₁′/b′ 比で判定）。
        
    - **[結果をカードへ反映]**（自動ON。オフにするとプレビューのみ）。
        

エラー時の指針：**Huberを有効化／ベースライン点数を減らす／スケールを見直す**（トーストとインライン）。

---

### 3.5 ステップ④ 比較（分岐/熱図連携）

**完了条件**：なし（任意で利用）。

- **現在のバインディング表**：Baseline / Active / Overlays の **k₁′, b′, g′, β′**。
    
- **[分岐図を開く] / [ヒートマップを開く]**：
    
    - `/bifurcation?preset=<id>&wbv=1&active=<cardId>&overlays=<ids>`
        
    - `/heatmap?...`
        
- 右下に **[①に戻る] [②へ] [③へ]** のショートナビ。
    

---

### 3.6 ページ下部：詳細解説（数式・変換・既定値）

- 折りたたみだが**既定で展開**。
    
- 含む内容（本文は最終稿で提供）：
    
    - **定義式**：`k₁′, b′, g′, β′, f_open`。
        
    - **変換式**：`r_assoc = exp(-ΔΔG/(RT))`、`r_nick = (Nb/Nb_ref)^(-α)`、`ΔG_fold′` と `f_open`、`r_poly` の式。
        
    - **既定値と単位**：温度、Nb_ref=600 U/mL、ETSSB基準 5 µg/mL など。
        
    - **よくある質問**（Q&A 形式）。
        

---

### 3.7 空状態・エラー表示

- **空ライブラリ**：**「まず ① 設計で仮説を入力し、『カードとして保存』してください」**。
    
- **未設定の参照値**（Nb_ref等）：ダイアログで設定を促す。
    
- **URLに未知のcardId**：トースト「見つかりません：〜」。
    
- **数式変換失敗**：ユニット／非正値／範囲外を明示。
    

---

## 4. 詳細モード UI 仕様（現行ベースの増分）

> 現行 `/workbench` を **詳細モード**として残し、以下の増分を追加する。既存コンポーネント名・DOM構造は極力温存し、差分実装で再現性を担保する。

### 4.1 ヘッダー差分

- 右端に **[シンプルモード]** トグル（`/workbench?mode=simple`）。
    
- 小型ステッパーをヘッダー下に追加（現在位置のみ強調・クリックでスクロール）。
    

### 4.2 メモブロック（修飾カード共通）

- **Design** パネル右上に **「仮説メモ」**（`textarea`、多行、最大2,000字）。
    
    - フィールド名：`card.notes`（シンプルと共通）。
        
    - 保存はカード更新に同梱（オートセーブ：blur／Enter+Meta）。
        

### 4.3 Nb/ETSSB 入力切替

- **Nb**：
    
    - トグル `mode = "concentration" | "ratio"`（既定 `"concentration"`）。
        
    - `mode="concentration"` のとき：`Nb_uMl` 入力可、`r_nick` は読み取り（自動計算値）。
        
    - `mode="ratio"` のとき：`r_nick` 入力可、`Nb_uMl` は読み取り（逆変換値）。
        
    - 変換式は入力欄のヘルプに常時表示（式詳細は §5）。
        
- **ETSSB**：
    
    - トグル `mode = "concentration" | "ratio"`（既定 `"concentration"`）。
        
    - `mode="concentration"`：`SSB_ugMl` 入力可、`r_poly` 読み取り（既定1.0、促進モデルONなら自動計算）。
        
    - `hairpinEnabled=true` のとき `f_open` を読み取りで表示。
        
    - `mode="ratio"`：`r_poly` 入力可（促進モデルON必須）、`SSB_ugMl` 読み取り。
        
- いずれも **ツールチップ**に単位と既定参照値（例：`Nb_ref=600 U/mL`）を表示。
    

### 4.4 表示・バリデーション差分

- `r_*` の推奨/許容レンジ配色（黄/赤）を **詳細モードにも**適用。
    
- ΔΔG ↔ r の **乖離警告**（±0.2 kcal/mol）を Design フォーム下に表示。
    
- **派生パラメータ表**は Baseline / Active / Overlays を横並び（現行維持）。支配タイプのバッジを各列ヘッダに表示。
    

### 4.5 深リンクボタンの強調

- **Open Bifurcation / Open Heatmap** をフォーム下に固定（スクロールで追従）。
    
- クリック時、アクティブ/オーバーレイ・派生値を確定同期 → URL発行（§2.4）。
    

---

## 5. 数理定義・変換仕様（厳密）

> ここに記す式は UI で表示する“詳細解説”と同一。**全計算はクライアント側で実施**。数式変更は後方互換が崩れるため、本仕様を唯一の根拠とする。

### 5.1 定数・記法

- `R = 1.98720425864083e-3 kcal·mol⁻¹·K⁻¹`
    
- `T = (temperature °C) + 273.15 K`
    
- `log` は自然対数（`ln`）。`log10` が必要な場面は明示。
    
- 参照（Baseline）値：`Nb_ref = 600 U/mL`、`SSB_ref = 5 µg/mL`（編集可・ストア保持）。
    

### 5.2 基本導出（派生パラメータ）

- `k1' = k1 · (r_assoc · r_poly) / r_nick`
    
- `b' = b · (r_assoc) / r_nick`
    
- `g' = (k1' · G) / (k2 · KmP)`
    
- `β' = β / r_poly`
    
- **ヘアピン補正ON**：`G_eff = f_open · G` を `g'` にのみ適用（`g'_eff = g' · f_open`）。
    

### 5.3 会合（ΔΔG_assoc ↔ r_assoc）

- **順変換**：`r_assoc = exp( - ΔΔG_assoc / (R · T) )`
    
- **逆変換**：`ΔΔG_assoc = - R · T · ln(r_assoc)`
    
- 入力相互排他：**主入力**をユーザーが選択（シンプル：デフォルトは `r_assoc`）。**従入力**は読み取り専用で自動表示。
    
- 整合警告：ユーザーが両方を明示編集して差が **±0.2 kcal/mol** を超える場合、黄色警告。
    

### 5.4 ニッキング（Nb 濃度 → r_nick）

- 既定モデル（べき乗）：
    
    - `r_nick = (Nb_uMl / Nb_ref) ^ ( - α_nick )`（既定 `α_nick=1.0`）
        
    - 逆変換：`Nb_uMl = Nb_ref · r_nick ^ ( -1/α_nick )`
        
- 代替モデル（Hill；詳細モードのみ露出）：
    
    - `K(C) = K_min + (K_ref - K_min) / (1 + (C / N50) ^ h)`
        
    - `r_nick = K(C) / K_ref`
        
    - 逆変換は単調性を用いた数値解（ブレント法；上限下限は [1e-6, 1e6]）。
        
- **物理解釈**：Nb↑ ⇒ 事実上のしきい値 `K`↓ ⇒ `r_nick < 1`、`k1'` と `b'` は **同率↑**。
    

### 5.5 ETSSB（濃度 → f_open / r_poly）

- **ヘアピン（開放確率）**：
    
    - `ΔG_fold' = ΔG_fold0 + η_open · ln(1 + SSB_ugMl / E50_open)`
        
    - `f_open = 1 / (1 + exp( ΔG_fold' / (R · T) ))`
        
    - 既定：`η_open > 0`、`ΔG_fold0 = 0`（シンプルでは非表示・固定）。
        
- **速度促進（任意）**：
    
    - `r_poly = 1 + A_poly · SSB_ugMl / (SSB_ugMl + E50_poly)`
        
    - 既定：**OFF**（`A_poly=0` → `r_poly=1`）。詳細モードでのみ係数編集可。
        
- **逆変換（詳細モードで ratio 入力時）**：
    
    - `r_poly`→`SSB_ugMl` は代数的に解ける：`SSB_ugMl = (E50_poly · (r_poly - 1)) / (A_poly - (r_poly - 1))`（`0<r_poly<1+A_poly` 領域）。
        
    - `f_open` から `SSB_ugMl` は上式逆（単調・数値解）。
        

### 5.6 推奨レンジ・単位

- 比率 `r_*`：推奨 `0.2–5`、許容 `0.05–20`。
    
- 濃度：`Nb_uMl`（U/mL）≥0、`SSB_ugMl`（µg/mL）≥0。
    
- 温度：`[10, 90] °C`（ガード；推奨は装置に合わせて設定）。
    

---

## 6. データモデル／状態管理

> 状態は **単一ストア（SSOT）**。モードやページを跨いで共通利用。TypeScript 型定義を下記に示す。

### 6.1 型定義（簡略）

```ts
// 共通：修飾カード
export type AssocInputMode = "ratio" | "ddG";
export type NickInputMode  = "concentration" | "ratio";
export type SSBInputMode   = "concentration" | "ratio";

export interface ModificationCard {
  id: string;                   // UUID
  label: string;
  aminoAcid: "Lys"|"Arg"|"Asp"|"Glu"|"Phe"|"Tyr"|"Trp"|"His"|"custom";
  notes: string;                // 仮説メモ（最大2000字）
  temperatureC: number;         // °C

  // 会合
  assocInputMode: AssocInputMode;
  r_assoc: number;              // >0
  ddG_assoc: number | null;     // kcal/mol（mode="ratio"時は自動出力）

  // ニッキング
  nickInputMode: NickInputMode;
  Nb_uMl: number | null;        // 濃度入力時は編集可
  r_nick: number;               // >0
  alpha_nick: number;           // 既定1.0（詳細モードで編集可）
  nickModel: "power" | "hill";  // シンプルは "power"
  hill?: { Kmin: number; N50: number; h: number; Kref: number }; // 詳細のみ

  // SSB
  ssbInputMode: SSBInputMode;
  SSB_ugMl: number | null;
  r_poly: number;               // >=1（促進OFF時1）
  hairpinEnabled: boolean;
  ddG_fold0: number;            // kcal/mol（詳細編集可）
  eta_open: number;             // (>0 推奨)
  E50_open: number;             // µg/mL
  A_poly: number;               // 促進量（0でOFF）
  E50_poly: number;             // µg/mL

  // 表示・分類
  tags: string[];               // 电荷・芳香族など
  overlay: boolean;             // オーバーレイ参加

  // 履歴
  history: {
    fit?: Array<FitRecord>;
    titration?: Array<TitrationRecord>;
  };

  // 派生値（キャッシュ）
  derived: DerivedParams;       // 計算時に更新
}

export interface DerivedParams {
  k1p: number;  // k₁′
  bp: number;   // b′
  gp: number;   // g′
  betaP: number;// β′
  fOpen?: number;      // ヘアピンON時
  dominance: "assoc"|"polymerase"|"saturation"|"mixed";
  warnings: string[];  // レンジ／不整合など
}

export interface FitRecord {
  timestamp: string;
  k1p: number; bp: number;
  ci95: { k1p: [number,number]; bp: [number,number] };
  r2: number; loss: "LS"|"Huber";
  inputs: { pol:number; G:number; N0:number; unit:"s"|"min" };
}

export interface TitrationRecord {
  timestamp: string;
  Ka: number; r_assoc: number;
  temperatureC: number;
}

// グローバル
export interface WorkbenchState {
  mode: "simple"|"detail";
  activeCardId: string | null;
  overlayIds: string[];
  cards: Record<string, ModificationCard>;
  refs: { Nb_ref: number; SSB_ref: number };
}
```

### 6.2 再計算トリガー

- 次のフィールドが変化したとき、`derived` を再計算：  
    `temperatureC, r_assoc, r_poly, r_nick, hairpinEnabled, ddG_fold0, eta_open, E50_open, SSB_ugMl`。
    
- **モード切替**では再計算しない（値は不変）。
    
- 再計算は **デバウンス 150ms**・**同期的にストアへ反映**。
    

### 6.3 派生計算ユーティリティ

- `deriveAssoc({mode, r, ddG, T}): {r, ddG}`
    
- `deriveRnick({mode, Nb, r, Nb_ref, alpha}): {r, Nb}`（Hill対応）
    
- `deriveSsb({mode, SSB, r_poly, hairpinEnabled, params}): {r_poly, f_open, SSB}`
    
- `deriveParams({card, baseParams}): DerivedParams`（`k1', b', g', β'`）
    

### 6.4 履歴の管理

- Fit/Titration 実行時：`history.fit.push(record)` / `history.titration.push(record)`。
    
- **エクスポート**：CSV/JSON でダウンロード（ヘッダにカードID・日時）。
    
- 履歴はカードに内包（モード共通）。
    

---

## 7. バリデーション／アクセシビリティ／国際化

### 7.1 バリデーション（入力制約とエラー表示）

**原則**

- すべての数値入力は**単位つき**（プレースホルダ／ツールチップで明示）。
    
- 「保存」「次へ」「深リンク」等の主要アクションは**不正入力がある場合は無効化**。
    
- 警告（yellow）とエラー（red）を**段階表示**。エラーは保存不可。
    

**フィールド別ルール**

- `temperatureC`：10–90（°C）。範囲外→赤。
    
- `r_assoc, r_poly, r_nick`：>0。**推奨 0.2–5／許容 0.05–20**。
    
    - 0.05> または 20< → 赤（保存不可）。
        
    - [0.05–0.2) ∪ (5–20] → 黄（保存可だが「推奨外」）。
        
- `ddG_assoc`：任意の実数。**整合チェック**：`|ddG_assoc + R·T·ln(r_assoc)| > 0.2 kcal/mol` → 黄。
    
- `Nb_uMl, SSB_ugMl`：≥0。単位固定。
    
    - **Nb_ref 未設定**で濃度→r変換を要求 → モーダルで設定（保存時にもブロック）。
        
- `hairpinEnabled`：ON時は `f_open∈(0,1)` を計算。`ΔG_fold'` 計算で NaN → 赤。
    
- Fit 入力：`pol>0, G>0, N0>0`、`timeUnit∈{s,min}`。
    
- CSV 取込：`time` 列（数値）、`green` 列（数値、必須）、`yellow` 列（任意）。ヘッダ自動検知失敗→赤＋サンプルDL導線。
    

**エラーメッセージ（日本語）**

- 「値を入力してください」「正の数を入力してください」「推奨レンジ(0.2–5)を外れています」「許容レンジ(0.05–20)を超えています（保存できません）」「ΔΔG と r の整合が±0.2 kcal/molを超えています」「Nb の参照値が未設定です（設定してください）」「CSVの列名が認識できません：time, green（必須）」  
    （詳細モードでは英語版も用意。i18nキーは §7.3）
    

**表示仕様**

- 入力右に**アイコン＋テキスト**（`aria-live="polite"`）。
    
- ダイアログは **Esc で閉じる**・**Enter で確定**。
    
- 無効ボタンは**ツールチップで理由**を表示（例：「保存できない理由」）。
    

---

### 7.2 アクセシビリティ（A11y）

- **キーボード操作**
    
    - Tab順は**フォーム順**。トグルは Space/Enter。ラジオは矢印で移動。
        
    - ドロップゾーンは `Enter` でファイル選択ダイアログを開く。
        
- **ARIA**
    
    - 入力：`aria-label`／`aria-labelledby`／`aria-describedby` を設定（説明文の `id` と関連付け）。
        
    - エラー領域：`role="alert"`、軽微なヒント：`aria-live="polite"`。
        
    - ステッパー：`role="list"`, 各ステップ `role="listitem"`、現在は `aria-current="step"`。
        
- **コントラスト**
    
    - 文字と背景は **WCAG 2.1 AA (4.5:1)** 以上。警告色・エラー色はダーク/ライト双方で担保。
        
- **フォーカスリング**
    
    - 2px 高コントラストのアウトライン（カスタムCSS変数でテーマ対応）。
        
- **支援技術**
    
    - ステータス変化（保存完了・派生再計算）はスクリーンリーダ向けテキストを併記。
        
- **ドラッグ&ドロップ**
    
    - 代替操作として必ず「ファイルを選択」ボタンを併置。
        

---

### 7.3 国際化（i18n）

- **キー命名**：`wb.<mode>.<section>.<field>.(label|help|error|tooltip)`
    
    - 例：
        
        - `wb.simple.step1.assoc.label` = 「会合の変化」
            
        - `wb.simple.step1.assoc.help` = 「ΔΔG か 比 r のどちらかを入力…」
            
        - `wb.detail.nick.tooltip.power` = 「r_nick = (Nb/Nb_ref)^(-α)」
            
- **フォールバック**：`ja` → `en`。キー未定義はコンソール警告＋英語。
    
- **数値書式**：`Intl.NumberFormat`（小数は最大3桁、単位は別DOM）。
    
- **用語集**：ページ下部に「用語と記号」を設置（`R, T, ΔΔG, r_*` 等の定義）。
    

---

## 8. パフォーマンス／テレメトリ

### 8.1 パフォーマンス方針

- **再計算の抑制**：依存フィールドの変更時のみ派生計算。**デバウンス 150ms**。
    
- **WASM 呼び出し**：シンプルモードでは**前計算のみに限定**（ODEは分岐/熱図ページで実行）。
    
- **分割読み込み**：詳細モード・Fit/Titration モジュールは `dynamic import()`。
    
- **ペイント最適化**：派生パネルは**仮想DOMのメモ化**、差分更新。
    
- **CSV パース**：Web Worker を**オプション**に（10MB超で自動利用）。
    
- **応答性指標**：
    
    - TTI ≤ 2.5s（初回）
        
    - 入力→派生表示 ≤ 100ms（デバウンス後）
        
    - CSV 10k 行→フィット結果 ≤ 1.5s（Worker使用時）
        

### 8.2 テレメトリ（匿名・オプトイン）

- 既定 **OFF**。ユーザーが「改善に協力」ON時のみ収集（ローカルに選好保持）。
    
- **イベントスキーマ**（例）：
    
    - `wb_step_navigate`：`{from,to,mode}`
        
    - `wb_fit_result`：`{success:boolean, rows:int, ms:int}`
        
    - `wb_link_open`：`{target:"bifurcation"|"heatmap", overlays:int}`
        
    - `wb_validation_error`：`{field,key}`
        
- 送信先：既存のクライアント計測があれば流用、無ければローカル保存のみ。個人情報・データ本体は**収集しない**。
    

---

## 9. 受け入れ基準（Acceptance Criteria）

### 9.1 E2E シナリオ（主要ユースケース）

1. **Phe末端の仮説—即時予測—比較**
    
    - シンプル①で `r_assoc=1.9`、Nb/SSBは基準、保存→アクティブ。
        
    - ②で `k₁′/b′/g′↑, β′不変` と支配タイプ=会合。
        
    - オーバーレイに「無修飾」を追加し、「分岐図を開く」で横ズレ確認。
        
    - **期待**：深リンクに `active,overlays` が載り、受け側で反映。
        
2. **Nb 濃度入力→r_nick 自動反映**
    
    - Nb_ref=600、Nb=1200 を入力。
        
    - **期待**：`r_nick≈(1200/600)^(-1)=0.5`、`k₁′/b′` が同率↑。
        
    - 詳細モード切替でも同値を保持。
        
3. **ETSSB 濃度入力→ヘアピンON**
    
    - `SSB_ugMl=5`、ヘアピンON。
        
    - **期待**：`f_open∈(0,1)` が表示、`g′×f_open` が `g′` より小。`β′` は不変。
        
4. **Prey-only Fit 成功**
    
    - CSV（サンプル）投入→ `pol,G,N0` を設定→実行。
        
    - **期待**：`k₁′, b′, CI, R²` 表示、カード更新、整合ピル表示。
        
5. **ΔΔG↔r の整合警告**
    
    - 温度50°C、`r_assoc=2` を入力後、`ddG_assoc=-0.1` を直接編集（詳細モード）。
        
    - **期待**：±0.2 kcal/mol超→黄警告。保存は可。
        
6. **未知 cardId の深リンク**
    
    - `/bifurcation?...&active=UNKNOWN`
        
    - **期待**：トースト「見つかりません：UNKNOWN」、既存選択は維持。
        

### 9.2 単体テスト（数式スナップショット）

- `r_assoc ⇄ ddG_assoc`（温度 25/50/65°C）：往復誤差 < 1e-9。
    
- `r_nick`（べき乗）：Nb=[300,600,1200] → [~1.414,1,0.5]（α=1）。
    
- `r_nick`（Hill）：単調性・境界（C→0,∞）。
    
- `f_open`：η_open>0 で SSB↑→ f_open↑。
    
- `r_poly`：A_poly=0 → 1、A_poly>0 で単調増。
    
- `derived`：`k1', b', g', β'` の更新とヘアピン影響（`g'`のみ）。
    

### 9.3 アクセシビリティ／i18n テスト

- キーボードのみで ①→④ 遷移できる。
    
- 各入力に `aria-describedby` が付与される。
    
- コントラスト比（主要テキスト＞4.5:1）。
    
- `ja`/`en` の切替で文言が切り替わり、キー欠落はフォールバック＋警告。
    

### 9.4 クロスブラウザ

- Chrome/Edge/Firefox/Safari 最新。モバイル Safari/Chrome（iOS/Android）で主要操作可。
    

---

## 10. リスク／既知の制限／将来拡張

### 10.1 リスク・制限

- **パラメータ非同定**：Prey-only だけでは `r_assoc` と `r_nick` の切り分けが困難な場合あり。**整合ピル**で「追加データ推奨（滴定 or Nb掃引）」を案内。
    
- **Nb→r_nick モデル不確実性**：べき乗既定は簡便だが、系により Hill が適切。詳細モードで切替可、シンプルはべき乗固定。
    
- **ETSSB 促進（r_poly）**：既定OFF。ONにする場合は係数の事前キャリブレーションが必要。
    
- **大型CSV**：Worker未使用環境で遅延の可能性。10MB超で自動ワーカー使用にフォールバック。
    
- **単位混同**：濃度・比率トグルの誤操作リスク → ラベル／単位／逆変換の**読み取り表示**で軽減。
    

### 10.2 将来拡張

- **KmP, kN/kP** の自動同定・条件依存モデリング。
    
- **実験計画（DoE）サジェスト**のアルゴリズム追加（等周期帯横切り案内）。
    
- **共有リンク**（カード・比較セットの外部共有）と**チームコラボ**。
    
- **ガイド付きツアー**（初回のみ）・インライン動画チュートリアル。
    
---
---
---

# 設計ページ（シンプルモード）— 日本語解説文と数式
ここから下には、ページにそのまま記載するための説明文テキストが書いてあります。

このページは、**「仮説を数値に落とし込む場所」**です。末端アミノ酸修飾や酵素濃度の変更が、モデル中の有効パラメータ（(k_1', b', g', \beta')）を**どの方向に、どれだけ**動かすかを、**最小の入力**で決めます。ここで決めた数値はそのまま **②即時予測** と **④分岐/熱図** に引き継がれます。

---

## 1. このページで“できること”

- **会合（G:N結合）の変化**を「自由エネルギー差 (\Delta\Delta G_{\mathrm{assoc}})」または「比 (r_{\mathrm{assoc}})」で入力し、**(k_1) と (b) を同率に**更新します。
    
- **ニッキング/飽和特性（Nb.BsmI）**を「濃度（U/mL）」または「比 (r_{\mathrm{nick}})」で入力し、**(k_1) と (b) を同率に**（逆向きに）更新します。
    
- **SSB（ETSSB）**を「濃度（µg/mL）」で入力し、必要なら**ヘアピン補正**を有効化して**有効 (G)** を自動補正（(f_{\mathrm{open}})）します。速度促進（(r_{\mathrm{poly}})）は既定OFF。
    
- **温度**を入れると、(\Delta\Delta G\leftrightarrow r) の換算が物理定数 (R,T) に基づいて**自動**で行われます。
    

> コアの考え方（重要）：  
> [  
> k_1=\frac{K_a^{GN}k}{K},\qquad b=\frac{K_a^{GN}}{K}  
> ]  
> 会合（(K_a^{GN})）や飽和しきい値（(K)）が変わると、**(k_1) と (b) は常に同率で動く**。  
> 一方、速度（(k)）は **(k_1/b)** にのみ現れ、(\beta) を変化させます。

---

## 2. 入力フィールドと“裏で起きている計算”

### 2.1 温度（°C）

- **用途**：(\Delta\Delta G_{\mathrm{assoc}}) ↔ (r_{\mathrm{assoc}}) の**相互換算**に使います。
    
- **定義**：(T = {}^\circ\mathrm{C} + 273.15\ \mathrm{K})、(R=1.987204\times10^{-3}\ \mathrm{kcal,mol^{-1},K^{-1}})。
    

---

### 2.2 会合（G:N結合）の変化：(\Delta\Delta G_{\mathrm{assoc}}) ↔ (r_{\mathrm{assoc}})

**どちらか一方を主入力**として選び、もう一方は自動表示（編集不可）になります。

- **主入力：比 (r_{\mathrm{assoc}})**（推奨。直感的でレンジガードが効く）
    
    - 物理意味：(r_{\mathrm{assoc}}=\dfrac{K_a^{GN}(\text{修飾})}{K_a^{GN}(\text{無修飾})})
        
    - (r_{\mathrm{assoc}}>1) で結合強化（例：Phe, Tyr, Trp による末端スタッキング仮説）。
        
- **主入力：自由エネルギー差 (\Delta\Delta G_{\mathrm{assoc}})（kcal/mol）**
    
    - 物理意味：(\Delta\Delta G_{\mathrm{assoc}}=\Delta G_{\mathrm{assoc}}^{\text{修飾}}-\Delta G_{\mathrm{assoc}}^{\text{無修飾}})
        
    - **負**なら結合強化、**正**なら弱化。
        

**換算式（温度依存）**  
[  
\boxed{  
r_{\mathrm{assoc}}=\exp!\Big(-\frac{\Delta\Delta G_{\mathrm{assoc}}}{RT}\Big),  
\quad  
\Delta\Delta G_{\mathrm{assoc}}=-RT\ln r_{\mathrm{assoc}}  
}  
]

**モデルへの反映（会合チャンネル）**  
[  
\boxed{  
k_1' = k_1\cdot\frac{r_{\mathrm{assoc}}\cdot r_{\mathrm{poly}}}{r_{\mathrm{nick}}},\qquad  
b' = b \cdot\frac{r_{\mathrm{assoc}}}{r_{\mathrm{nick}}}  
}  
]  
会合だけを変えた（= (r_{\mathrm{poly}}=r_{\mathrm{nick}}=1)）ときは  
(\Rightarrow k_1' = k_1,r_{\mathrm{assoc}})、(b' = b,r_{\mathrm{assoc}})（**同率で上がる/下がる**）。

**ミニ例**（温度 50 °C → (T=323.15) K）：  
(\Delta\Delta G_{\mathrm{assoc}}=-0.5\ \mathrm{kcal/mol})  
(\Rightarrow r_{\mathrm{assoc}}=\exp!\big(0.5/(R,T)\big)\approx \exp(0.780)\approx 2.18)。  
→ (k_1) と (b) が **約2.2倍**。

**バリデーション**

- (r_{\mathrm{assoc}}>0)。推奨レンジ 0.2–5、許容 0.05–20。
    
- 編集で (|\Delta\Delta G_{\mathrm{assoc}} + RT\ln r_{\mathrm{assoc}}|>0.2\ \mathrm{kcal/mol}) なら**警告**（温度の見直し/単位誤りの可能性）。
    

---

### 2.3 ニッキング/飽和（Nb.BsmI）：濃度（U/mL） ↔ 比 (r_{\mathrm{nick}})

**入力方法をトグル**で選べます（既定：**濃度入力**）。裏では「しきい値 (K) のスケーリング」として解釈され、**(k_1) と (b) を同率に**（会合と同じ向き/逆向き）動かします。

- **主入力：Nb 濃度（U/mL）**
    
    - 参照値 ( \mathrm{Nb}_{\mathrm{ref}} )（既定 600 U/mL）に対する比から (r_{\mathrm{nick}}) を計算。
        
- **主入力：比 (r_{\mathrm{nick}})**
    
    - 物理意味：(r_{\mathrm{nick}}=\dfrac{K'(\text{修飾/条件})}{K(\text{無修飾/基準})})。
        
    - (r_{\mathrm{nick}}<1) なら「実効しきい値が下がる」→ 成長項が**飽和しやすく**なる。
        

**換算式（既定：べき乗モデル）**  
[  
\boxed{  
r_{\mathrm{nick}}=\Big(\frac{\mathrm{Nb}}{\mathrm{Nb}_{\mathrm{ref}}}\Big)^{-\alpha_{\mathrm{nick}}}  
\quad(\alpha_{\mathrm{nick}}=1.0\ \text{既定})  
}  
]

- 逆変換：(\mathrm{Nb}=\mathrm{Nb}_{\mathrm{ref}}\cdot r_{\mathrm{nick}}^{-1/\alpha_{\mathrm{nick}}})
    

**直観**

- Nb を **2倍**にすると (r_{\mathrm{nick}}=(2)^{-1}=0.5)。  
    (\Rightarrow k_1',b') は **同率で** (1/r_{\mathrm{nick}}=2) 倍（会合と同じ“同率”だが、**向きが逆**になる点に注意）。
    

> ※ 詳細モードでは、上限飽和を明示できる **Hill 型** (K(C)) も選べます（シンプルでは固定しません）。

---

### 2.4 SSB（ETSSB）：濃度（µg/mL） → (f_{\mathrm{open}})（ヘアピン）／(r_{\mathrm{poly}})（速度）

**既定は「ヘアピン補正のみONにできる」設定**です。速度促進 (r_{\mathrm{poly}}) は既定 1.0（OFF）。必要になったときに詳細モードで係数を解放してください。

#### 2.4.1 ヘアピン補正（有効 (G) を自動補正）

- **考え方**：G がヘアピン構造と開状態の**二状態**なら、SSB が増えると**開きやすく**なる。
    
- **式**：  
    [  
    \Delta G_{\mathrm{fold}}'=\Delta G_{\mathrm{fold}}^{0}+\eta_{\mathrm{open}}\cdot\ln!\Big(1+\frac{C_{\mathrm{SSB}}}{E_{50}^{\mathrm{open}}}\Big)  
    ]  
    [  
    \boxed{  
    f_{\mathrm{open}}=\frac{1}{1+\exp!\big(\frac{\Delta G_{\mathrm{fold}}'}{RT}\big)}\in(0,1),\qquad  
    G_{\mathrm{eff}}=f_{\mathrm{open}}\cdot G  
    }  
    ]
    
    - 既定：(\Delta G_{\mathrm{fold}}^{0}=0)（シンプルでは非表示）、(\eta_{\mathrm{open}}>0)。
        
    - **モデルへの反映**：**(g) のみ**をスケール（(,g' \to g'\cdot f_{\mathrm{open}})）。**(\beta) は不変**。
        
- **直観**：SSB を上げるほど (f_{\mathrm{open}}\uparrow) → 実効 (G) が増え、**分岐図では横方向（(g) 軸）**の変化として現れます。
    

#### 2.4.2 速度促進（任意・既定OFF）

- **式（詳細モードで有効化）**：  
    [  
    \boxed{r_{\mathrm{poly}}=1+\frac{A_{\mathrm{poly}}\cdot C_{\mathrm{SSB}}}{C_{\mathrm{SSB}}+E_{50}^{\mathrm{poly}}}}  
    ]
    
    - **モデルへの反映**：(\beta'=\beta/r_{\mathrm{poly}})。(,k_1',b') には **会合/飽和**と組み合わせで入ります（2.2 参照）。
        
- **直観**：(r_{\mathrm{poly}}>1) なら **振動域（(\beta) 依存）の幅**が広がる/変わるタイプの変化になりやすい。
    

---

### 2.5 メモ（仮説・材料情報）

- 実験の**意図**・予想される**チャンネル（会合/速度/飽和）**・試薬の**ロット情報**など、**解釈に必要な文脈**を書き残しておくと、③同定や④比較での判断が速くなります。
    
- このメモは**詳細モードでも表示・編集可能**で、カードとともに保存されます。
    

---

## 3. 入力がモデルに与える“最終効果”（要点の早見）

- **会合（(\Delta\Delta G) または (r_{\mathrm{assoc}})）**  
    (\Rightarrow k_1',b') を**同率**に変更。**(\beta) は不変**、**(g) がスライド**。
    
- **ニッキング/飽和（Nb または (r_{\mathrm{nick}})）**  
    (\Rightarrow k_1',b') を**同率**に変更（会合と同率だが**向きが逆**になりうる）。**(\beta) は不変**、**(g) がスライド**（向きは (r_{\mathrm{assoc}}) との相対で決まる）。
    
- **速度（(r_{\mathrm{poly}})；既定OFF）**  
    (\Rightarrow \beta'=\beta/r_{\mathrm{poly}})（**(\beta) だけが動く**）。分岐図では**帯幅の変化**として現れやすい。
    
- **ヘアピン補正（(f_{\mathrm{open}})）**  
    (\Rightarrow G_{\mathrm{eff}}=f_{\mathrm{open}}\cdot G)。**(g) だけが縮尺変化**。
    

> まとめて書くと：  
> [  
> \boxed{  
> \begin{aligned}  
> k_1' &= k_1\cdot\frac{r_{\mathrm{assoc}}\cdot r_{\mathrm{poly}}}{r_{\mathrm{nick}}},[2pt]  
> b' &= b \cdot\frac{r_{\mathrm{assoc}}}{r_{\mathrm{nick}}},[2pt]  
> g' &= \frac{k_1'G}{k_2K_{m,P}}\quad(\text{必要に応じ }G\to f_{\mathrm{open}}G),[2pt]  
> \beta'&= \beta/r_{\mathrm{poly}}.  
> \end{aligned}}  
> ]

---

## 4. ベストプラクティス（入力のコツ）

1. **最初は比（r）で考える**：(\Delta\Delta G) が直観に合わないときは **(r_{\mathrm{assoc}})** を主入力に。温度依存の換算は自動に任せる。
    
2. **Nb は濃度入力が安全**：ラボの**標準 Nb 濃度**に対する倍数感覚が活きます（倍→(r_{\mathrm{nick}}=0.5) など）。
    
3. **SSB はまずヘアピンだけ**：(r_{\mathrm{poly}}) は後から（データが示す場合に）解放。
    
4. **レンジ外は一度立ち止まる**：比が 0.05 未満／20 超は**保存不可**。推奨 0.2–5 に収めると予測が安定。
    
5. **メモに仮説の“主チャンネル”を書く**：後工程（③同定）の**整合ピル**とあわせて、機構の切り分けが速くなります。
    

---

## 5. よくある落とし穴

- **(\Delta\Delta G) の符号**：**負**が結合強化（(r_{\mathrm{assoc}}>1)）。逆に書いてしまうと解釈が真逆に。
    
- **温度の未設定**：(\Delta\Delta G\leftrightarrow r) の換算に直接効きます。装置の実温度に合わせてください。
    
- **Nb で (\beta) が動く？**：ニッキングは基本的に (K) に効くため (\beta) には入りません。**(\beta) が動くのは (r_{\mathrm{poly}}\neq1)** のとき。
    
- **ヘアピン補正の過信**：(f_{\mathrm{open}}) は**(g) のみ**に効きます。**波形帯の変化（(\beta) 依存）**は別のチャンネル。
    


---

## 6. 数式と由来（ページ下部・詳細解説用）

### 6.1 基本モデルの出発点

G と N の会合平衡と、ニッキングにより決まる飽和しきい値 (K) を考えると、Prey の生成フラックスは  
[  
\varphi_{N\triangleright N}  
= k\cdot \mathrm{pol}\cdot \frac{K_a^{GN},G,N}{K + K_a^{GN},G,N}  
= k_1\cdot \mathrm{pol}\cdot \frac{G,N}{1+b,G,N}  
]  
ここで  
[  
k_1=\frac{K_a^{GN},k}{K},\qquad b=\frac{K_a^{GN}}{K}.  
]  
ゆえに、

- **会合**（(K_a^{GN})）が変われば **(k_1) と (b) は同率に**変化。
    
- **ニッキング/飽和**（(K)）が変わっても **(k_1) と (b) は同率に**変化（向きは逆）。
    
- **見かけ速度**（(k)）は (k_1/b) にのみ現れ、**(\beta)** を通じて振る舞いを左右。
    

この構造を崩さないように、修飾や濃度変更の効果を**3つの比**で表現します：  
[  
r_{\mathrm{assoc}}=\frac{K_a^{GN}}{K_{a,\mathrm{ref}}^{GN}},\quad  
r_{\mathrm{nick}}=\frac{K'}{K_{\mathrm{ref}}},\quad  
r_{\mathrm{poly}}=\frac{k}{k_{\mathrm{ref}}}\ (\ge 1\ \text{既定は}1)  
]

### 6.2 有効パラメータへの落とし込み

[  
\boxed{  
k_1' = k_1\cdot\frac{r_{\mathrm{assoc}}\cdot r_{\mathrm{poly}}}{r_{\mathrm{nick}}},\qquad  
b' = b \cdot\frac{r_{\mathrm{assoc}}}{r_{\mathrm{nick}}}  
}  
]  
[  
\boxed{  
g' = \frac{k_1',G}{k_2,K_{m,P}},\qquad  
\beta'=\frac{\beta}{r_{\mathrm{poly}}}  
}  
]  
（ヘアピン補正ON時は (G\to G_{\mathrm{eff}}=f_{\mathrm{open}}G) を **(g')** のみに適用。）

### 6.3 会合：(\Delta\Delta G_{\mathrm{assoc}}) と (r_{\mathrm{assoc}})

換算は**温度依存**です（(R=1.987204\times10^{-3}\ \mathrm{kcal,mol^{-1},K^{-1}})、(T[{\rm K}]= {}^\circ{\rm C}+273.15)）：  
[  
\boxed{r_{\mathrm{assoc}}=\exp!\Big(-\frac{\Delta\Delta G_{\mathrm{assoc}}}{RT}\Big)}  
\quad\Longleftrightarrow\quad  
\boxed{\Delta\Delta G_{\mathrm{assoc}}=-RT\ln r_{\mathrm{assoc}}}  
]

- (\Delta\Delta G_{\mathrm{assoc}}<0)（強化）なら (r_{\mathrm{assoc}}>1)。
    
- **注意**：UIではどちらか一方だけを主入力にし、もう一方は**自動表示**。両方編集して乖離が (\pm0.2\ \mathrm{kcal/mol}) を超える場合は**警告**を表示。
    

### 6.4 ニッキング/飽和：Nb 濃度 (\rightarrow r_{\mathrm{nick}})

シンプルモード既定は**べき乗モデル**（(\alpha_{\mathrm{nick}}=1) 推奨）：  
[  
\boxed{r_{\mathrm{nick}}=\Big(\frac{\mathrm{Nb}}{\mathrm{Nb}_{\mathrm{ref}}}\Big)^{-\alpha_{\mathrm{nick}}}}  
\quad\Rightarrow\quad  
\mathrm{Nb}=\mathrm{Nb}_{\mathrm{ref}}\cdot r_{\mathrm{nick}}^{-\frac{1}{\alpha_{\mathrm{nick}}}}  
]

- 物理解釈：Nb↑ ⇒ 事実上の (K)↓ ⇒ (r_{\mathrm{nick}}<1) ⇒ (k_1',b') は**同率↑**。
    
- 参照濃度 (\mathrm{Nb}_{\mathrm{ref}}) は既定 **600 U/mL**（UIで編集可）。
    
- 詳細モードでは**Hill型**（高濃度飽和）も選択可能。
    

### 6.5 ヘアピン補正：ETSSB 濃度 (\rightarrow f_{\mathrm{open}})

**符号の取り方（重要）**：  
ここでは (\Delta G_{\mathrm{fold}}\equiv G_{\text{closed}}-G_{\text{open}})（**折りたたみ自由エネルギー**）を採用します。  
この定義なら (\Delta G_{\mathrm{fold}}) が**大きいほど“開きやすい”**（open 優勢）になります。

ETSSB 濃度 (C_{\mathrm{SSB}}) により  
[  
\Delta G_{\mathrm{fold}}'=\Delta G_{\mathrm{fold}}^{0}  
+\eta_{\mathrm{open}}\cdot \ln!\Big(1+\frac{C_{\mathrm{SSB}}}{E_{50}^{\mathrm{open}}}\Big)\quad(\eta_{\mathrm{open}}>0)  
]  
[  
\boxed{f_{\mathrm{open}}=\frac{1}{1+\exp!\big(-\frac{\Delta G_{\mathrm{fold}}'}{RT}\big)}},\qquad  
\boxed{G_{\mathrm{eff}}=f_{\mathrm{open}}\cdot G}  
]

- 直観：SSB↑ ⇒ (\Delta G_{\mathrm{fold}}')↑ ⇒ (f_{\mathrm{open}})↑ ⇒ **有効 (G)** 増（**(g')** のみが変わる）。
    
- 既定：(\Delta G_{\mathrm{fold}}^{0}=0)（シンプルでは編集不可）、(\eta_{\mathrm{open}}), (E_{50}^{\mathrm{open}}) はツールチップで説明。
    

### 6.6 速度促進（任意・既定OFF）：ETSSB 濃度 (\rightarrow r_{\mathrm{poly}})

詳細モードで有効化する場合の既定形：  
[  
\boxed{r_{\mathrm{poly}}=1+\frac{A_{\mathrm{poly}}\cdot C_{\mathrm{SSB}}}{C_{\mathrm{SSB}}+E_{50}^{\mathrm{poly}}}}  
]

- (A_{\mathrm{poly}}=0) なら既定の **OFF**（(r_{\mathrm{poly}}=1)）。
    
- 逆変換（比→濃度）は代数的に解けます：  
    [  
    C_{\mathrm{SSB}}=\frac{E_{50}^{\mathrm{poly}},(r_{\mathrm{poly}}-1)}{A_{\mathrm{poly}}-(r_{\mathrm{poly}}-1)}\quad\ (0<r_{\mathrm{poly}}<1+A_{\mathrm{poly}})  
    ]
    

---

## 7. ツールチップ本文（フォーム横に表示）

- **温度**：「(\Delta\Delta G \leftrightarrow r) の換算に使います。(T[{\rm K}]={}^{\circ}\mathrm{C}+273.15)、(R=1.987\times10^{-3}\ \mathrm{kcal,mol^{-1},K^{-1}})」
    
- **会合（比 (r_{\mathrm{assoc}})）**：「(r_{\mathrm{assoc}}=K_a^{GN}/K_{a,\mathrm{ref}}^{GN})。1より大きいと結合強化。(k_1) と (b) が**同率**で変わります」
    
- **会合（(\Delta\Delta G_{\mathrm{assoc}})）**：「(\Delta\Delta G=-RT\ln r)。**負**は強化。乖離が (\pm0.2\ \mathrm{kcal/mol}) 超なら温度・単位を確認」
    
- **ニッキング（Nb 濃度）**：「(\mathrm{Nb}_{\mathrm{ref}}) に対する倍率から (r_{\mathrm{nick}}=(\mathrm{Nb}/\mathrm{Nb}_{\mathrm{ref}})^{-\alpha}) を計算。Nb↑で (k_1,b) が**同率↑**」
    
- **ニッキング（比 (r_{\mathrm{nick}})）**：「(r_{\mathrm{nick}}=K'/K)。1未満は“しきい値低下”。(\mathrm{Nb}=\mathrm{Nb}_{\mathrm{ref}}\cdot r_{\mathrm{nick}}^{-1/\alpha})」
    
- **SSB 濃度**：「ヘアピン補正ONで (\Delta G_{\mathrm{fold}}'=\Delta G_{\mathrm{fold}}^{0}+\eta\ln(1+C/E_{50}))、(f_{\mathrm{open}}=1/(1+\exp(-\Delta G'/RT)))。**(g) のみ**スケール」
    
- **r_poly（速度）**：「既定OFF（=1）。ONにすると (\beta'=\beta/r_{\mathrm{poly}}) で**帯幅**が変化。会合・ニッキングとは独立に調整」
    

---

## 8. 変換レシピ & ワークド例

### 8.1 会合：(\Delta\Delta G_{\mathrm{assoc}}\to r_{\mathrm{assoc}})

- 条件：温度 (50^\circ\mathrm{C}\Rightarrow T=323.15\ \mathrm{K})、(RT=0.64217\ \mathrm{kcal/mol})
    
- 例：(\Delta\Delta G=-0.5\ \mathrm{kcal/mol})  
    (\Rightarrow r=\exp(0.5/0.64217)\approx \mathbf{2.178})  
    (\Rightarrow k_1'=2.178,k_1,\ b'=2.178,b)（他の比=1の場合）
    

### 8.2 ニッキング：(\mathrm{Nb}\to r_{\mathrm{nick}})

- 参照：(\mathrm{Nb}_{\mathrm{ref}}=600\ \mathrm{U/mL})、(\alpha=1)
    
- 例：(\mathrm{Nb}=1200\ \mathrm{U/mL}\Rightarrow r_{\mathrm{nick}}=(1200/600)^{-1}=0.5)  
    (\Rightarrow k_1',b') は **1/0.5=2 倍**（会合と同率・向きは逆側になりうる）
    

### 8.3 ヘアピン：SSB (\to f_{\mathrm{open}}\to G_{\mathrm{eff}})

- 仮定：(\Delta G_{\mathrm{fold}}^{0}=0.5\ \mathrm{kcal/mol})、(\eta_{\mathrm{open}}=0.8\ \mathrm{kcal/mol})、(E_{50}^{\mathrm{open}}=5\ \mu\mathrm{g/mL})、(C_{\mathrm{SSB}}=5)
    
- 計算：(\Delta G' = 0.5 + 0.8\ln(1+1)=0.5+0.8\cdot0.693=1.055)  
    (f_{\mathrm{open}}=1/(1+\exp(-1.055/0.642))\approx \mathbf{0.838})  
    (\Rightarrow G_{\mathrm{eff}}=0.838,G)、**(g')** のみ (0.838) 倍。
    

### 8.4 まとめて適用（複合）

- 仮説：(\Delta\Delta G=-0.4\Rightarrow r_{\mathrm{assoc}}\approx1.864)、(\mathrm{Nb}=2\times\Rightarrow r_{\mathrm{nick}}=0.5)、(r_{\mathrm{poly}}=1)
    
- 結果：(k_1'=k_1\cdot(1.864/0.5)=\mathbf{3.728})、(b'=\mathbf{3.728})、(\beta'=\beta)
    
- ヘアピンONで (f_{\mathrm{open}}=0.84) なら (g'\to 0.84,g')。
    

---

## 9. 効果の方向づけ（クイック表）

|入力|直接変わる比|(k_1')|(b')|(g')|(\beta')|典型的な分岐の見え方|
|---|---|--:|--:|--:|--:|---|
|(r_{\mathrm{assoc}}\uparrow)（または (\Delta\Delta G_{\mathrm{assoc}}\downarrow)）|(r_{\mathrm{assoc}})|↑|↑|↑|–|**横ずれ**（g軸方向）|
|(\mathrm{Nb}\uparrow)（または (r_{\mathrm{nick}}\downarrow)）|(1/r_{\mathrm{nick}})|↑|↑|↑|–|**横ずれ**（g軸方向；会合と同率）|
|(r_{\mathrm{poly}}\uparrow)|(r_{\mathrm{poly}})|↑（(k_1')のみ）|–|↑|↓|**帯幅変化**（(\beta) 依存）|
|ヘアピン (f_{\mathrm{open}}\uparrow)|(f_{\mathrm{open}})|–|–|↑|–|**横ずれ（縮尺）**|

**注**：(k_1') の「↑」は実際には (g') を通じて可視化されます。分岐/熱図での**横ずれ**と**帯幅変化**の見分けが要点。

---

## 10. 入力チェックの実践（ミニ検算）

1. **温度を先に**：実験温度に合わせる。
    
2. **会合は比で入力**：(\Delta\Delta G) は**自動表示**に任せて乖離（±0.2 kcal/mol）を監視。
    
3. **Nb は濃度で**：(\mathrm{Nb}_{\mathrm{ref}}) を確認し、2×/0.5×などの**直感で入力**。
    
4. **SSB はまずヘアピンのみ**：ONにして (f_{\mathrm{open}}) を確認。速度促進は必要時のみ。
    
5. **派生を確認**：(k_1',b',g',\beta') と**支配タイプ**が仮説通りか。食い違いは入力の符号・単位を再点検。
    

---

## 11. ミニFAQ（設計ページ編）

- **Q. Nb を上げたのに (\beta) が動くのはなぜ？**  
    **A.** (\beta) は (r_{\mathrm{poly}}) にのみ依存。もし (\beta) が動くなら、SSBの速度促進がONになっているか、Fitの結果で (r_{\mathrm{poly}}\neq1) を取り込んだ可能性があります。
    
- **Q. 会合とニッキング、どちらが効いているのか切り分けは？**  
    **A.** 設計では**どちらも (k_1,b) を同率に動かします**。実験後に Prey-only Fit で (k_1'/b') の比が基準の (k_1/b) と一致すれば**速度は不変**で、主効果は会合/ニッキングのどちらか（または両方）です。Nb 掃引または滴定（(K_a)）で**独立に検量**できます。
    
- **Q. ヘアピン補正と会合強化が重なると何が起きる？**  
    **A.** どちらも分岐図では**横ずれ**ですが、ヘアピンは **(g)** のみ、会合は **(g) と (k_1,b)** を通じて効きます。Fitで (k_1',b') が同率で上がっていれば会合、(f_{\mathrm{open}}) の増分はヘアピン由来。
    

---

## 12. 単位・丸め・表示ルール

- 数値は**有効3桁**を目安に表示（内部は倍精度で保持）。
    
- 比 (r_*) は**単位なし**・**正の実数**。推奨 0.2–5、許容 0.05–20。
    
- 濃度は Nb=**U/mL**、ETSSB=**µg/mL**。
    
- (\Delta\Delta G) は **kcal/mol**、温度は **°C**（内部でKへ変換）。
    
- 表示の「↑/↓・%」は Baseline 比（(\times100-100)）で算出。
    

---
