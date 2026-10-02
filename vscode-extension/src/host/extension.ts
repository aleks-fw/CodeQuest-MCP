import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { createGate } from '../shared/gate.js';
import type { StateDoc } from '../shared/state.js';
import { statusBarText, statusBarTooltip } from '../shared/text.js';
import { runCodeQuest } from './cli.js';
import { panelHtml } from './html.js';

interface Settings {
  cli: string;
  node: string;
  home: string;
  pollSeconds: number;
}

function settings(): Settings {
  const config = vscode.workspace.getConfiguration('codequest');
  return {
    cli: config.get<string>('cliPath', ''),
    node: config.get<string>('nodePath', 'node'),
    home: config.get<string>('home', ''),
    pollSeconds: Math.max(10, config.get<number>('pollSeconds', 30)),
  };
}

const workspaceRoot = (): string | undefined => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

class PanelProvider implements vscode.WebviewViewProvider {
  view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onReady: () => void,
    private readonly onVerify: () => void,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const out = vscode.Uri.joinPath(this.extensionUri, 'out');
    view.webview.options = { enableScripts: true, localResourceRoots: [out] };
    view.webview.html = panelHtml({
      cspSource: view.webview.cspSource,
      nonce: randomBytes(16).toString('hex'),
      scriptUri: view.webview.asWebviewUri(vscode.Uri.joinPath(out, 'webview', 'main.js')).toString(),
    });
    view.webview.onDidReceiveMessage((message: { type?: string }) => {
      if (message.type === 'ready') this.onReady();
      else if (message.type === 'verify') this.onVerify();
    });
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
  }

  post(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = 'codequest.verify';
  status.text = statusBarText(null, 'nodata');
  status.show();

  const gate = createGate();
  const verifyGate = createGate();
  let last: StateDoc | null = null;

  const show = (doc: StateDoc): void => {
    last = doc;
    status.text = statusBarText(doc, 'ok');
    status.tooltip = statusBarTooltip(doc);
    provider.post({ type: 'state', doc });
  };
  const fail = (message: string): void => {
    status.text = last === null ? statusBarText(null, 'nodata') : statusBarText(last, 'ok');
    status.tooltip = statusBarTooltip(last, message);
    provider.post({ type: 'error', message });
  };

  async function refresh(): Promise<void> {
    if (verifyGate.busy) return;
    const root = workspaceRoot();
    if (root === undefined) {
      status.text = statusBarText(null, 'nodata');
      status.tooltip = 'Open a project folder';
      provider.post({ type: 'empty', lang: 'en' });
      return;
    }
    const { cli, node, home } = settings();
    await gate.run(async () => {
      const result = await runCodeQuest({ node, cli, home, args: ['state', '--path', root], cwd: root });
      if (result.ok) show(result.doc);
      else fail(result.message);
    });
  }

  async function verify(): Promise<void> {
    const root = workspaceRoot();
    if (root === undefined) return;
    const { cli, node, home } = settings();
    await verifyGate.run(async () => {
      status.text = statusBarText(last, 'checking');
      provider.post({ type: 'busy', on: true });
      // No timeout of our own: CodeQuest enforces the timeout of the project commands.
      const result = await runCodeQuest({
        node,
        cli,
        home,
        args: ['verify', '--json', '--path', root],
        cwd: root,
        timeoutMs: 2 * 60 * 60 * 1000,
      });
      provider.post({ type: 'busy', on: false });
      if (result.ok) {
        show(result.doc);
        void vscode.window.showInformationMessage(`CodeQuest: ${result.doc.title} · LVL ${result.doc.level}`);
      } else {
        fail(result.message);
        void vscode.window.showWarningMessage(`CodeQuest: ${result.message}`);
      }
    });
  }

  const provider = new PanelProvider(
    context.extensionUri,
    () => void refresh(),
    () => void verify(),
  );
  context.subscriptions.push(
    status,
    vscode.window.registerWebviewViewProvider('codequest.panel', provider),
    vscode.commands.registerCommand('codequest.verify', () => verify()),
    vscode.commands.registerCommand('codequest.refresh', () => refresh()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('codequest')) void refresh();
    }),
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) void refresh();
    }),
  );

  const timer = setInterval(() => {
    if (vscode.window.state.focused) void refresh();
  }, settings().pollSeconds * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  void refresh();
}

export function deactivate(): void {}
