# 日语假名 Crossword Benchmark

## 目标

实现一个日语假名 crossword 生成器。benchmark 固定输入输出与评分协议，不限制内部实现。

当前 benchmark 只测试：

- 在固定模板上填词
- 满足硬约束
- 在多个模板上稳定运行

实现方式不做限制。可以自由选择索引结构、候选筛选、回溯搜索、局部搜索、启发式打分等方案。

## 交付物

提交内容为一个 JS/TS 模块，导出固定函数接口：

- `fillGrid`

其中：

- `fillGrid` 输入固定 `grid + slots`，输出多道填词结果

benchmark 通过导入模块、传入固定参数、读取返回值进行评分。

接口 contract 以仓库根目录的 `benchmark-spec.ts` 为准。

## 数据组织

benchmark 数据分成两层：

- `templates/fill-grid/...`
- `results/<timestamp>/<model>/...`

其中：

- `templates` 存固定 benchmark 输入
- `results` 存某次运行的模型输出与评分摘要

`template` 文件至少包含：

- `templateId`
- `templateKey`
- `templateName`
- `size`
- `grid`
- `slots`

`results` 文件只保存：

- `templateId`
- `templateKey`
- `templateName`
- `puzzles`
- `summary`

也就是说：

- 不在每个 result 文件里重复保存 `grid`、`slots`、词库和约束
- `templateId` 是数值型稳定主键，供 benchmark 和前端路由使用
- `templateKey` 是字符串路径键，供 template/result 文件定位与分组展示使用
- 前端或分析脚本如需显示题面，应通过 `templateKey` 去读取对应 template 文件

## 可访问范围

模型实现应只依赖以下输入来源：

- 仓库根目录的 `benchmark-spec.ts`
- 仓库根目录的 `plan.md`
- `templates/fill-grid/...`
- benchmark 运行时通过函数参数传入的：
  - `grid`
  - `slots`
  - `lexicon`
  - `gridConstraints`
  - `wordPreferences`
  - `count`

不应把以下目录当作输入的一部分：

- `scripts/`
- `results/`
- `reports/`
- `web/`
- 其他模型目录 `models/<other-model>/`

也就是说：

- benchmark 评价的是 `fillGrid` 在固定输入上的实现能力
- 不应通过读取评分脚本、历史结果、前端代码或其他模型代码来决定输出

## Benchmark 调试

`fillGrid` benchmark 支持只跑单个模型，便于本地调试自己的实现。

示例：

```bash
node scripts/benchmark-fill-grid.js --model gpt-5.4 --templates-dir templates/fill-grid/manual --minEntryLength 3 --count 5
```

说明：

- `--model <name>`: 只运行 `models/<name>/index.js`
- `--templates-dir <dir>`: 指定要跑的 template 目录，支持递归读取
- 其余参数按 `fillGrid` 输入约束传入

建议调试顺序：

1. 先只跑一个模型
2. 先用较小的 `templates` 目录定位合法性问题
3. 先看 `validPuzzleRate` 和 `firstIssue`
4. 再看 `preferenceFit` 与 `crossPuzzleVariety`

benchmark 每次运行都会把结果保存到新的时间目录，避免覆盖旧结果：

- `results/<timestamp>/<model>/`

## 输入

### 词库结构

每个词条至少包含以下字段：

{
"word": "鎌倉",
"reading": "かまくら",
"clue": "雪で作る小屋。",
"pos": "noun",
"level": "N5",
"tags": ["winter"]
}

字段说明：

- word: 词条本体
- reading: 实际填入格子的假名串
- clue: 题目提示
- pos: 词性
- level: 等级信息，例如 N5、N4
- tags: 主题标签数组

### 输入约定

- 所有填入网格的答案必须来自词库
- 同一题中不允许重复使用同一个词
- 词库测试数据中可能存在部分字段缺失或标签稀疏的情况
- 字符规范化方式由实现者决定，但必须保持一致

## 任务接口

### `fillGrid`

输入：

{
"grid": [...],
"slots": [...],
"lexicon": [...],
"gridConstraints": {
  "size": 6,
  "minEntryLength": 2,
  "maxEntryLength": 6
},
"wordPreferences": {
  "preferredTags": ["winter"],
  "preferredPos": ["noun"],
  "preferredLevels": ["N4", "N3"]
},
"count": 10
}

输出：

{
"size": 6,
"grid": [...],
"slots": [...],
"puzzles": [
  {
    "entries": [
      {
        "number": 1,
        "direction": "across",
        "row": 0,
        "col": 0,
        "word": "鎌倉",
        "reading": "かまくら",
        "clue": "..."
      }
    ]
  }
]
}

`fillGrid` 的 `count` 表示：在同一个固定 `grid + slots` 上，输出多少道不同的填词结果。

## 硬约束

填词结果必须满足以下所有硬约束：

- 网格必须是 `size x size`
- 所有非黑格必须连通
- 所有 `slots` 必须合法、不越界、不压黑格
- 所有答案必须来自输入词库
- 所有交叉位置字符必须一致
- 同一题中不得重复用词

## 评测方式

### 1. `validPuzzleRate`

先判断每一道填词结果是否合法：

- 满足全部硬约束：记为有效
- 任一硬约束不满足：记为无效

`validPuzzleRate` 定义为：

- 合法题目数 / 请求输出题目数

例如要求输出 5 道题，只有 3 道合法，则：

- `validPuzzleRate = 3 / 5 = 0.6`

### 2. `preferenceFit`

仅对合法题统计软性要求贴合度。

软性要求不用于判断合法性，只用于额外评分。可包括：

- JLPT 偏好贴合度
- 词性偏好贴合度
- 主题偏好贴合度
- tags 偏好贴合度

这部分只评“贴不贴要求”，不评主观题感。

### 3. `crossPuzzleVariety`

`fillGrid` 输出多道题时，需要额外统计跨题重复率。

关注点：

- 多道题之间的单词集合是否高度重复
- 同一模板下是否总是反复产出相似词集

`crossPuzzleVariety` 越高，表示多道题之间重复越少。

可基于这些统计计算：

- 平均两两词集重叠率
- 全局单词复用率

### 4. `overallScore`

`overallScore` 是 `fillGrid` 的总分。

当前评分组成是：

- 50% `validPuzzleRate`
- 25% `preferenceFit`
- 25% `crossPuzzleVariety`

如果没有任何合法题，则：

- `overallScore = 0`

benchmark 输出中的字段名与这里保持一致：

- `overallScore`
- `validPuzzleRate`
- `preferenceFit`
- `crossPuzzleVariety`

### 5. 时间评分

benchmark runner 会对每个 template 额外统计运行时间：

- `elapsedMs`: 该模型完成这个 template 的实际耗时

时间不单独替代内容分，而是作为最终分的修正项。

时间分不使用固定的绝对阈值，而是在同一个 template 内做相对比较：

- `timeScore = fastestElapsedMs / modelElapsedMs`
- 上限为 `1`

也就是说：

- 同一个 template 上最快的模型，`timeScore = 1`
- 更慢的模型，`timeScore` 会按比例下降

这样可以避免随着 `size` 变大，所有模型的时间分一起塌缩，导致时间项失真。

### 6. `finalScore`

`finalScore` 是 benchmark 排行使用的最终分。

当前计算方式是：

- `finalScore = overallScore * (0.8 + 0.2 * timeScore)`

含义：

- 内容正确性和结果质量仍然是主导
- 时间最多影响约 20%
- 如果 `overallScore = 0`，则 `finalScore = 0`

benchmark 输出中的主要评分字段为：

- `finalScore`
- `overallScore`
- `validPuzzleRate`
- `preferenceFit`
- `crossPuzzleVariety`
- `elapsedMs`
- `timeScore`
