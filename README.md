# @xifu/check-text-color

评估页面上每个文字 DOM 渲染时的视觉可见性（视觉层面），基于 **html2canvas 像素分析** 和 **WCAG 对比度算法**。

## 特性

- 🔍 **自动扫描** — 扫描页面上所有文字 DOM 元素并逐一分析
- 🎨 **双引擎分析**
  - **计算样式模式** — 基于 `getComputedStyle` + DOM 树背景追溯，速度快
  - **截图模式** — 基于 html2canvas 截图 + Otsu 像素聚类，精准提取文字色和背景色
- 📊 **WCAG 评分** — 计算符合 WCAG 2.1 标准的对比度比值，并映射为 0-100 分
- 🧬 **DOM 层级链** — 输出每个元素的完整 DOM 路径，精准定位问题
- 💡 **改进建议** — 对可见性差的元素自动生成颜色调整建议
- ⚡ **并发控制** — 可配置截图并发数，平衡性能与精度
- 🎯 **灵活配置** — 支持阈值、视口筛选、标签忽略等

## 安装

```bash
npm install @xifu/check-text-color
```

## 快速开始

```ts
import { checkTextVisibility } from '@xifu/check-text-color';

const result = await checkTextVisibility();

console.log(`分析完成: ${result.total} 个元素`);
console.log(`可见性良好: ${result.visible} 个`);
console.log(`可见性差: ${result.poor} 个`);
console.log(`平均对比度: ${result.averageContrastRatio}`);
console.log(`平均评分: ${result.averageScore}`);

result.elements.forEach(el => {
  if (!el.isVisible) {
    console.warn(`[低可见性] ${el.tagName} ${el.text}`);
    console.warn(`  对比度: ${el.contrastRatio}:1`);
    console.warn(`  路径: ${el.selector}`);
    if (el.suggestion) console.warn(`  建议: ${el.suggestion}`);
  }
});
```

## API

### `checkTextVisibility(options?)`

核心分析函数，返回一个 `AnalysisResult` 对象。

#### 配置选项（`TextVisibilityOptions`）

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `selector` | `string` | `document.body` | CSS 选择器，限定分析范围 |
| `threshold` | `number` | `4.5` | WCAG 对比度阈值（4.5: AA 普通文本 / 3.0: AA 大文本 / 7.0: AAA） |
| `viewportOnly` | `boolean` | `false` | 是否只分析视口内的元素 |
| `skipScreenshot` | `boolean` | `false` | 是否跳过截图分析，仅使用计算样式 |
| `captureScale` | `number` | `1` | html2canvas 截图缩放比例 |
| `concurrency` | `number` | `3` | 最大并发截图数量 |
| `minTextLength` | `number` | `2` | 最小文字长度，小于此长度的文字被忽略 |
| `ignoreTags` | `string[]` | — | 忽略的元素标签列表，默认忽略 `['script', 'style', 'noscript']` |

#### 返回值（`AnalysisResult`）

```ts
interface AnalysisResult {
  total: number;              // 总分析元素数
  visible: number;            // 可见性良好的元素数
  poor: number;               // 可见性差的元素数
  poorPercentage: number;     // 可见性差的元素占比 (%)
  averageContrastRatio: number; // 平均对比度
  averageScore: number;       // 平均评分 (0-100)
  elements: TextElementResult[]; // 详细结果列表
  timestamp: number;          // 分析时间戳
  duration: number;           // 分析耗时 (ms)
}
```

#### 单个元素结果（`TextElementResult`）

```ts
interface TextElementResult {
  text: string;               // 文本内容（截取前 100 字符）
  tagName: string;            // HTML 标签名
  selector: string;           // 唯一 CSS 选择器路径
  domHierarchy: string[];     // DOM 层级链（从根到当前元素）
  boundingRect: { x, y, width, height } | null; // 元素位置和尺寸
  visibilityScore: number;    // 可见性评分 0-100
  contrastRatio: number;      // WCAG 对比度比值
  isVisible: boolean;         // 是否视觉上可分辨
  colors: {
    textColor: string;        // 文字色（十六进制）
    backgroundColor: string;  // 背景色（十六进制）
  };
  analysisMethod: 'screenshot' | 'computed-style'; // 分析方法
  suggestion?: string;        // 改进建议
}
```

### 其他导出工具

```ts
import {
  checkTextVisibility,
  findTextElements,
  getUniqueSelector,
  getDOMHierarchy,
  contrastRatio,
  relativeLuminance,
  parseColor,
  rgbaToHex,
  scoreFromContrastRatio,
  analyzeElementPixels,
  resetCache,
} from '@xifu/check-text-color';
```

| 导出 | 说明 |
|------|------|
| `findTextElements` | 查找页面中所有文字元素 |
| `getUniqueSelector` | 为元素生成唯一 CSS 选择器 |
| `getDOMHierarchy` | 获取元素完整 DOM 层级链 |
| `contrastRatio` | 计算两个颜色的 WCAG 对比度 |
| `relativeLuminance` | 计算颜色的相对亮度 |
| `parseColor` | 解析 CSS 颜色字符串为 RGBColor |
| `rgbaToHex` | RGBColor 转十六进制字符串 |
| `scoreFromContrastRatio` | 对比度比值转评分 (0-100) |
| `analyzeElementPixels` | 对元素进行像素级截图分析 |
| `resetCache` | 重置像素分析缓存 |

## 分析原理

### 1. 计算样式模式（默认）

```
文字色  → window.getComputedStyle().color  （浏览器实际渲染色）
背景色  → 向上追溯 DOM 树，找到第一个非透明背景
对比度  → WCAG 相对亮度公式 → 对比度比值 → 0-100 分
```

- **优点**: 速度快，无需截图
- **局限**: 无法处理渐变/图片背景

### 2. 截图模式（`skipScreenshot: false`）

```
截图    → html2canvas 截取元素渲染区域
聚类    → Otsu 算法将像素二分类（文字像素 / 背景像素）
提取    → 分别计算两组像素的平均色
对比度  → 与计算样式模式相同
```

- **优点**: 精准处理渐变、图片等复杂背景
- **局限**: 性能开销较大，依赖 html2canvas

### WCAG 对比度标准

| 级别 | 普通文本 | 大文本 (≥18px 或 ≥14px bold) |
|------|---------|---------------------------|
| AA   | ≥ 4.5:1 | ≥ 3.0:1 |
| AAA  | ≥ 7.0:1 | ≥ 4.5:1 |

### 评分映射

对比度比值通过对数映射到 0-100 分：

```
score = log(ratio) / log(21) × 100
```

- WCAG AA（4.5）≈ **70 分**
- WCAG AAA（7.0）≈ **80 分**
- 最大对比度 21:1 = **100 分**

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器（Demo）
npm run dev

# 构建库
npm run build

# 构建 Demo 页面
npm run build:demo

# 类型检查
npm run typecheck
```

## 技术栈

- **TypeScript** — 类型安全
- **Vite** — 构建工具
- **html2canvas** — 像素级截图分析
- **Otsu 阈值算法** — 像素聚类二分类

## License

MIT
