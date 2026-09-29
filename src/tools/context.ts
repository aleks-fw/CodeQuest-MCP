export interface ToolContext {
  /** The server's working folder. */
  cwd: string;
  /** Folders the MCP client reports as roots; empty when unavailable. */
  getRoots(): Promise<string[]>;
}
