import { describe, expect, it } from 'vitest';
import { findEntryPoints } from '../../src/analyzer/entry-points.js';
import { readJsProject } from '../../src/analyzer/js-project.js';
import { byPath, sourceFiles } from '../helpers/source-files.js';

function entries(files: Record<string, string>): string[] {
  const list = sourceFiles(files);
  return [...findEntryPoints(list, readJsProject(byPath(list)))];
}

describe('findEntryPoints', () => {
  it('takes package.json main, bin, exports and file paths from scripts', () => {
    const pkg = {
      main: './dist/index.js',
      bin: { tool: 'bin/tool.js' },
      exports: { '.': './src/lib.ts' },
      scripts: { start: 'node "./scripts/start.js"', dev: 'tsx watch tools/dev.ts --clear' },
    };
    expect(
      entries({
        'package.json': JSON.stringify(pkg),
        'bin/tool.js': '',
        'src/lib.ts': '',
        'scripts/start.js': '',
        'tools/dev.ts': '',
        'src/other.ts': '',
      }),
    ).toEqual(['bin/tool.js', 'scripts/start.js', 'src/lib.ts', 'tools/dev.ts']);
  });

  it('maps a built bin or main (dist/…js) back to its source file', () => {
    const pkg = { main: 'dist/lib.js', bin: { tool: './dist/cli/index.js' } };
    expect(
      entries({
        'package.json': JSON.stringify(pkg),
        'src/lib.ts': '',
        'src/cli/index.ts': '',
        'src/cli/other.ts': '',
      }),
    ).toEqual(['src/cli/index.ts', 'src/lib.ts']);
  });

  it('knows Next.js routing files', () => {
    expect(
      entries({
        'app/page.tsx': '',
        'app/shop/[id]/page.tsx': '',
        'app/components/Card.tsx': '',
        'src/app/api/pay/route.ts': '',
        'pages/index.tsx': '',
        'middleware.ts': '',
        'lib/cart.ts': '',
      }),
    ).toEqual([
      'app/page.tsx',
      'app/shop/[id]/page.tsx',
      'middleware.ts',
      'pages/index.tsx',
      'src/app/api/pay/route.ts',
    ]);
  });

  it('knows Next.js metadata, error and instrumentation files', () => {
    expect(
      entries({
        'app/sitemap.ts': '',
        'app/robots.ts': '',
        'app/manifest.ts': '',
        'app/opengraph-image.tsx': '',
        'app/blog/[slug]/twitter-image.tsx': '',
        'src/app/icon.tsx': '',
        'app/apple-icon.tsx': '',
        'app/global-error.tsx': '',
        'instrumentation.ts': '',
        'src/instrumentation.ts': '',
        'lib/instrumentation.ts': '',
        'lib/sitemap.ts': '',
      }),
    ).toEqual([
      'app/apple-icon.tsx',
      'app/blog/[slug]/twitter-image.tsx',
      'app/global-error.tsx',
      'app/manifest.ts',
      'app/opengraph-image.tsx',
      'app/robots.ts',
      'app/sitemap.ts',
      'instrumentation.ts',
      'src/app/icon.tsx',
      'src/instrumentation.ts',
    ]);
  });
  it('counts config files and root index/server/bot files', () => {
    expect(
      entries({
        'vite.config.ts': '',
        'src/index.ts': '',
        'server.js': '',
        'src/bot.ts': '',
        'src/util.ts': '',
        'lib/index.ts': '',
      }),
    ).toEqual(['server.js', 'src/bot.ts', 'src/index.ts', 'vite.config.ts']);
  });

  it('follows local <script src> in HTML and skips remote ones', () => {
    expect(
      entries({
        'public/index.html': [
          '<script src="https://cdn.example/x.js"></script>',
          '<script type="module" src="./js/app.js?v=2"></script>',
          '<script src="//cdn.example/y.js"></script>',
          '<img data-src="img.js">',
        ].join('\n'),
        'public/js/app.js': '',
        'index.html': '<script src="/main.js"></script>\n',
        'main.js': '',
        'img.js': '',
      }),
    ).toEqual(['main.js', 'public/js/app.js']);
  });

  it('knows Python main guards and conventional file names', () => {
    expect(
      entries({
        'tools/run.py': "def main():\n    pass\n\nif __name__ == '__main__':\n    main()\n",
        'pkg/__init__.py': '',
        'pkg/helpers.py': 'def f():\n    pass\n',
        'app.py': '',
      }),
    ).toEqual(['app.py', 'pkg/__init__.py', 'tools/run.py']);
  });
});
