1. シミュレーションとは、その意義
自然や生命現象は、複雑な分子反応から成り立ちながらも、しばしば普遍的な数理構造を示す。
この系では振動現象が起こっており、見るからに背後に数理構造がある。


2. PP振動系の数理モデルの説明


連立常微分方程式で表されます
<p class="math-display">
  $$\\frac{dN}{dt} = \\underbrace{k_1 \\cdot \\mathrm{pol} \\cdot G \\cdot \\frac{N}{1+b \\cdot G \\cdot N}}_{\\text{被食者の増殖}} - \\underbrace{k_2 \\cdot \\mathrm{pol} \\cdot N \\cdot P}_{\\text{捕食による消費}} - \\underbrace{\\mathrm{rec} \\cdot k_N \\cdot \\frac{N}{1+\\frac{P}{K_{m,P}}}}_{\\text{分解}}$$
</p>
<p class="math-display">
  $$\\frac{dP}{dt} = \\underbrace{k_2 \\cdot \\mathrm{pol} \\cdot N \\cdot P}_{\\text{捕食者の増殖}} - \\underbrace{\\mathrm{rec} \\cdot k_P \\cdot \\frac{P}{1+\\frac{P}{K_{m,P}}}}_{\\text{分解}}$$
</p>

それぞれのパラメータの説明




※詳細は元論文をご覧ください

3. 作ったツールの紹介





4.
