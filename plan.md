# 日语假名 Crossword Benchmark

## 目标

实现一个日语假名 crossword 生成器。benchmark 固定输入输出与评分协议，不限制内部实现。

系统必须能够：

- 生成网格模板
- 在固定模板上填词
- 端到端生成完整题目
- 满足硬约束
- 在多个任务上稳定运行

实现方式不做限制。可以自由选择模板生成、模板筛选、回溯搜索、局部搜索、启发式打分、索引结构等方案。

## 交付物

提交内容为一个 JS/TS 模块，导出固定函数接口：

- `generateGrid`
- `fillGrid`
- `generateCrossword`

其中：

- `generateGrid` 输出 `grid + slots`
- `fillGrid` 输入固定 `grid + slots`，输出多道填词结果
- `generateCrossword` 输出完整题目

benchmark 通过导入模块、传入固定参数、读取返回值进行评分。

接口 contract 以仓库根目录的 `benchmark-spec.ts` 为准。

## Benchmark 调试

`fillGrid` benchmark 支持只跑单个模型，便于本地调试自己的实现。

示例：

```bash
node scripts/benchmark-fill-grid.js --model gpt-5.4 --grids-dir grids/manual --minEntryLength 3 --count 5
```

说明：

- `--model <name>`: 只运行 `models/<name>/index.js`
- `--grids-dir <dir>`: 指定要跑的模板目录
- 其余参数按 `fillGrid` 输入约束传入

建议调试顺序：

1. 先只跑一个模型
2. 先用较小的 `grids` 目录定位合法性问题
3. 先看 `validPuzzleRate` 和 `firstIssue`
4. 再看 `preferenceFit` 与 `crossPuzzleVariety`

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

### `generateGrid`

输入：

{
"gridConstraints": {
  "size": 6,
  "minEntryLength": 2,
  "maxEntryLength": 6
}
}

输出：

{
"size": 6,
"grid": [
  [".", ".", "#", ".", ".", "."]
],
"slots": [
  {
    "direction": "across",
    "row": 0,
    "col": 0,
    "length": 2
  }
]
}

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
"wordConstraints": {
  "maxJlptLevel": "N3",
  "allowedPos": ["noun"],
  "tags": ["winter"]
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

生成或填词结果必须满足以下所有硬约束：

- 网格必须是 `size x size`
- 所有非黑格必须连通
- 所有 `slots` 必须合法、不越界、不压黑格
- 所有答案必须来自输入词库
- 所有答案必须满足硬过滤条件
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

- 主题偏好贴合度
- 词性偏好贴合度
- 等级偏好贴合度

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
