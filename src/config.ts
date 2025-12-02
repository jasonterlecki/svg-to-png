export const SUPPORTED_FORMATS = ['png', 'jpeg', 'webp', 'avif'] as const;
export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

export const DEFAULT_VIEWPORT_SIZE = 512;
export const DEFAULT_NAVIGATION_TIMEOUT_MS = 15000;
