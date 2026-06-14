/**
 * @xifu/check-text-color
 * 评估页面上文字 DOM 渲染时的视觉可见性
 *
 * 核心能力:
 * 1. 扫描页面上所有文字 DOM 元素
 * 2. 使用 html2canvas 截取文字渲染区域
 * 3. 通过 Otsu 像素聚类分析提取文字色和背景色
 * 4. 计算 WCAG 对比度并评分
 * 5. 返回每个文字的评分、DOM 层级链和改进建议
 *
 * @packageDocumentation
 */

export type {
  TextVisibilityOptions,
  TextElementResult,
  AnalysisResult,
  RGBColor,
} from './types';

export { checkTextVisibility } from './textVisibilityChecker';
export { findTextElements, getUniqueSelector, getDOMHierarchy } from './domUtils';
export {
  contrastRatio,
  relativeLuminance,
  parseColor,
  rgbaToHex,
  scoreFromContrastRatio,
} from './colorUtils';
export { analyzeElementPixels, resetCache } from './pixelAnalyzer';

// 不提供默认导出，推荐使用命名导入: import { checkTextVisibility } from '@xifu/check-text-color'
