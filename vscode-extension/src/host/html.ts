export interface PanelHtmlOptions {
  cspSource: string;
  nonce: string;
  scriptUri: string;
}

/** The page of the webview: a locked-down CSP (only the nonce script, inline styles) and the containers `main.ts` fills. */
export function panelHtml({ cspSource, nonce, scriptUri }: PanelHtmlOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; padding: 0 0 8px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); }
  #scene { display: block; width: 100%; height: auto; aspect-ratio: 160 / 64; image-rendering: pixelated; }
  .pad { padding: 6px 10px; }
  .row { display: flex; align-items: center; gap: 6px; margin: 2px 0; font-size: 11px; }
  .row .name { width: 92px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar { flex: 1; height: 6px; background: color-mix(in srgb, var(--vscode-foreground) 20%, transparent); border-radius: 3px; position: relative; overflow: hidden; }
  .bar > i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--vscode-progressBar-background, #0e70c0); }
  .bar.boss > i { background: #d94a4a; }
  #title { font-weight: 600; margin-bottom: 4px; }
  button { width: 100%; margin-top: 8px; padding: 6px; border: 0; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: .6; cursor: default; }
  #quests { margin-top: 6px; font-size: 11px; }
  #quests ul { margin: 2px 0 0; padding-left: 16px; }
  #message { font-size: 11px; opacity: .85; margin-top: 4px; }
  .hint { font-size: 11px; opacity: .8; margin-top: 4px; }
</style>
</head>
<body>
<canvas id="scene" width="160" height="64"></canvas>
<div class="pad">
  <div id="title"></div>
  <div id="bars"></div>
  <div id="quests"></div>
  <div class="hint" id="owed"></div>
  <button id="check" type="button"></button>
  <div id="message"></div>
</div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
