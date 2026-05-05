# Crossword 产品调研报告

- 时间：2026-05-05
- 对象：
  - Crossword Compiler
  - クロスワード.jp

## 1. 调研目标

本次调研主要回答 4 个问题：

1. 现有成熟 crossword 产品如何组织“生成、编辑、发布、作答”全流程。
2. 哪些能力值得当前项目直接借鉴。
3. 两个站点各自偏向什么定位。
4. 如果把当前项目做成可推广、可商业化产品，产品形态更应该往哪边走。

## 2. 站点概览

### 2.1 Crossword Compiler

官网：
- https://www.crossword-compiler.com/features.html

相关页面：
- 词汇题 / freeform：https://www.crossword-compiler.com/vocab.html
- 报刊式 crossword：https://www.crossword-compiler.com/newspaper.html
- Web 发布：https://www.crossword-compiler.com/interactive.html

整体定位：
- 更像“专业出题工具 / crossword studio”
- 强调：
  - 题型丰富
  - 专业 grid filling
  - clue 数据库
  - 自动生成 + 人工控制
  - 导出 / Web 发布

它不是单纯的在线小游戏，而是完整的制题软件和发布工具。

### 2.2 クロスワード.jp

官网：
- https://xn--pckua2c4hla2f.jp/

相关页面：
- 作成入口 / 规则：https://xn--pckua2c4hla2f.jp/%E5%95%8F%E9%A1%8C%E4%BD%9C%E6%88%90/
- 下载与印刷：https://xn--pckua2c4hla2f.jp/%E3%83%91%E3%82%BA%E3%83%AB%E9%9B%91%E5%AD%A6%E5%AD%A6%E7%BF%92%E3%83%A1%E3%83%A2/%E3%82%AF%E3%83%AD%E3%82%B9%E3%83%AF%E3%83%BC%E3%83%89%E5%95%8F%E9%A1%8C%E3%81%AE%E3%83%80%E3%82%A6%E3%83%B3%E3%83%AD%E3%83%BC%E3%83%89%E5%8F%8A%E3%81%B3%E3%80%81%E5%8D%B0%E5%88%B7%E4%BD%BF%E7%94%A8/

整体定位：
- 更像“内容站 + 题库站 + 在线作答/打印站”
- 强调：
  - 大量现成题库
  - 尺寸分类
  - 难度分类
  - 在线作答
  - PDF 下载 / 打印
  - 用户创建和嵌入

它更接近流量型产品和内容平台，而不是纯专业编辑器。

## 3. 关键能力对比

### 3.1 题目生成工作流

#### Crossword Compiler

特点：
- 新建题目时就明确引导：
  - 选题型
  - 选大小
  - 选 grid pattern
  - 选词表
  - 自动生成
- 支持：
  - 自动 fill
  - theme fill
  - 生成多个 possible fills 再挑选
  - 人工接管部分填充

参考意义：
- 非常值得借鉴。
- 说明成熟产品不是“一键出最终结果”，而是“先给候选，再让人挑”。

#### クロスワード.jp

特点：
- 更强调：
  - 用户选尺寸
  - 在线生成 / 作成
  - 产出可下载或嵌入的题
- 对普通用户更简单，偏轻工作流。

参考意义：
- 适合参考“网页入口怎么简化”。
- 不适合直接作为专业制题流程模板。

### 3.2 Grid / Fill 能力

#### Crossword Compiler

公开特征：
- 提供标准 grid patterns
- 提供随机 grid pattern generator
- 提供强力 filler
- 支持 theme word placement
- 有 “Grid Insight” 分析不可填区域、重复词、强制字母等

参考意义：
- 对你当前项目非常有价值。
- 你现在最接近它的，是：
  - grid scoring
  - fill benchmark
  - 模板生成 / 填词分层
- 后续值得补：
  - 可填性分析
  - 人能理解的失败原因
  - 模板库管理

#### クロスワード.jp

公开特征：
- 能大规模批量产题
- 有明确日式 crossword 规则说明
- 小字规则非常清楚：
  - 小字按大字处理
  - 例如 `ッ -> ツ`、`ィ -> イ`
- 对黑格规则、连通性、重复词等有明确口径

参考意义：
- 对你的日语假名项目更直接。
- 特别是：
  - 日式规则口径
  - ひらがな / カタカナ输入约束
  - 小字正规化策略

### 3.3 词库 / clue 数据管理

#### Crossword Compiler

特点：
- 明确把词表和 clue 数据库产品化
- 支持：
  - 词表编辑
  - clue 数据库
  - clue 重用
  - import/export
  - AI clue generation

参考意义：
- 这是你后续商业化必须补的核心能力。
- 如果没有可管理的词库和 clue 层，产品很难升级成稳定工具。

#### クロスワード.jp

特点：
- 更偏内容站，不强调用户直接管理 clue database
- 题目内容和分类体系更像平台内置资产

参考意义：
- 适合作为题库站参考
- 不适合作为编辑器后端能力的主要参考

### 3.4 Web 发布和作答体验

#### Crossword Compiler

特点：
- 提供交互式 web publishing
- 支持：
  - Reveal
  - Check
  - Pencil
  - Submit
  - Save
  - clue 布局调整
  - 手机适配
  - 多语言
  - 自定义按钮和颜色

参考意义：
- 对当前前端很有帮助。
- 尤其是：
  - 答题控制按钮设计
  - responsive solving UI
  - 作为嵌入组件输出

#### クロスワード.jp

特点：
- 在线可作答
- 有打印 / PDF 下载
- 有作成与网站嵌入入口
- 更偏“内容消费 + 基础交互”

参考意义：
- 适合参考：
  - 在线题面交互
  - 印刷场景
  - 分享 / 下载链路

## 4. 两个站点的本质差异

### Crossword Compiler 更像：

- 专业工具
- 制题软件
- 编辑器 + 发布器

它卖的是“生产力”。

### クロスワード.jp 更像：

- 内容平台
- 题库平台
- 在线玩题和打印下载平台

它卖的是“题目内容和使用场景”。

## 5. 对当前项目的直接启发

### 5.1 应该优先借鉴 Crossword Compiler 的部分

1. 生成流程分阶段
   - 先给多个 grid / fill 候选
   - 再由人选

2. 模板库与 grid pattern 管理
   - grid 是资产，不只是算法中间产物

3. fillability / 失败分析
   - 告诉用户为什么这个模板不行
   - 告诉用户为什么这个 fill 差

4. 词库与 clue 管理
   - 后续商业化必须有

5. Web export / embed
   - 产品形态上非常关键

### 5.2 应该优先借鉴 クロスワード.jp 的部分

1. 日式规则口径
   - 黑格规则
   - 连通规则
   - 重复词规则
   - 小字转大字规则

2. 在线作答与打印并存
   - 网页解题
   - PDF/打印

3. 尺寸分类和内容站结构
   - 适合后续做题库页和入口页

4. “问题集 / 教材 / 免费下载”的场景表达
   - 对教育产品化有帮助

## 6. 对你当前项目的产品建议

如果目标是做成熟、可推广、可赚钱的项目，我建议不是模仿其中一个，而是：

- **底层能力学 Crossword Compiler**
- **面向用户的交付形态学 クロスワード.jp**

也就是：

### 底层
- 强调：
  - 模板生成
  - 填词求解
  - 质量分析
  - 候选对比
  - 词库 / clue 资产管理

### 上层
- 强调：
  - 在线试玩
  - 打印下载
  - 分享链接
  - 网站嵌入
  - 尺寸 / 难度 /主题浏览

## 7. 对 roadmap 的具体建议

### 短期建议

1. 把当前生成器继续做好
   - grid 质量
   - fill 质量
   - 失败解释

2. 前端继续补 solving UX
   - clue tab
   - check / reveal
   - 打印态

3. 把 benchmark 保留下来
   - 这是你的差异化资产

### 中期建议

1. 增加 Studio 模式
   - 一次生成多个候选
   - 挑一个继续编辑

2. 增加词库管理
   - 标签
   - JLPT
   - 词性
   - clue 维护

3. 增加导出
   - PDF
   - 图片
   - 网页嵌入

### 长期建议

1. 做成 SaaS
   - 免费试玩
   - Pro 导出 / 批量生成
   - 教师 / 机构版

2. 把 benchmark 产品化
   - 不只是自己测试模型
   - 还可以做成对外可用的评测工具

## 8. 结论

这两个站点给你的参考方向并不相同：

- Crossword Compiler 证明了：
  - crossword 生成和发布可以做成专业工具
  - 真正值钱的是编辑、分析、词库和发布能力

- クロスワード.jp 证明了：
  - 网页形式完全成立
  - 在线作答、打印下载、题库化、嵌入化都有真实需求
  - 日语 crossword 的规则口径可以非常明确

对当前项目最合理的路线是：

- **算法与工具层：往 Crossword Compiler 靠**
- **内容展示与消费层：往 クロスワード.jp 靠**

这样才能同时兼顾：
- 题目生成质量
- 用户可玩性
- 商业化空间

## 9. 参考链接

- Crossword Compiler Features  
  https://www.crossword-compiler.com/features.html

- Crossword Compiler Vocabulary / Freeform  
  https://www.crossword-compiler.com/vocab.html

- Crossword Compiler Newspaper-style puzzles  
  https://www.crossword-compiler.com/newspaper.html

- Crossword Compiler Web Publishing  
  https://www.crossword-compiler.com/interactive.html

- クロスワード.jp 首页  
  https://xn--pckua2c4hla2f.jp/

- クロスワード.jp 作成流程  
  https://xn--pckua2c4hla2f.jp/%E5%95%8F%E9%A1%8C%E4%BD%9C%E6%88%90/

- クロスワード.jp 下载与印刷  
  https://xn--pckua2c4hla2f.jp/%E3%83%91%E3%82%BA%E3%83%AB%E9%9B%91%E5%AD%A6%E5%AD%A6%E7%BF%92%E3%83%A1%E3%83%A2/%E3%82%AF%E3%83%AD%E3%82%B9%E3%83%AF%E3%83%BC%E3%83%89%E5%95%8F%E9%A1%8C%E3%81%AE%E3%83%80%E3%82%A6%E3%83%B3%E3%83%AD%E3%83%BC%E3%83%89%E5%8F%8A%E3%81%B3%E3%80%81%E5%8D%B0%E5%88%B7%E4%BD%BF%E7%94%A8/
