import type { RGBColor } from './types';

/**
 * 将 CSS 颜色字符串解析为 RGBColor 对象
 * 支持: hex (#RGB, #RGBA, #RRGGBB, #RRGGBBAA), rgb(), rgba()
 */
export function parseColor(color: string): RGBColor | null {
  if (!color) return null;

  // 处理 rgb() / rgba()
  const rgbMatch = color.match(
    /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/i
  );
  if (rgbMatch) {
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      const alphaStr = rgbMatch[4].trim();
      a = alphaStr.endsWith('%')
        ? parseFloat(alphaStr) / 100
        : parseFloat(alphaStr);
    }
    return {
      r: Math.min(255, Math.max(0, parseInt(rgbMatch[1]))),
      g: Math.min(255, Math.max(0, parseInt(rgbMatch[2]))),
      b: Math.min(255, Math.max(0, parseInt(rgbMatch[3]))),
      a: Math.min(1, Math.max(0, a)),
    };
  }

  // 处理 #RRGGBB 或 #RRGGBBAA
  const hexMatch = color.match(
    /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i
  );
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
      a: hexMatch[4] !== undefined ? parseInt(hexMatch[4], 16) / 255 : 1,
    };
  }

  // 处理 #RGB 或 #RGBA
  const hexShortMatch = color.match(
    /^#?([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i
  );
  if (hexShortMatch) {
    return {
      r: parseInt(hexShortMatch[1] + hexShortMatch[1], 16),
      g: parseInt(hexShortMatch[2] + hexShortMatch[2], 16),
      b: parseInt(hexShortMatch[3] + hexShortMatch[3], 16),
      a:
        hexShortMatch[4] !== undefined
          ? parseInt(hexShortMatch[4] + hexShortMatch[4], 16) / 255
          : 1,
    };
  }

  return null;
}

/**
 * RGBColor 转 CSS 字符串
 */
export function rgbToString(color: RGBColor): string {
  if (color.a < 1) {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
  }
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

/**
 * RGBColor 转十六进制字符串
 */
export function rgbaToHex(color: RGBColor): string {
  const r = color.r.toString(16).padStart(2, '0');
  const g = color.g.toString(16).padStart(2, '0');
  const b = color.b.toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

/**
 * 对颜色通道进行 gamma 校正（线性化）
 * 用于计算相对亮度
 */
export function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * 计算相对亮度 (WCAG 定义)
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(color: RGBColor): number {
  const r = linearize(color.r);
  const g = linearize(color.g);
  const b = linearize(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 计算两个颜色之间的 WCAG 对比度比值
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
export function contrastRatio(c1: RGBColor, c2: RGBColor): number {
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 将前景色与背景色进行 alpha 混合
 */
export function blendAlpha(foreground: RGBColor, background: RGBColor): RGBColor {
  const alpha = foreground.a;
  return {
    r: Math.round(foreground.r * alpha + background.r * (1 - alpha)),
    g: Math.round(foreground.g * alpha + background.g * (1 - alpha)),
    b: Math.round(foreground.b * alpha + background.b * (1 - alpha)),
    a: 1,
  };
}

/**
 * 对比度比值转评分 (0-100)
 * 使用对数映射: WCAG AA (4.5) 对应约 70 分
 */
export function scoreFromContrastRatio(ratio: number): number {
  if (ratio >= 21) return 100;
  if (ratio <= 1) return 0;
  // score = log(ratio) / log(21) * 100
  return Math.min(100, Math.max(0, Math.round((Math.log(ratio) / Math.log(21)) * 100)));
}

/**
 * 生成可见性改进建议
 */
export function generateSuggestion(ratio: number, textColor: string, bgColor: string): string {
  if (ratio >= 4.5) return '';
  if (ratio < 1.5) {
    return `文字色 (${textColor}) 与背景色 (${bgColor}) 几乎无法区分，建议大幅提高对比度，至少达到 4.5:1`;
  }
  if (ratio < 3) {
    return `对比度 ${ratio.toFixed(2)}:1 偏低，建议加深文字色或减淡背景色以达到 4.5:1`;
  }
  return `对比度 ${ratio.toFixed(2)}:1 不足 AA 标准 (4.5:1)，建议调整颜色组合`;
}
