import html2canvas from 'html2canvas';
import type { RGBColor } from './types';
import { relativeLuminance, contrastRatio } from './colorUtils';

/**
 * 像素聚类分析结果
 */
export interface PixelAnalysisResult {
  textColor: RGBColor;
  backgroundColor: RGBColor;
  contrastRatio: number;
  /** 文本像素占比 */
  textPixelRatio: number;
}

/**
 * 基于 Otsu 阈值对像素进行二分类
 * 返回 [暗色组平均色, 亮色组平均色, 阈值, 暗色组占比]
 */
function otsuThreshold(pixels: Uint8ClampedArray): {
  darkMean: RGBColor;
  lightMean: RGBColor;
  threshold: number;
  darkRatio: number;
} {
  const length = pixels.length / 4;
  if (length === 0) {
    return {
      darkMean: { r: 0, g: 0, b: 0, a: 1 },
      lightMean: { r: 255, g: 255, b: 255, a: 1 },
      threshold: 128,
      darkRatio: 0.5,
    };
  }

  // 计算每个像素的亮度
  const luminances = new Float64Array(length);
  let minL = Infinity;
  let maxL = -Infinity;

  for (let i = 0; i < length; i++) {
    const idx = i * 4;
    const l = relativeLuminance({
      r: pixels[idx],
      g: pixels[idx + 1],
      b: pixels[idx + 2],
      a: pixels[idx + 3] / 255,
    });
    luminances[i] = l;
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
  }

  // 量化为 256 级用于直方图
  const range = maxL - minL || 1;
  const bins = 256;
  const histogram = new Uint32Array(bins);
  for (let i = 0; i < length; i++) {
    const bin = Math.min(bins - 1, Math.floor(((luminances[i] - minL) / range) * bins));
    histogram[bin]++;
  }

  // Otsu 阈值计算
  let total = length;
  let sumTotal = 0;
  for (let i = 0; i < bins; i++) {
    sumTotal += i * histogram[i];
  }

  let sumBack = 0;
  let wBack = 0;
  let wFore = 0;
  let maxVariance = 0;
  let bestThreshold = 0;

  for (let i = 0; i < bins; i++) {
    wBack += histogram[i];
    if (wBack === 0) continue;
    wFore = total - wBack;
    if (wFore === 0) break;

    sumBack += i * histogram[i];
    const meanBack = sumBack / wBack;
    const meanFore = (sumTotal - sumBack) / wFore;

    // 类间方差
    const variance = wBack * wFore * (meanBack - meanFore) * (meanBack - meanFore);
    if (variance > maxVariance) {
      maxVariance = variance;
      bestThreshold = i;
    }
  }

  // 将阈值映射回亮度空间
  const thresholdLum = (bestThreshold / bins) * range + minL;

  // 根据阈值分组并计算平均色
  let darkR = 0, darkG = 0, darkB = 0, darkCount = 0;
  let lightR = 0, lightG = 0, lightB = 0, lightCount = 0;

  for (let i = 0; i < length; i++) {
    const idx = i * 4;
    if (luminances[i] < thresholdLum) {
      darkR += pixels[idx];
      darkG += pixels[idx + 1];
      darkB += pixels[idx + 2];
      darkCount++;
    } else {
      lightR += pixels[idx];
      lightG += pixels[idx + 1];
      lightB += pixels[idx + 2];
      lightCount++;
    }
  }

  const darkMean: RGBColor = darkCount > 0
    ? {
        r: Math.round(darkR / darkCount),
        g: Math.round(darkG / darkCount),
        b: Math.round(darkB / darkCount),
        a: 1,
      }
    : { r: 0, g: 0, b: 0, a: 1 };

  const lightMean: RGBColor = lightCount > 0
    ? {
        r: Math.round(lightR / lightCount),
        g: Math.round(lightG / lightCount),
        b: Math.round(lightB / lightCount),
        a: 1,
      }
    : { r: 255, g: 255, b: 255, a: 1 };

  return {
    darkMean,
    lightMean,
    threshold: thresholdLum,
    darkRatio: darkCount / length,
  };
}

// html2canvas 缓存，避免重复创建相同元素的截图
const screenshotCache = new WeakMap<Element, HTMLCanvasElement>();

function clearScreenshotCache(): void {
  // WeakMap 会自动清理，无需手动操作
}

/**
 * 使用 html2canvas 截取元素渲染区域的截图
 * 并返回 Canvas 像素数据
 */
async function captureElement(element: Element, scale: number): Promise<HTMLCanvasElement | null> {
  // 检查缓存
  const cached = screenshotCache.get(element);
  if (cached) return cached;

  try {
    const canvas = await html2canvas(element as HTMLElement, {
      scale: scale,
      useCORS: true,
      logging: false,
      allowTaint: true,
      backgroundColor: null, // 透明背景，让我们自己检测实际背景
      width: Math.max(element.clientWidth || 100, 10),
      height: Math.max(element.clientHeight || 100, 10),
      // 对文字渲染友好的配置
      onclone: () => {}, // 不修改克隆文档
    });

    screenshotCache.set(element, canvas);
    return canvas;
  } catch (error) {
    console.warn('[check-text-color] html2canvas 截图失败:', error);
    return null;
  }
}

/**
 * 分析元素截图中的像素数据
 * 通过 Otsu 阈值法将像素分为文字色和背景色两组
 */
export async function analyzeElementPixels(
  element: Element,
  scale: number = 1
): Promise<PixelAnalysisResult | null> {
  const canvas = await captureElement(element, scale);
  if (!canvas) return null;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const width = canvas.width;
  const height = canvas.height;

  if (width === 0 || height === 0) return null;

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  // 过滤掉完全透明的像素
  const opaquePixels = new Uint8ClampedArray(pixels.length);
  let opaqueCount = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a > 10) {
      opaquePixels[opaqueCount * 4] = pixels[i];
      opaquePixels[opaqueCount * 4 + 1] = pixels[i + 1];
      opaquePixels[opaqueCount * 4 + 2] = pixels[i + 2];
      opaquePixels[opaqueCount * 4 + 3] = pixels[i + 3];
      opaqueCount++;
    }
  }

  // 如果没有不透明像素，使用原始数据
  const dataForAnalysis = opaqueCount > 0
    ? opaquePixels.slice(0, opaqueCount * 4)
    : pixels;

  // Otsu 阈值聚类
  const { darkMean, lightMean, darkRatio } = otsuThreshold(
    dataForAnalysis as Uint8ClampedArray
  );

  // 确定文字色和背景色
  // 通常文字占比小于背景占比（文字占据面积较小）
  // 但如果文字是浅色而背景是深色，则暗色可能是背景
  // 通过对比度来判断：选择对比度更高的分配方式
  const ratio1 = contrastRatio(darkMean, lightMean);

  // 文字通常占比更小（darkRatio < 0.5 或 > 0.5 取决于颜色模式）
  // 选择让对比度更高的分配方式
  let textColor: RGBColor;
  let backgroundColor: RGBColor;
  let textPixelRatio: number;

  // 判断：如果暗色组占比小，则暗色为文字；否则亮色为文字
  // 但也要考虑暗色背景亮色文字的情况
  if (darkRatio <= 0.5) {
    // 暗色像素少，推测是深色文字在浅色背景上
    textColor = darkMean;
    backgroundColor = lightMean;
    textPixelRatio = darkRatio;
  } else {
    // 亮色像素少，推测是浅色文字在深色背景上
    textColor = lightMean;
    backgroundColor = darkMean;
    textPixelRatio = 1 - darkRatio;
  }

  // 防止 textPixelRatio 为 0
  textPixelRatio = Math.max(textPixelRatio, 0.01);

  return {
    textColor,
    backgroundColor,
    contrastRatio: ratio1,
    textPixelRatio,
  };
}

/**
 * 获取父级元素的背景中，对应子元素位置的像素采样
 *
 * 用于处理子元素本身背景透明，但父级有渐变/图片背景的情况。
 * 通过截取父级元素的截图，然后从子元素对应的区域采样像素，
 * 再通过聚类分析得到该区域的背景色。
 *
 * @param parent - 有渐变/图片背景的父级元素
 * @param childRect - 子元素的 getBoundingClientRect()
 * @param scale - 截图缩放比例
 * @returns 采样到的背景色，或 null
 */
export async function sampleBackgroundFromParent(
  parent: Element,
  childRect: { x: number; y: number; width: number; height: number },
  scale: number = 1
): Promise<RGBColor | null> {
  try {
    const canvas = await html2canvas(parent as HTMLElement, {
      scale,
      useCORS: true,
      logging: false,
      allowTaint: true,
      backgroundColor: null,
    });

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const parentRect = parent.getBoundingClientRect();

    // 计算子元素在父级截图中的像素区域
    const relX = (childRect.x - parentRect.x) * scale;
    const relY = (childRect.y - parentRect.y) * scale;
    const relW = childRect.width * scale;
    const relH = childRect.height * scale;

    // 边界保护
    if (relX < 0 || relY < 0 || relX + relW > canvas.width || relY + relH > canvas.height) {
      return null;
    }

    // 只取子元素区域的像素
    const imageData = ctx.getImageData(relX, relY, relW, relH);
    const pixels = imageData.data;

    // 用 Otsu 聚类找到主色（背景色）
    const { darkMean, lightMean, darkRatio } = otsuThreshold(pixels);

    // 选择占比更大的组作为背景色
    if (darkRatio >= 0.5) {
      return darkMean;
    } else {
      return lightMean;
    }
  } catch (error) {
    console.warn('[check-text-color] 父级背景采样失败:', error);
    return null;
  }
}

/**
 * 清除截图缓存
 */
export function resetCache(): void {
  // WeakMap 无需手动清理，GC 会自动回收
}
