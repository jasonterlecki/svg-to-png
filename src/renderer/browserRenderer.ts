import { Buffer } from 'node:buffer';

export interface BrowserRenderJob {
  svg: string;
}

export async function renderWithBrowser(job: BrowserRenderJob): Promise<Buffer> {
  void job;
  throw new Error('renderWithBrowser is not implemented yet');
}
