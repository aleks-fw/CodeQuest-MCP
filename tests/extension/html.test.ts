import { describe, expect, it } from 'vitest';
import { panelHtml } from '../../vscode-extension/src/host/html.js';

describe('panelHtml', () => {
  const html = panelHtml({
    cspSource: 'vscode-webview://abc',
    nonce: 'N0NCE',
    scriptUri: 'vscode-webview://abc/main.js',
  });
  it('allows only the nonce script and the webview source, no remote content', () => {
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-N0NCE'");
    expect(html).toContain('<script nonce="N0NCE" src="vscode-webview://abc/main.js">');
    expect(html).not.toMatch(/https?:\/\//);
  });
  it('has the canvas, the check button and the containers the UI script fills', () => {
    for (const id of ['scene', 'check', 'bars', 'quests', 'message', 'title', 'owed']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('image-rendering: pixelated');
  });
});
