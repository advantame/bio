/**
 * mathExplainer.js
 *
 * Shared utilities for rendering mathematical explanations with KaTeX.
 * Provides helper functions and templates for each step's explanation section.
 */

/**
 * Render LaTeX math into an HTML element using KaTeX.
 * Falls back to plain text if KaTeX is not available.
 *
 * @param {HTMLElement} element - Target element
 * @param {string} latex - LaTeX string
 * @param {boolean} displayMode - Block (true) or inline (false)
 */
export function renderMath(element, latex, displayMode = false) {
  if (typeof katex !== 'undefined') {
    try {
      katex.render(latex, element, {
        displayMode,
        throwOnError: false,
        trust: false
      });
    } catch (err) {
      console.warn('KaTeX rendering failed:', err);
      element.textContent = latex;
    }
  } else {
    element.textContent = latex;
  }
}

/**
 * Render multiple inline math expressions in a text string.
 * Replaces $...$ with rendered KaTeX.
 *
 * @param {HTMLElement} container - Container element
 * @param {string} text - Text with $...$ delimiters
 */
export function renderInlineText(container, text) {
  if (typeof katex === 'undefined') {
    container.textContent = text;
    return;
  }

  const parts = text.split(/(\$[^$]+\$)/g);
  container.innerHTML = '';

  parts.forEach(part => {
    if (part.startsWith('$') && part.endsWith('$')) {
      const latex = part.slice(1, -1);
      const span = document.createElement('span');
      renderMath(span, latex, false);
      container.appendChild(span);
    } else {
      container.appendChild(document.createTextNode(part));
    }
  });
}

/**
 * Auto-render all math in a container after a delay (waits for KaTeX to load).
 *
 * @param {HTMLElement} container - Container to search for delimited math
 */
export function autoRenderMath(container) {
  const attempt = () => {
    if (typeof renderMathInElement !== 'undefined') {
      renderMathInElement(container, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false
      });
    } else if (typeof katex !== 'undefined') {
      // Fallback: manually parse
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
      const nodes = [];
      let node;
      while (node = walker.nextNode()) {
        nodes.push(node);
      }
      nodes.forEach(textNode => {
        const text = textNode.textContent;
        if (text.includes('$')) {
          const span = document.createElement('span');
          renderInlineText(span, text);
          textNode.replaceWith(span);
        }
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attempt);
  } else {
    setTimeout(attempt, 100);
  }
}

/**
 * Step ① (Design) explanation content
 */
export const STEP1_EXPLANATION = `
<h3>このステップについて</h3>
<p>
  ここでは、DNAナノマシンの動作条件を設計します。基本パラメータを入力し、酵素濃度や結合親和性を調整してカスタム条件を作成できます。
</p>

<h3>主要パラメータの説明</h3>

<h4>1. 結合親和性（Association）</h4>
<p>
  プライマーとテンプレートの結合強度は、自由エネルギー変化 $\\Delta\\Delta G_{\\mathrm{assoc}}$ （kcal/mol）または
  結合比率 $r_{\\mathrm{assoc}}$ で表現できます。両者は以下の関係式で結ばれています：
</p>
<p class="math-display">
  $$r_{\\mathrm{assoc}} = \\exp\\left(-\\frac{\\Delta\\Delta G_{\\mathrm{assoc}}}{RT}\\right)$$
</p>
<p>
  ここで $R = 1.987 \\times 10^{-3}$ kcal/(mol·K) は気体定数、$T$ は絶対温度（K）です。
  $\\Delta\\Delta G_{\\mathrm{assoc}} < 0$ のとき結合が安定化され（$r_{\\mathrm{assoc}} > 1$）、
  プライマー伸長反応が促進されます。
</p>

<h4>2. 酵素濃度（Enzyme Concentrations）</h4>
<p>
  システムには2種類の酵素が関与します：
</p>
<ul>
  <li><strong>Nb（ニッカーゼ）</strong>: 二本鎖DNAを切断する酵素。濃度 $[\\mathrm{Nb}]$ またはベースライン比 $r_{\\mathrm{nick}}$ で指定。</li>
  <li><strong>ETSSB（ポリメラーゼ）</strong>: DNAを伸長する酵素。濃度 $[\\mathrm{ETSSB}]$ またはベースライン比 $r_{\\mathrm{poly}}$ で指定。</li>
</ul>
<p>
  ベースライン濃度は $[\\mathrm{Nb}]_0 = 32.5$ nM、$[\\mathrm{ETSSB}]_0 = 3.7$ nM です。
  濃度比は $r_{\\mathrm{nick}} = [\\mathrm{Nb}] / [\\mathrm{Nb}]_0$ で定義されます。
</p>

<h4>3. ヘアピン補正（Hairpin Correction）</h4>
<p>
  プライマーがヘアピン構造を形成する場合、開いた状態の分率 $f_{\\mathrm{open}}$ を考慮する必要があります：
</p>
<p class="math-display">
  $$f_{\\mathrm{open}} = \\frac{1}{1 + \\exp\\left(-\\frac{\\Delta G_{\\mathrm{hairpin}}}{RT}\\right)}$$
</p>
<p>
  実効的な結合パラメータは $g' \\cdot f_{\\mathrm{open}}$ となり、ヘアピン安定化（$\\Delta G_{\\mathrm{hairpin}} < 0$）は
  振動を抑制します。
</p>

<h3>派生パラメータ</h3>
<p>
  入力から以下の無次元パラメータが計算されます：
</p>
<ul>
  <li>$k_1'$：プライマー伸長の実効速度定数</li>
  <li>$b'$：ニッカーゼ活性の寄与</li>
  <li>$g'$：結合親和性の無次元化パラメータ</li>
  <li>$\\beta'$：ポリメラーゼ活性の寄与</li>
</ul>
<p>
  これらのバランスにより、システムの動作モード（振動・飽和・平衡）が決まります。
</p>

<h3>プリセット</h3>
<ul>
  <li><strong>SI Baseline</strong>：論文のSupplementary Informationで報告されている標準条件（すべての比率 = 1）</li>
  <li><strong>Nb Titration</strong>：ニッカーゼを2倍に増量（$r_{\\mathrm{nick}} = 2$）</li>
  <li><strong>ETSSB Booster</strong>：ポリメラーゼを1.5倍に増量（$r_{\\mathrm{poly}} = 1.5$）</li>
</ul>
`;

/**
 * Step ② (Time Series) explanation content
 */
export const STEP2_EXPLANATION = `
<h3>このステップについて</h3>
<p>
  設計した条件での時間発展をシミュレートします。N（被食者）とP（捕食者）の濃度の
  時系列データを可視化し、振動の有無や周期を確認できます。
</p>

<h3>シミュレーションモデル</h3>
<p>
  システムは以下の常微分方程式系（SI S3, Eq. 3-4）で記述されます：
</p>
<p class="math-display">
  $$\\frac{dN}{dt} = \\underbrace{k_1 \\cdot \\mathrm{pol} \\cdot G \\cdot \\frac{N}{1+b \\cdot G \\cdot N}}_{\\text{被食者の増殖}} - \\underbrace{k_2 \\cdot \\mathrm{pol} \\cdot N \\cdot P}_{\\text{捕食による消費}} - \\underbrace{\\mathrm{rec} \\cdot k_N \\cdot \\frac{N}{1+\\frac{P}{K_{m,P}}}}_{\\text{分解}}$$
</p>
<p class="math-display">
  $$\\frac{dP}{dt} = \\underbrace{k_2 \\cdot \\mathrm{pol} \\cdot N \\cdot P}_{\\text{捕食者の増殖}} - \\underbrace{\\mathrm{rec} \\cdot k_P \\cdot \\frac{P}{1+\\frac{P}{K_{m,P}}}}_{\\text{分解}}$$
</p>
<p>
  ここで $N$ は被食者（prey）濃度、$P$ は捕食者（predator）濃度、$G$ はテンプレートDNA濃度です。
  $\\mathrm{pol}$ と $\\mathrm{rec}$ は酵素濃度、$k_1, k_2, k_N, k_P$ は速度定数、$b$ は飽和パラメータ、$K_{m,P}$ はミカエリス定数です。
</p>

<h3>修飾カードの補正</h3>
<p>
  Step①で設定した修飾カードは、以下のようにベースラインパラメータを補正します：
</p>
<p class="math-display">
  $$\\boxed{\\begin{aligned}
  k_1' &= k_{1,\\mathrm{base}} \\cdot \\frac{r_{\\mathrm{assoc}} \\cdot r_{\\mathrm{poly}}}{r_{\\mathrm{nick}}} \\\\
  b' &= b_{\\mathrm{base}} \\cdot \\frac{r_{\\mathrm{assoc}}}{r_{\\mathrm{nick}}} \\\\
  k_2' &= k_{2,\\mathrm{base}} \\quad (\\text{変更しない}) \\\\
  k_N', k_P', K_{m,P}' &= k_{N,\\mathrm{base}}, k_{P,\\mathrm{base}}, K_{m,P,\\mathrm{base}}
  \\end{aligned}}$$
</p>
<p>
  つまり、結合親和性（$r_{\\mathrm{assoc}}$）や酵素濃度（$r_{\\mathrm{poly}}$, $r_{\\mathrm{nick}}$）の変化は
  $k_1$ と $b$ のみに反映され、捕食効率や分解速度は変更されません。
</p>

<h3>派生指標</h3>
<ul>
  <li><strong>Peak Amplitude</strong>：振動の振幅（蛍光強度の最大値 - 最小値）</li>
  <li><strong>Period</strong>：振動周期（隣接するピーク間の時間間隔）</li>
  <li><strong>Dominance</strong>：どのパラメータが支配的か（association / polymerase / saturation / mixed）</li>
</ul>

<h3>オーバーレイ機能</h3>
<p>
  複数の条件を重ねて表示することで、パラメータ変化の影響を直接比較できます。
  ベースライン（灰色）とアクティブカード（青）の差分も数値で表示されます。
</p>

<h3>次のステップへ</h3>
<p>
  満足のいく振動パターンが得られたら、Step③で実験データとフィッティングするか、
  Step④でパラメータ空間全体を俯瞰できます。
</p>
`;

/**
 * Step ③ (Fit/Titration) explanation content
 */
export const STEP3_EXPLANATION = `
<h3>このステップについて</h3>
<p>
  実験データ（CSV）をアップロードし、モデルパラメータを同定します。
  時系列フィッティングまたは滴定曲線解析により、最適なパラメータを推定できます。
</p>

<h3>Fit（時系列フィッティング）</h3>
<p>
  prey-only近似を用いた線形化推定により、以下のパラメータを推定します：
</p>
<ul>
  <li>$k_1'$：プライマー伸長速度</li>
  <li>$b'$：ニッカーゼ寄与</li>
</ul>
<p>
  CSVフォーマット：<code>time, F_green[, F_yellow]</code>（ヘッダー行オプション）
</p>
<p>
  フィッティングでは、測定された蛍光強度 $F(t)$ と理論モデル $F_{\\mathrm{model}}(t; k_1', b', \\ldots)$ の
  残差二乗和を最小化します：
</p>
<p class="math-display">
  $$\\chi^2 = \\sum_i \\left[ F_i - F_{\\mathrm{model}}(t_i) \\right]^2$$
</p>
<p>
  オプションでHuber損失を用いることで、外れ値に対してロバストな推定が可能です。
</p>

<h3>Titration（滴定曲線解析）</h3>
<p>
  結合親和性 $K_a^{\\mathrm{GN}}$ を滴定実験から推定し、$r_{\\mathrm{assoc}}$ に変換します。
  滴定データは Green/Yellow 比の濃度依存性を表すCSV形式で提供してください。
</p>
<p>
  結合曲線は以下のように近似されます：
</p>
<p class="math-display">
  $$\\mathrm{Signal} = \\mathrm{Signal}_{\\mathrm{max}} \\cdot \\frac{[\\mathrm{Ligand}]}{K_d + [\\mathrm{Ligand}]}$$
</p>
<p>
  ここで $K_d = 1/K_a$ は解離定数です。
</p>

<h3>結果の反映</h3>
<p>
  フィッティング成功後、推定されたパラメータがアクティブカードに自動反映されます。
  信頼区間（CI）も表示されるため、パラメータの不確かさを評価できます。
</p>
`;

/**
 * Step ④ (Comparison) explanation content
 */
export const STEP4_EXPLANATION = `
<h3>このステップについて</h3>
<p>
  パラメータ空間全体を俯瞰し、振動領域や応答特性を可視化します。
  分岐図（Bifurcation）とヒートマップ（Heatmap）の2つのビューを切り替えて使用できます。
</p>

<h3>分岐図（Bifurcation）</h3>
<p>
  1つのパラメータ（例：$\\Delta\\Delta G_{\\mathrm{assoc}}$ または $r_{\\mathrm{poly}}$）を掃引し、
  定常状態の振る舞いを可視化します：
</p>
<ul>
  <li><strong>振動領域</strong>：周期解が存在し、蛍光が振動</li>
  <li><strong>平衡領域</strong>：固定点に収束し、振動なし</li>
  <li><strong>分岐点</strong>：振動が発生/消滅する境界</li>
</ul>
<p>
  縦軸は蛍光強度の最大・最小値、横軸は掃引パラメータを表します。
  振動領域では上下2本の曲線（振幅の範囲）が現れます。
</p>

<h3>ヒートマップ（Heatmap）</h3>
<p>
  2つのパラメータを同時に変化させ、応答特性（振幅・周期など）を2次元マップで表示します。
</p>
<p>
  例：横軸 $\\Delta\\Delta G_{\\mathrm{assoc}}$、縦軸 $r_{\\mathrm{poly}}$ として、
  各格子点での振幅をカラーマップで表現。
</p>
<ul>
  <li><strong>振幅マップ</strong>：振動の強さを可視化</li>
  <li><strong>周期マップ</strong>：振動周期の分布を表示</li>
  <li><strong>安定性マップ</strong>：振動領域の境界を明示</li>
</ul>

<h3>オーバーレイ比較</h3>
<p>
  複数の条件（ベースライン、アクティブ、追加オーバーレイ）を同時にプロットし、
  条件間の差異を視覚的に把握できます。表形式でも指標を並べて比較可能です。
</p>

<h3>出力</h3>
<p>
  プロットはCSV（数値データ）またはPNG（画像）形式でエクスポートできます（実装予定）。
</p>
`;
