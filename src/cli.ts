#!/usr/bin/env node

import { Command } from 'commander';
import process from 'node:process';

const program = new Command();

program.name('svg2raster').description('Convert SVG assets to PNG/JPEG/WebP (work in progress).');

program.parseAsync(process.argv);
