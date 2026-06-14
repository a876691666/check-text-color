/**
 * 文字可见性检查的配置选项
 */
export interface TextVisibilityOptions {
  /**
   * CSS 选择器，限定分析的范围（默认为 document.body）
   */
  selector?: string;
  /**
   * WCAG 对比度阈值（默认 4.5，对应 AA 级普通文本）
   * - 4.5: AA 普通文本
   * - 3.0: AA 大文本 (>=18px 或 >=14px bold)
   * - 7.0: AAA 普通文本
   */
  threshold?: number;
  /**
   * 是否只分析视口内的元素
   */
  viewportOnly?: boolean;
  /**
   * 是否跳过截图分析，仅使用计算样式（速度更快）
   */
  skipScreenshot?: boolean;
  /**
   * html2canvas 截图缩放比例（默认 1）
   * 增大可提高像素分析精度，但会降低性能
   */
  captureScale?: number;
  /**
   * 最大并发截图数量（默认 3）
   */
  concurrency?: number;
  /**
   * 最小文字长度（默认 2，小于此长度的文字会被忽略）
   */
  minTextLength?: number;
  /**
   * 忽略的元素标签列表
   */
  ignoreTags?: string[];
}

/**
 * 单个文字元素的分析结果
 */
export interface TextElementResult {
  /** 文本内容（截取前 100 字符） */
  text: string;
  /** HTML 标签名 */
  tagName: string;
  /** 唯一 CSS 选择器路径 */
  selector: string;
  /** DOM 层级链（从根到当前元素） */
  domHierarchy: string[];
  /** 元素在视口中的位置和尺寸 */
  boundingRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  /** 可见性评分 0-100（越高越清晰） */
  visibilityScore: number;
  /** WCAG 对比度比值 */
  contrastRatio: number;
  /** 文字是否视觉上可分辨（对比度 >= threshold） */
  isVisible: boolean;
  /** 检测到的文字色和背景色 */
  colors: {
    textColor: string;       // 十六进制色值
    backgroundColor: string; // 十六进制色值
  };
  /** 使用的分析方法 */
  analysisMethod: 'screenshot' | 'computed-style';
  /** 建议：如果可见性差，给出改进建议 */
  suggestion?: string;
}

/**
 * 整体分析结果
 */
export interface AnalysisResult {
  /** 总分析元素数 */
  total: number;
  /** 可见性良好的元素数 */
  visible: number;
  /** 可见性差的元素数 */
  poor: number;
  /** 可见性差的元素占比 (%) */
  poorPercentage: number;
  /** 平均对比度 */
  averageContrastRatio: number;
  /** 平均评分 */
  averageScore: number;
  /** 详细结果列表 */
  elements: TextElementResult[];
  /** 分析时间戳 */
  timestamp: number;
  /** 分析耗时 (ms) */
  duration: number;
}

/**
 * 内部使用的 RGB 颜色表示
 */
export interface RGBColor {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}
