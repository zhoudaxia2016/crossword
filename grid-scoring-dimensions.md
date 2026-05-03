# Grid Scoring Dimensions

本文件只定义 `grid + slots` 的评分维度边界，不定义具体公式。

目标：

- 评分优先衡量模板的可玩性
- 不是优先衡量 `fillGrid` 算法难度
- 不是优先衡量盘面审美

## Hard Gate

### `legality`

定义：

- 这个模板是否合法，能不能作为一道题存在

检查范围：

- `grid` 是 `size x size`
- 白格连通
- `slots` 不越界
- `slots` 不压黑格
- `slots` 长度满足约束
- 交叉关系自洽

规则：

- 不合法直接 `score = 0`
- 合法后才进入软评分

## Soft Dimensions

### `slotLengthQuality`

定义：

- 词槽长度本身是否顺手，既不过碎，也不过长

应该管：

- 太短槽比例
- 理想长度槽比例
- 超长槽比例

不应该管：

- `slot` 总数
- 走廊感
- 行列分布
- 盘面观感
- 交叉密度

说明：

- 这是“单个词槽长度体验”维度
- 应按 `size` 自适应，不写死固定长度区间

### `crossingQuality`

定义：

- 交叉是否足够提供反馈，但又没有过密到让题目发闷

应该管：

- 平均交叉覆盖程度
- 交叉过少的槽比例
- 交叉过满的槽比例

不应该管：

- 交叉落在第几个字符
- 图论分解性
- 盘面形状规整度
- `slot` 总数

说明：

- 这是“交叉反馈体验”维度
- 应按 `size` 自适应
- 小盘允许更高交叉密度

### `slotStructureQuality`

定义：

- 整盘槽位组织是否自然，像真实 crossword，而不是机械拼接

应该管：

- `slot` 总数是否在合理区间
- 是否有太多长走廊型槽
- 是否由少数大槽主导整盘
- 是否结构过于单一

不应该管：

- 短槽/长槽本身是否好
- 平均交叉密度是否合适
- 白格比例是否舒服

说明：

- 这是“整盘槽位组织质量”维度
- 用来区分真实题感和机械走廊盘

### `shapeBalance`

定义：

- 盘面整体形状是否明显别扭

应该管：

- 行列白格分布是否极端失衡
- 边角碎裂或低邻接白格是否过多
- 白格比例是否过空或过满

不应该管：

- 词长
- 交叉强弱
- `slot` 数量范围

说明：

- 这是辅助维度
- 只做“别扭度惩罚”
- 不做强审美判断

## Anti-Overlap Rules

为避免重复计分，维度之间必须遵守下面的边界：

1. 长度分布只在 `slotLengthQuality` 里算，不在 `slotStructureQuality` 里重复算。
2. 超长槽本身的惩罚属于 `slotLengthQuality`。
3. 长走廊主导整盘的惩罚属于 `slotStructureQuality`。
4. 交叉密度只在 `crossingQuality` 里算，不在结构项里重复算。
5. 白格比例和行列失衡只在 `shapeBalance` 里算，不在别的维度里重复算。

## Recommended Weight Shape

建议只保留 4 个软维度：

- `slotLengthQuality`
- `crossingQuality`
- `slotStructureQuality`
- `shapeBalance`

推荐方向：

- `slotLengthQuality` 和 `crossingQuality` 权重最高
- `slotStructureQuality` 次高
- `shapeBalance` 最低

## Current Intent

当前最重要的判断标准是：

1. 玩家能否较自然地开局
2. 玩家能否持续通过交叉获得反馈
3. 模板是否不像机械走廊盘
4. 盘面整体是否不过分别扭
