import process from 'node:process';
import { chromium, type Browser, type LaunchOptions } from 'playwright';
import { DEFAULT_NAVIGATION_TIMEOUT_MS, SUPPORTED_FORMATS } from '../config.js';
import { buildSvgPage } from './svgPageTemplate.js';
import { deriveDimensions } from '../utils/svg.js';
import type { OutputFormat, RenderOptions, RenderResult } from '../types.js';
import { convertPngBuffer } from '../utils/raster.js';

export interface BrowserRendererOptions {
  headless?: boolean;
  navigationTimeoutMs?: number;
  launchOptions?: LaunchOptions;
}

export interface BrowserRenderJob extends RenderOptions {
  svg: string;
}

export class BrowserRenderer {
  private browserPromise?: Promise<Browser>;

  constructor(private readonly options: BrowserRendererOptions = {}) {}

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = this.launchBrowser().catch((error) => {
        this.browserPromise = undefined;
        throw error;
      });
    }

    return this.browserPromise;
  }

  private async launchBrowser(): Promise<Browser> {
    const { headless = true, launchOptions } = this.options;
    const baseArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
    const constrainedArgs = [
      ...baseArgs,
      '--disable-dev-shm-usage',
      '--disable-software-rasterizer',
      '--disable-crash-reporter',
      '--single-process',
      '--no-zygote',
    ];

    const forceConstrained = process.env.SVG2RASTER_FORCE_MINIMAL_CHROMIUM === '1';
    const attemptArgsList = forceConstrained ? [constrainedArgs] : [baseArgs, constrainedArgs];
    let lastError: unknown;

    for (const candidateArgs of attemptArgsList) {
      try {
        return await chromium.launch({
          headless,
          ...launchOptions,
          args: [...candidateArgs, ...(launchOptions?.args ?? [])],
          chromiumSandbox: false,
          executablePath:
            launchOptions?.executablePath ??
            process.env.SVG2RASTER_CHROMIUM_PATH ??
            chromium.executablePath(),
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to launch Chromium');
  }

  async close(): Promise<void> {
    if (!this.browserPromise) {
      return;
    }

    try {
      const browser = await this.browserPromise;
      await browser.close();
    } catch (error) {
      console.warn(`Failed to close browser cleanly: ${error instanceof Error ? error.message : error}`);
    } finally {
      this.browserPromise = undefined;
    }
  }

  async render(job: BrowserRenderJob): Promise<RenderResult> {
    const format: OutputFormat = job.format ?? 'png';
    if (!SUPPORTED_FORMATS.includes(format)) {
      throw new Error(`Unsupported output format "${format}".`);
    }

    const { width, height } = deriveDimensions(job.svg, {
      width: job.width,
      height: job.height,
    });

    const browser = await this.getBrowser();
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: job.scale ?? 1,
      baseURL: job.baseUrl,
    });

    if (job.allowExternalStyles === false) {
      await context.route('**/*', (route) => {
        const request = route.request();
        if (
          request.resourceType() === 'stylesheet' &&
          !request.url().startsWith('data:')
        ) {
          return route.abort();
        }
        return route.continue();
      });
    }

    const timeout = job.navigationTimeoutMs ?? this.options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS;

    try {
      const page = await context.newPage();
      const html = buildSvgPage(job.svg, {
        extraCss: job.extraCss,
        background: job.background,
      });

      await page.setContent(html, {
        waitUntil: 'load',
        timeout,
      });
      await page.waitForLoadState('networkidle', { timeout }).catch(() => undefined);
      await page.evaluate(() => {
        if ('fonts' in document) {
          return (document as Document & { fonts: FontFaceSet }).fonts.ready;
        }
        return undefined;
      });

      if (typeof job.time === 'number') {
        await page.evaluate((timestamp) => {
          const svgElement = document.querySelector('svg');
          if (!svgElement) {
            return;
          }
          const animatedElement = svgElement as SVGSVGElement & {
            setCurrentTime?: (time: number) => void;
          };
          if (typeof animatedElement.setCurrentTime === 'function') {
            animatedElement.setCurrentTime(timestamp);
          }
        }, job.time);
      }

      const svgLocator = page.locator('svg').first();
      if ((await svgLocator.count()) === 0) {
        throw new Error('No <svg> element found after page load.');
      }

      const pngScreenshot = await svgLocator.screenshot({
        type: 'png',
        omitBackground: (job.background ?? 'transparent') === 'transparent',
      });

      const buffer =
        format === 'png'
          ? pngScreenshot
          : await convertPngBuffer(pngScreenshot, {
              format,
              background: job.background,
            });

      return {
        buffer,
        width,
        height,
        format,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to render SVG: ${reason}`);
    } finally {
      await context.close();
    }
  }
}
