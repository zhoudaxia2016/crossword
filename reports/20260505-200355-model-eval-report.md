# 模型评测报告

日期：2026-05-05

评估范围：
- 代码目录：`models/`
- 结果目录：
  - `results/20260505-192626`
  - `results/20260505-192728`

说明：
- `20260505-192626` 使用的是 `templates/fill-grid/site-6x6`
- `20260505-192728` 使用的是 `templates/fill-grid/manual`
- 这两个 run 使用的模板集不同，难度差异很大，因此**不能把两次 run 的平均分直接当成同一基准上的横向对比**。更合理的理解是：
  - `192626` 更像“真实 6x6 题面上的可用性测试”
  - `192728` 更像“困难手工模板上的鲁棒性测试”

## 1. 代码评审

### 总表

| model | 正确性 | 性能 | 代码质量 | 简评 |
|-------|--------|------|----------|------|
| `mimo-v2.5-pro` | 8.5/10 | 9/10 | 7/10 | 当前综合最强，索引、搜索、结果变体三层都比较完整 |
| `deepseek-v4-pro` | 8/10 | 7/10 | 7.5/10 | 比较均衡，预处理和回溯控制比 flash 稳，但速度明显慢于 flash/mimo |
| `gpt-5.4` | 8/10 | 5/10 | 6.5/10 | 正确性准备最完整，但实现偏重，搜索和结果层成本高 |
| `deepseek-v4-flash` | 7/10 | 8.5/10 | 7/10 | 轻量快速，但对假名和约束处理更依赖外部输入，鲁棒性较弱 |

### 1.1 `gpt-5.4`

优点：
- 预处理最完整。显式校验 `grid + slots`，并检查白格连通、slot 越界和长度合法性，准备阶段明显更严谨。见 `models/gpt-5.4/index.js:58-130`。
- 词库索引做得比较扎实。按长度建桶，并按位置字符建倒排索引，方便交叉约束收缩 domain。见 `models/gpt-5.4/index.js:157-194`。
- 搜索策略成熟。先构建 crossing 关系，再用 MRV 选槽、domain 交集收缩、基于偏好与稀有度排序候选。见 `models/gpt-5.4/index.js:308-385`、`388-473`。
- 多题结果选择比其他模型更积极。会用 `globalUsage` 和 `seenSignatures` 主动压低重复。见 `models/gpt-5.4/index.js:513-560`。

问题：
- 搜索偏重，性能成本高。`domainForSlot` 和 `orderedDomain` 在回溯中反复重算，site-6x6 上平均耗时约 `1318.6ms/task`，明显慢于 flash/mimo。
- 代码包袱偏重。当前 benchmark 只做 `fillGrid`，但实现思路仍然是“大而全求解器”，维护成本高。
- 假名仍直接用 `Array.from(reading)` 切分。当前 benchmark 已在外部做小字正规化，所以不会立刻出错，但模型内部没有把这条规则显式收口。见 `models/gpt-5.4/index.js:133-154`。

结论：
- 如果只看“求解器完整性”，它是强的。
- 如果看当前 benchmark 的投入产出比，搜索和结果选择过重。

### 1.2 `deepseek-v4-flash`

优点：
- 结构非常轻。约束图、长度索引、候选排序、回溯都比较直接。见 `models/deepseek-v4-flash/index.js:13-58`、`83-92`、`115-187`。
- 在 site-6x6 上速度很有优势，平均约 `119.4ms/task`。
- 对软偏好做了显式排序，而不是只在结果阶段补救。见 `models/deepseek-v4-flash/index.js:63-92`。

问题：
- `indexLexicon` 直接用 `e.reading.length`，交叉比较阶段又多次使用 `Array.from(entry.reading)`。这意味着它对“假名如何切格”的定义不自洽，较强依赖 runner 预先正规化输入。见 `models/deepseek-v4-flash/index.js:37-45`、`145-165`。
- 没有模板输入级的严格校验；默认信任 `grid + slots`。
- 结果选择层较弱，主要依赖 `prefCandidates` 和签名去重，缺少更细的多题再优化。见 `models/deepseek-v4-flash/index.js:220-265`。

结论：
- 很适合做速度基线。
- 但如果未来 benchmark 再扩展输入扰动或更复杂约束，它的鲁棒性会先暴露问题。

### 1.3 `deepseek-v4-pro`

优点：
- 比 flash 多了一层显式假名正规化，小字先转大字后再建 `_cells`。见 `models/deepseek-v4-pro/index.js:1-49`。
- 会在候选很多时截断弱约束 slot 的候选集，避免搜索爆炸。见 `models/deepseek-v4-pro/index.js:127-155`。
- 回溯采用“已填交点多优先 + 长词优先”的启发式，简单但有效。见 `models/deepseek-v4-pro/index.js:190-219`。

问题：
- 为了控时，主搜索用了较多启发式裁剪和 `MAX_BACKTRACK_NODES`。这让它在难模板上会更容易直接返回空结果。见 `models/deepseek-v4-pro/index.js:176-188`、`269-270`。
- 多题生成主要依赖重复尝试，结果选择层不强。见 `models/deepseek-v4-pro/index.js:327-344`。
- 仍然有较多 magic number，例如 `60`、`20000`、`count * 50`，代码可调但不够自解释。

结论：
- 是目前比较均衡的一版。
- 比 flash 更稳，比 gpt 更轻，但还不如 mimo 完整。

### 1.4 `mimo-v2.5-pro`

优点：
- 建了更强的字符位置倒排索引 `charIndex`，候选过滤成本低。见 `models/mimo-v2.5-pro/index.js:20-57`。
- 搜索过程有显式 forward checking：放一个词后立即检查交叉邻接 slot 是否还有候选。见 `models/mimo-v2.5-pro/index.js:307-324`。
- 多题输出不只靠反复重跑，还会对已有解做局部 swap 生成 variation，结果选择层是目前最完整的。见 `models/mimo-v2.5-pro/index.js:348-478`。
- site-6x6 上平均耗时仅 `52.4ms/task`，而且合法率满。

问题：
- 代码里有较多基于时间和随机数的经验阈值，例如 `timeLimit=28000`、`2 秒无首解即放弃`。见 `models/mimo-v2.5-pro/index.js:443-456`。
- 结果选择逻辑最强，但也因此分支较多，读起来不如 flash/pro 直白。

结论：
- 当前综合最强。
- 如果要选一个继续产品化，这版最值得作为主基线。

## 2. 两次评测结果对比

### 2.1 摘要统计

#### `results/20260505-192626`（site-6x6）

| model | avgFinal | avgOverall | avgValid | avgPref | avgVariety | avgMs |
|-------|----------|------------|----------|---------|------------|-------|
| `mimo-v2.5-pro` | 0.9731 | 0.9981 | 1.0000 | 1.0000 | 0.9923 | 52.3652 |
| `deepseek-v4-flash` | 0.8930 | 0.9973 | 1.0000 | 1.0000 | 0.9893 | 119.4128 |
| `deepseek-v4-pro` | 0.8611 | 0.9981 | 1.0000 | 1.0000 | 0.9922 | 1279.7820 |
| `gpt-5.4` | 0.8178 | 0.9930 | 0.9900 | 1.0000 | 0.9919 | 1318.6080 |

特点：
- 除 `gpt-5.4` 有 1 个模板出现“returned fewer puzzles than requested”，其余模型全部满合法率。
- 这一组更像“真实现成模板上的交付能力”测试。
- 题面整体可玩性明显高于 manual run，因为模板本身更规整、更适合填。

#### `results/20260505-192728`（manual）

| model | avgFinal | avgOverall | avgValid | avgPref | avgVariety | avgMs |
|-------|----------|------------|----------|---------|------------|-------|
| `mimo-v2.5-pro` | 0.3491 | 0.3888 | 0.4000 | 0.4000 | 0.9552 | 600.3120 |
| `deepseek-v4-pro` | 0.3386 | 0.3909 | 0.4000 | 0.4000 | 0.9635 | 1370.4671 |
| `deepseek-v4-flash` | 0.3050 | 0.3590 | 0.3467 | 0.4000 | 0.9426 | 552.2043 |
| `gpt-5.4` | 0.1658 | 0.1937 | 0.2000 | 0.2000 | 0.9747 | 504.7928 |

特点：
- 这一组差异主要来自“返回空题”：
  - `deepseek-v4-flash`：15 个模板里 9 个直接 `returned no puzzles`
  - `deepseek-v4-pro`：9 个
  - `mimo-v2.5-pro`：9 个
  - `gpt-5.4`：12 个
- 说明 manual 模板集对词库和搜索更苛刻，已经不是“题面美观问题”，而是求解空间本身更容易塌掉。

### 2.2 哪次效果更好

如果按“用户实际看到的填字结果是否完整、是否能玩”来判断：

- **`20260505-192626` 明显更好**

原因：
- 20 个 template 几乎都能稳定返回完整 puzzles。
- 题面大多数可以直接试玩和人工审查。
- 从打印结果看，虽然仍有冷门词、奇怪 clue、规范化后的小字展开词形，但总体是“可交付”的。

而 `20260505-192728`：
- 大量 template 直接没有题。
- 返回成功的那些题也更多暴露出词库稀缺和困难模板的结构性问题。

但要注意：
- 这不等于“192626 的模型代码一定更好”
- 更准确地说，是**site-6x6 这套模板更接近当前词库和算法能稳定处理的分布**

### 2.3 如果只看同一次 run 内的模型效果

#### 在 `192626` 里
- 综合最好：`mimo-v2.5-pro`
- 次优：`deepseek-v4-flash`
- 再后：`deepseek-v4-pro`
- 最后：`gpt-5.4`

这里的排序既符合 `finalScore`，也符合“稳定产出完整题 + 速度”的综合表现。

#### 在 `192728` 里
- 综合最好：`mimo-v2.5-pro` 和 `deepseek-v4-pro` 接近
- `deepseek-v4-flash` 稍弱
- `gpt-5.4` 明显最弱

这里最关键的不是题面细节，而是谁能在困难模板上少返回空题。

## 3. 评测评分函数是否合理

### 3.1 当前评分定义

当前 `fillGrid` 内容分来自 `scripts/fill-score.js`：

- `overallScore`
  - `0.5 * validPuzzleRate`
  - `0.25 * preferenceFit`
  - `0.25 * crossPuzzleVariety`
  - 若 `validPuzzles.length === 0`，直接记 `0`

benchmark 总分在 `scripts/benchmark-fill-grid.js` 中再乘时间修正：

- `timeScore = fastestElapsedMs / modelElapsedMs`
- `finalScore = overallScore * (0.8 + 0.2 * timeScore)`

### 3.2 合理的地方

1. **先把合法性放到主权重中心**
- `validPuzzleRate` 占 50%，这是对的。
- 现阶段最重要的就是“能不能稳定产出合法题”，不是先拼词面美感。

2. **把时间单独作为修正项，而不是和内容分等权相加**
- 这比直接把时间当独立大项更合理。
- 至少做到了“无合法题时，再快也没用”。

3. **`crossPuzzleVariety` 作为多题生成指标是有价值的**
- 它确实能抓住“同模板总是吐同一批词”的问题。

### 3.3 不合理或不足的地方

1. **不能跨模板集直接比较 run**
- 当前分数适合在**同一组 template** 上比较模型。
- 不适合拿 `site-6x6` 和 `manual` 两次 run 的均分直接比较。
- 这个不是公式 bug，而是 benchmark 设计层面的适用范围问题。

2. **`preferenceFit` 在没有偏好时几乎恒等于 1**
- 这会让 `overallScore` 在很多 run 里退化成：
  - 主要看 `validPuzzleRate`
  - 再加一点 `crossPuzzleVariety`
- 对无偏好测试来说，这一项区分度很低。

3. **当前分数对“词是否自然”基本无感**
- 它不会惩罚：
  - 冷门词
  - 生硬词
  - clue 质量差
  - 小字展开后读起来很怪的词形
- 所以像 `site-6x6` 里那些“合法但别扭”的题，分数仍然可能很高。

4. **`timeScore` 在高合法率组里影响很大**
- 在 `192626` 里，各模型 `overallScore` 都接近 1。
- 这时排序几乎就由速度决定了。
- 如果 benchmark 目标是“评代码能力”，这未必错；但如果目标是“评题面质量”，就会偏。

5. **`crossPuzzleVariety` 高不代表题好**
- 它只能说明“多题没太重复”
- 不能说明“每道题的词更自然”

### 3.4 结论

当前评分函数：

- **适合做“工程能力 / 求解能力”评测**
- **不适合单独作为“题面质量 / 可玩性”评测**

更准确地说：
- 它很适合回答：
  - 哪个模型更稳定
  - 哪个模型更快
  - 哪个模型更少重复
- 但不够回答：
  - 哪个模型出的题更自然
  - 哪个模型的 clue 更好
  - 哪个模型更适合真实用户玩

### 3.5 建议

1. 保留当前主分结构不动：
- `validPuzzleRate`
- `preferenceFit`
- `crossPuzzleVariety`
- `timeScore`

2. 额外增加一个“题面自然度”层，不一定进自动总分：
- 可以先作为人工审查维度
- 重点看：
  - 冷门词比例
  - clue 质量
  - 小字展开后的可接受度

3. 报告里分开显示两套排名：
- `quality leaderboard`：只看 `overallScore`
- `speed-adjusted leaderboard`：看 `finalScore`

这样更容易区分：
- “内容最好”
- “综合最好”

## 最终结论

1. **从代码看**
- 当前最好的实现是 `mimo-v2.5-pro`
- `deepseek-v4-pro` 是第二梯队里最均衡的
- `gpt-5.4` 准备工作扎实，但搜索和结果层过重
- `deepseek-v4-flash` 是很好的速度 baseline，但鲁棒性弱一些

2. **从结果看**
- `20260505-192626` 的实际效果明显好于 `20260505-192728`
- 但主因不仅是模型，更是模板集难度不同

3. **从评分函数看**
- 当前评分适合评“fillGrid 工程能力”
- 不足以完整反映“最终填字游戏质量”
- 后续如果要更接近真实产品质量，必须补“词/线索自然度”维度
