export type ThemeParams = Partial<Record<
  'bg_color' | 'secondary_bg_color' | 'text_color' | 'hint_color' | 'link_color' |
  'button_color' | 'button_text_color' | 'header_bg_color' | 'section_bg_color' |
  'section_header_text_color' | 'subtitle_text_color' | 'destructive_text_color' | 'accent_text_color',
  string
>>;

const variables = [
  'background', 'surface', 'surface-secondary', 'header', 'text', 'muted', 'link',
  'button', 'button-text', 'section-title', 'subtitle', 'destructive', 'accent',
] as const;

function luminance(color: string) {
  const hex = color.length === 4 ? [...color.slice(1)].map((value) => value.repeat(2)).join('') : color.slice(1);
  return [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
    const value = parseInt(hex.slice(index * 2, index * 2 + 2), 16) / 255;
    return sum + weight * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  }, 0);
}

function contrast(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const color = (value?: string) => value && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value) ? value : undefined;

export function clearTelegramTheme(root: HTMLElement) {
  for (const key of variables) root.style.removeProperty(`--app-tg-${key}`);
}

export function applyTelegramTheme(root: HTMLElement, params?: ThemeParams) {
  clearTelegramTheme(root);
  if (!params) return;

  const fallback = getComputedStyle(root);
  const baseText = fallback.getPropertyValue('--text-primary').trim();
  const baseMuted = fallback.getPropertyValue('--text-secondary').trim();
  const surfaceTokens = [
    ['background', params.bg_color], ['surface', params.section_bg_color ?? params.bg_color],
    ['surface-secondary', params.secondary_bg_color ?? params.section_bg_color],
    ['header', params.header_bg_color ?? params.bg_color],
  ] as const;
  const backgrounds = surfaceTokens.map(([key, raw]) => {
    const candidate = color(raw);
    const accepted = candidate && contrast(candidate, baseText) >= 4.5 && contrast(candidate, baseMuted) >= 4.5;
    return [key, accepted ? candidate : fallback.getPropertyValue(`--${key}`).trim()] as const;
  });
  const set = (key: typeof variables[number], value: string) => root.style.setProperty(`--app-tg-${key}`, value);
  for (const [key, value] of backgrounds) set(key, value);

  const foregrounds = [
    ['text', params.text_color], ['muted', params.hint_color], ['link', params.link_color],
    ['section-title', params.section_header_text_color], ['subtitle', params.subtitle_text_color],
    ['destructive', params.destructive_text_color], ['accent', params.accent_text_color],
  ] as const;
  for (const [key, raw] of foregrounds) {
    const candidate = color(raw);
    if (candidate && backgrounds.every(([, background]) => contrast(candidate, background) >= 4.5)) {
      set(key, candidate);
    }
  }

  const button = color(params.button_color);
  const buttonText = color(params.button_text_color);
  if (button && buttonText && contrast(button, buttonText) >= 4.5) {
    set('button', button);
    set('button-text', buttonText);
  }
}
