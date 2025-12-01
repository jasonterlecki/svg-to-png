export const SUPPORTED_FORMATS = ['png', 'jpeg', 'webp'] as const;

export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];
