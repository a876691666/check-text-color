import type { TextVisibilityOptions, AnalysisResult, TextElementResult, RGBColor } from './types';
import { findTextElements, getUniqueSelector, getDOMHierarchy, getEffectiveBackgroundColor, hasGradientOrImageBackground } from './domUtils';
import { analyzeElementPixels, sampleBackgroundFromParent } from './pixelAnalyzer';
import {
  parseColor,
  contrastRatio,
  rgbaToHex,
  blendAlpha,
  scoreFromContrastRatio,
  generateSuggestion,
} from './colorUtils';

/**
 * 构建单个元素的结果对象（公共逻辑）
 */
function buildResult(
  element: Element,
  text: string,
  textColor: RGBColor,
  bgColor: RGBColor,
  contrastRatioVal: number,
  method: 'screenshot' | 'computed-style'
): TextElementResult {
  const score = scoreFromContrastRatio(contrastRatioVal);
  const textHex = rgbaToHex(textColor);
  const bgHex = rgbaToHex(bgColor);

  return {
    text: text.slice(0, 100),
    tagName: element.tagName.toLowerCase(),
    selector: getUniqueSelector(element),
    domHierarchy: getDOMHierarchy(element),
    boundingRect: (() => {
      try {
        const r = element.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      } catch {
        return null;
      }
    })(),
    visibilityScore: score,
    contrastRatio: Math.round(contrastRatioVal * 100) / 100,
    isVisible: contrastRatioVal >= 4.5,
    colors: { textColor: textHex, backgroundColor: bgHex },
    analysisMethod: method,
    suggestion: generateSuggestion(contrastRatioVal, textHex, bgHex),
  };
}

/**
 * 核心分析函数——基于 DOM 计算样式 + 背景追溯
 *
 * 逻辑：
 * 1. 文字色：从 getComputedStyle().color 获取（浏览器实际渲染色）
 * 2. 背景色：从 getEffectiveBackgroundColor() 获取（向上追溯 DOM 树直到找到非透明背景）
 * 3. 计算 WCAG 对比度并评分
 *
 * 这是最可靠的方式，因为 DOM 树追溯能正确获取父级的背景色，
 * 而文字色直接从计算样式读取就是浏览器实际渲染的颜色。
 *
 * 对于渐变/图片背景的情况，此方法无法获得准确的单一背景色，
 * 需要调用 analyzeWithScreenshot 进行像素级分析补充。
 */
function analyzeByDOM(element: Element, text: string): TextElementResult {
  const style = window.getComputedStyle(element);

  // 文字色直接从计算样式读取（浏览器渲染的真实颜色）
  const textColor = parseColor(style.color) || { r: 0, g: 0, b: 0, a: 1 };

  // 检测是否有渐变/图片背景祖先
  const hasGradientBg = hasGradientOrImageBackground(element);

  let bgColor: RGBColor;
  let ratio: number;

  if (hasGradientBg) {
    // 对于渐变背景，无法通过 DOM 追溯得到准确单一色值
    // 暂时用白色作为占位，后续截图分析会覆盖此结果
    bgColor = { r: 255, g: 255, b: 255, a: 1 };
    const finalTextColor = textColor.a < 1 ? blendAlpha(textColor, bgColor) : textColor;
    ratio = contrastRatio(finalTextColor, bgColor);
    // 标记为需要截图分析的边界情况
    const result = buildResult(element, text, finalTextColor, bgColor, ratio, 'computed-style');
    // 特殊标记——用 suggestion 提示实际需要通过截图分析
    result.suggestion = '元素位于渐变/图片背景之上，需要使用截图模式分析';
    return result;
  }

  // 背景色通过 DOM 树向上追溯（处理透明背景继承）
  const bgColorStr = getEffectiveBackgroundColor(element);
  bgColor = parseColor(bgColorStr) || { r: 255, g: 255, b: 255, a: 1 };

  // 如果文字颜色有透明度，与背景色进行 alpha 混合
  const finalTextColor = textColor.a < 1 ? blendAlpha(textColor, bgColor) : textColor;
  ratio = contrastRatio(finalTextColor, bgColor);

  return buildResult(element, text, finalTextColor, bgColor, ratio, 'computed-style');
}

/**
 * 查找最近的含有渐变/图片背景的祖先元素
 */
function findGradientAncestor(element: Element): Element | null {
  let current: Element | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (style.backgroundImage !== 'none') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * 截图辅助分析——用于处理渐变/图片背景
 *
 * 对于元素自身有背景的 → 直接截取元素本身进行像素聚类
 * 对于元素在渐变背景上的 → 截取渐变祖先元素，采样对应区域得到背景色
 */
async function analyzeWithScreenshot(
  element: Element,
  text: string,
  scale: number
): Promise<TextElementResult> {
  const style = window.getComputedStyle(element);

  // 文字色统一从计算样式读取（最准确）
  const textColor = parseColor(style.color) || { r: 0, g: 0, b: 0, a: 1 };

  // 检查元素自身是否有背景
  const selfBg = style.backgroundColor;
  const hasOwnBackground =
    selfBg !== 'transparent' &&
    selfBg !== 'rgba(0, 0, 0, 0)' &&
    selfBg !== 'rgba(0,0,0,0)';

  // 检查是否有渐变/图片背景祖先
  const gradientAncestor = findGradientAncestor(element);

  try {
    if (hasOwnBackground) {
      // Case 1: 元素有自己的背景 → 直接截图分析
      const pixelResult = await analyzeElementPixels(element, scale);
      if (pixelResult && pixelResult.contrastRatio > 1.5) {
        const bgColor = {
          r: pixelResult.backgroundColor.r,
          g: pixelResult.backgroundColor.g,
          b: pixelResult.backgroundColor.b,
          a: 1,
        };
        const finalTextColor = textColor.a < 1 ? blendAlpha(textColor, bgColor) : textColor;
        const ratio = contrastRatio(finalTextColor, bgColor);
        return buildResult(element, text, finalTextColor, bgColor, ratio, 'screenshot');
      }
    }

    if (gradientAncestor) {
      // Case 2: 元素在渐变/图片背景上 → 截取祖先，采样对应区域
      try {
        const rect = element.getBoundingClientRect();
        const sampledBg = await sampleBackgroundFromParent(
          gradientAncestor,
          { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          scale
        );

        if (sampledBg) {
          const finalTextColor = textColor.a < 1 ? blendAlpha(textColor, sampledBg) : textColor;
          const ratio = contrastRatio(finalTextColor, sampledBg);
          return buildResult(element, text, finalTextColor, sampledBg, ratio, 'screenshot');
        }
      } catch (error) {
        console.warn('[check-text-color] 渐变背景采样失败:', error);
      }
    }
  } catch (error) {
    console.warn('[check-text-color] 截图分析失败:', error);
  }

  // 兜底：使用 DOM 分析
  return analyzeByDOM(element, text);
}

/**
 * 带并发限制的异步任务调度器
 */
async function asyncPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();

  for (const [index, item] of items.entries()) {
    const p = fn(item).then((result) => {
      results[index] = result;
    });
    executing.add(p);

    const cleanup = () => executing.delete(p);
    p.then(cleanup, cleanup);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * 检查页面中所有文字元素的视觉可见性
 *
 * @param options - 配置选项
 * @returns 分析结果
 *
 * @example
 * ```typescript
 * import { checkTextVisibility } from 'check-text-color';
 *
 * const result = await checkTextVisibility({
 *   selector: '#content',
 *   viewportOnly: true,
 * });
 *
 * console.log(`分析完成: ${result.total} 个元素, ${result.poor} 个可见性差`);
 * ```
 */
export async function checkTextVisibility(
  options: TextVisibilityOptions = {}
): Promise<AnalysisResult> {
  const startTime = performance.now();
  const threshold = options.threshold ?? 4.5;
  const captureScale = options.captureScale ?? 1;
  const concurrency = options.concurrency ?? 3;
  const skipScreenshot = options.skipScreenshot ?? false;

  // 确定分析范围
  const root = options.selector
    ? document.querySelector(options.selector)
    : document.body;

  if (!root) {
    throw new Error(
      `[check-text-color] 未找到选择器匹配的元素: ${options.selector}`
    );
  }

  // 查找所有文字元素
  const textNodes = findTextElements(root, options);

  if (textNodes.length === 0) {
    return {
      total: 0,
      visible: 0,
      poor: 0,
      poorPercentage: 0,
      averageContrastRatio: 0,
      averageScore: 0,
      elements: [],
      timestamp: Date.now(),
      duration: 0,
    };
  }

  // 分析每个元素
  let elementResults: TextElementResult[];

  if (skipScreenshot) {
    // 仅使用 DOM 计算样式（快速模式，始终准确）
    elementResults = textNodes.map(({ element, text }) =>
      analyzeByDOM(element, text)
    );
  } else {
    // 默认模式：DOM 分析为主，截图作为增强
    // 对渐变背景上的元素、或对比度差的元素进行截图验证
    elementResults = await asyncPool(
      textNodes,
      concurrency,
      async ({ element, text }) => {
        // 先使用 DOM 分析（立即返回结果）
        const domResult = analyzeByDOM(element, text);

        // 需要截图进一步检查的情况：
        const needsScreenshot =
          // 1) 在渐变/图片背景上（DOM 无法准确取色）
          hasGradientOrImageBackground(element) ||
          // 2) 对比度差（需要截图验证是否有误判）
          (domResult.contrastRatio < threshold);

        if (needsScreenshot) {
          const screenshotResult = await analyzeWithScreenshot(element, text, captureScale);
          // 截图分析有效则使用，否则保留 DOM 结果
          if (screenshotResult.analysisMethod === 'screenshot') {
            return screenshotResult;
          }
        }

        return domResult;
      }
    );
  }

  // 统计结果
  let visibleCount = 0;
  let poorCount = 0;
  let totalRatio = 0;
  let totalScore = 0;

  for (const r of elementResults) {
    if (r.isVisible) {
      visibleCount++;
    } else {
      poorCount++;
    }
    totalRatio += r.contrastRatio;
    totalScore += r.visibilityScore;
  }

  const count = elementResults.length;
  const duration = performance.now() - startTime;

  return {
    total: count,
    visible: visibleCount,
    poor: poorCount,
    poorPercentage: count > 0 ? Math.round((poorCount / count) * 10000) / 100 : 0,
    averageContrastRatio: count > 0 ? Math.round((totalRatio / count) * 100) / 100 : 0,
    averageScore: count > 0 ? Math.round(totalScore / count) : 0,
    elements: elementResults,
    timestamp: Date.now(),
    duration: Math.round(duration),
  };
}
