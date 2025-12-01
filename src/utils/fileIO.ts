import { promises as fs } from 'node:fs';

export async function readFile(path: string): Promise<string> {
  return fs.readFile(path, 'utf8');
}
