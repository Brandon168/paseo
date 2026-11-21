export const DEFAULT_AUTO_HEIGHT = { min: 80, max: 1400 } as const;
const DEFAULT_FIXED_HEIGHT = 240;

export interface HtmlFrameSizing {
  autoHeight?: { min?: number; max?: number } | false;
  height?: number;
  fill?: boolean;
  scrollEnabled?: boolean;
}

export interface ResolvedSizing {
  fill: boolean;
  /** Pixel height of the frame; null when `fill` owns the size. */
  height: number | null;
  scrollEnabled: boolean;
  autoSize: boolean;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function autoHeightBounds(autoHeight: HtmlFrameSizing["autoHeight"]): {
  min: number;
  max: number;
} {
  const min = Math.max(0, finite(autoHeight ? autoHeight.min : undefined, DEFAULT_AUTO_HEIGHT.min));
  const max = Math.max(
    min,
    finite(autoHeight ? autoHeight.max : undefined, DEFAULT_AUTO_HEIGHT.max),
  );
  return { min, max };
}

/** `measured` is the page's content height, or null before the first measure. */
export function resolveSizing(props: HtmlFrameSizing, measured: number | null): ResolvedSizing {
  if (props.fill) {
    return {
      fill: true,
      height: null,
      scrollEnabled: props.scrollEnabled ?? true,
      autoSize: false,
    };
  }
  if (props.autoHeight === false) {
    return {
      fill: false,
      height: Math.max(0, finite(props.height, DEFAULT_FIXED_HEIGHT)),
      scrollEnabled: props.scrollEnabled ?? true,
      autoSize: false,
    };
  }
  const { min, max } = autoHeightBounds(props.autoHeight);
  const content = measured ?? finite(props.height, min);
  const height = Math.min(max, Math.max(min, content));
  // Inline apps do not scroll inside themselves, unless content outgrew the cap and would be cut off.
  const overflowing = measured !== null && measured > max;
  return {
    fill: false,
    height,
    scrollEnabled: props.scrollEnabled ?? overflowing,
    autoSize: true,
  };
}
