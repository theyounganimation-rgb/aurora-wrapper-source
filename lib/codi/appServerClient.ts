import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import readline from "node:readline";

interface JsonRpcSuccess {
  id?: number;
  result?: unknown;
}

interface JsonRpcErrorPayload {
  code?: number;
  message?: string;
}

interface JsonRpcError {
  id?: number;
  error?: JsonRpcErrorPayload;
}

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
}

class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutReader: readline.Interface | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private initPromise: Promise<void> | null = null;
  private stderrTail = "";

  private resolveCodexBinary(): string {
    const explicit = process.env.CODI_CODEX_BINARY?.trim() || process.env.CODEX_BINARY?.trim();
    if (explicit) {
      return explicit;
    }

    const bundledBinary = "/Applications/Codex.app/Contents/Resources/codex";
    if (existsSync(bundledBinary)) {
      return bundledBinary;
    }

    return "codex";
  }

  private spawnChild(): ChildProcessWithoutNullStreams {
    if (this.child) {
      return this.child;
    }

    const child = spawn(this.resolveCodexBinary(), ["app-server"], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.child = child;
    this.stdoutReader = readline.createInterface({
      input: child.stdout
    });

    this.stdoutReader.on("line", (line) => {
      this.handleStdoutLine(line);
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      this.stderrTail = `${this.stderrTail}${chunk.toString()}`.slice(-4000);
    });

    child.on("exit", (code, signal) => {
      const reason = `Codex app-server exited (code=${code ?? "null"}, signal=${signal ?? "null"})`;
      const error = new Error(this.stderrTail ? `${reason}: ${this.stderrTail.trim()}` : reason);

      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(error);
      }

      this.pending.clear();
      this.initPromise = null;
      this.stdoutReader?.removeAllListeners();
      this.stdoutReader?.close();
      this.stdoutReader = null;
      this.child = null;
    });

    return child;
  }

  private handleStdoutLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return;
    }

    const record = parsed as JsonRpcSuccess & JsonRpcError;
    if (typeof record.id !== "number") {
      return;
    }

    const pending = this.pending.get(record.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(record.id);

    if (record.error) {
      const message = record.error.message?.trim() || `Request '${pending.method}' failed.`;
      pending.reject(new Error(message));
      return;
    }

    pending.resolve(record.result);
  }

  private writeMessage(payload: Record<string, unknown>): void {
    const child = this.spawnChild();
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private async notify(method: string, params: Record<string, unknown> = {}): Promise<void> {
    this.writeMessage({
      jsonrpc: "2.0",
      method,
      params
    });
  }

  private async requestInternal<T>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
    requireInitialization: boolean
  ): Promise<T> {
    if (requireInitialization) {
      await this.ensureInitialized();
    } else {
      this.spawnChild();
    }

    return await new Promise<T>((resolve, reject) => {
      const id = this.nextId;
      this.nextId += 1;

      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for '${method}' after ${timeoutMs} ms.`));
      }, timeoutMs);

      this.pending.set(id, {
        method,
        resolve: (value) => {
          resolve(value as T);
        },
        reject,
        timeout
      });

      this.writeMessage({
        jsonrpc: "2.0",
        id,
        method,
        params
      });
    });
  }

  async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      return await this.initPromise;
    }

    this.initPromise = (async () => {
      await this.requestInternal(
        "initialize",
        {
          clientInfo: {
            name: "codi-bridge",
            version: "0.1.0"
          },
          capabilities: {
            experimentalApi: true
          }
        },
        10_000,
        false
      );

      await this.notify("initialized", {});
    })();

    try {
      await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      throw error;
    }
  }

  async request<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 20_000
  ): Promise<T> {
    return await this.requestInternal<T>(method, params, timeoutMs, true);
  }
}

export function getCodexAppServerClient(): CodexAppServerClient {
  const store = globalThis as typeof globalThis & {
    __codiCodexAppServerClient?: CodexAppServerClient;
  };

  if (!store.__codiCodexAppServerClient) {
    store.__codiCodexAppServerClient = new CodexAppServerClient();
  }

  return store.__codiCodexAppServerClient;
}
