import type { TextVisibilityOptions } from './types';

/**
 * 文本节点信息
 */
export interface TextNodeInfo {
  element: Element;
  text: string;
  rect: DOMRect | null;
}

/**
 * 为元素生成唯一的 CSS 选择器路径
 */
export function getUniqueSelector(element: Element): string {
  if (element.id) {
    return `#${element.id}`;
  }

  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      path.unshift(`#${current.id}`);
      break;
    }

    const parentEl: Element | null = current.parentElement;
    if (parentEl) {
      const siblings = Array.from(parentEl.children).filter(
        (sibling: Element) => sibling.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
      path.unshift(selector);
      current = parentEl;
    } else {
      path.unshift(selector);
      current = null;
    }
  }

  return path.join(' > ');
}

/**
 * 获取元素的完整 DOM 层级链
 * 从 document 到当前元素的标签路径
 */
export function getDOMHierarchy(element: Element): string[] {
  const hierarchy: string[] = [];
  let current: Element | null = element;

  while (current) {
    const tag = current.tagName.toLowerCase();
    const id = current.id ? `#${current.id}` : '';
    let classes = '';
    if (current.className && typeof current.className === 'string') {
      const cls = current.className.trim().split(/\s+/).filter(Boolean);
      if (cls.length > 0) {
        classes = '.' + cls.join('.');
      }
    }
    hierarchy.unshift(`${tag}${id}${classes}`);
    current = current.parentElement;
  }

  return hierarchy;
}

/**
 * 检查元素是否在视觉上可见
 */
export function isElementVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;
  // 零尺寸元素不可见
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  return true;
}

/**
 * 检查矩形是否在视口内
 */
export function isInViewport(rect: DOMRect): boolean {
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  return rect.left < vw && rect.right > 0 && rect.top < vh && rect.bottom > 0;
}

/**
 * 默认忽略的标签列表
 */
const DEFAULT_IGNORE_TAGS = new Set([
  'script', 'style', 'noscript', 'template',
  'svg', 'canvas', 'video', 'audio', 'iframe',
  'br', 'hr', 'wbr',
]);

/**
 * 在指定范围内查找所有包含可见文本的元素
 */
export function findTextElements(
  root: Element,
  options?: Pick<TextVisibilityOptions, 'minTextLength' | 'ignoreTags' | 'viewportOnly'>
): TextNodeInfo[] {
  const minLength = options?.minTextLength ?? 2;
  const viewportOnly = options?.viewportOnly ?? false;
  const ignoreTags = new Set([
    ...DEFAULT_IGNORE_TAGS,
    ...(options?.ignoreTags ?? []),
  ]);

  const results: TextNodeInfo[] = [];
  const seenElements = new Set<Element>();

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node: Node) {
        const text = node.textContent?.trim();
        if (!text || text.length < minLength) return NodeFilter.FILTER_REJECT;

        const parentEl = node.parentElement;
        if (!parentEl || !isElementVisible(parentEl)) return NodeFilter.FILTER_REJECT;

        const tag = parentEl.tagName.toLowerCase();
        if (ignoreTags.has(tag)) return NodeFilter.FILTER_REJECT;

        // 跳过已处理的父元素（避免重复）
        if (seenElements.has(parentEl)) return NodeFilter.FILTER_REJECT;

        // 跳过纯空白或特殊字符
        if (/^[\s\n\r\t]+$/.test(text)) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const parent = node.parentElement!;
    seenElements.add(parent);

    const text = (node.textContent || '').trim();
    const rect = parent.getBoundingClientRect();

    // 如果限定视口内元素，检查是否在视口中
    if (viewportOnly && !isInViewport(rect)) continue;

    results.push({
      element: parent,
      text,
      rect,
    });
  }

  return results;
}

/**
 * 获取元素的真实背景色
 * 如果当前元素背景透明，则向上遍历 DOM 树查找
 *
 * 注意：对于渐变/图片背景，此函数无法返回单一色值，
 * 此时需要通过 hasGradientBackground() 检测后使用截图分析
 */
export function getEffectiveBackgroundColor(element: Element): string {
  const checkTransparent = (color: string): boolean => {
    return (
      color === 'transparent' ||
      color === 'rgba(0, 0, 0, 0)' ||
      color === 'rgba(0,0,0,0)'
    );
  };

  let current: Element | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    const bg = style.backgroundColor;
    if (!checkTransparent(bg)) {
      // 确保背景不是完全透明的渐变
      return bg;
    }
    current = current.parentElement;
  }

  // 检查 body 和 document 的背景
  const bodyStyle = window.getComputedStyle(document.body);
  const bodyBg = bodyStyle.backgroundColor;
  if (!checkTransparent(bodyBg)) {
    return bodyBg;
  }

  return 'rgb(255, 255, 255)'; // 默认白色
}

/**
 * 检测元素或其祖先是否有渐变/图片背景
 * 如果存在，则 getEffectiveBackgroundColor() 无法返回准确颜色，
 * 需要使用截图进行像素分析
 */
export function hasGradientOrImageBackground(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    const bgImage = style.backgroundImage;
    if (bgImage !== 'none') {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * 获取元素的文字颜色
 */
export function getTextColor(element: Element): string {
  return window.getComputedStyle(element).color;
}
