export interface SvgPageTemplateOptions {
  extraCss?: string;
  background?: string;
}

export function buildSvgPage(svg: string, options: SvgPageTemplateOptions = {}): string {
  const extraCssBlock = options.extraCss
    ? `<style id="svg2raster-extra-css">${options.extraCss}</style>`
    : '';
  const background = options.background ?? 'transparent';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>SVG Preview</title>
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        background: ${background};
        display: flex;
        align-items: center;
        justify-content: center;
      }
    </style>
    ${extraCssBlock}
  </head>
  <body>
    ${svg}
  </body>
</html>`;
}
