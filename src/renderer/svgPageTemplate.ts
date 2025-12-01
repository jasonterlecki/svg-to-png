export function buildSvgPage(svg: string): string {
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
        background: transparent;
      }
    </style>
  </head>
  <body>
    ${svg}
  </body>
</html>`;
}
