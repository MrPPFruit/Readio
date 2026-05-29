// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

describe('global UI font stack', () => {
  it('uses Inter for Latin text and Luo as the Chinese fallback', () => {
    const tailwindConfig = readFileSync(resolve(appRoot, 'tailwind.config.ts'), 'utf8');

    expect(tailwindConfig).toContain(
      "sans: ['Inter', 'Luo', 'ui-sans-serif', 'system-ui', 'sans-serif']",
    );
  });

  it('registers Luo for non-reader UI text', () => {
    const globalsCss = readFileSync(resolve(appRoot, 'src/styles/globals.css'), 'utf8');

    expect(globalsCss).toContain("font-family: 'Luo'");
    expect(globalsCss).toContain("src: url('/fonts/Luo-Regular.woff2') format('woff2')");
  });
});
