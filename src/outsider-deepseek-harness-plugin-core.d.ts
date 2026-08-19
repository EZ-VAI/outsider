export interface DeepSeekHarnessPluginGateway {
  claimCorrection(request: unknown): Promise<unknown>;
  recordAck(ack: unknown): Promise<void>;
}

export interface DeepSeekHarnessPluginCoreOptions {
  handshake: unknown;
  gateway: DeepSeekHarnessPluginGateway;
  createMessage(input: {
    content: Array<{ type: "text"; text: string }>;
    source: { kind: "plugin"; plugin: string; form: "notice"; summary: string };
  }): { id: string; content: unknown; source: unknown };
  pluginName?: string;
}

export interface DeepSeekHarnessPluginCore {
  preStep(payload: unknown, next: () => Promise<unknown>): Promise<unknown>;
  sessionEvent(event: unknown): Promise<unknown>;
  diagnostics(): Readonly<{
    latestHarnessEventSeq: number;
    deliveredCorrectionCount: number;
    pendingAckCount: number;
    establishesEffect: false;
    establishesOutcome: false;
  }>;
}

export function createDeepSeekHarnessPluginCore(
  options: DeepSeekHarnessPluginCoreOptions,
): Readonly<DeepSeekHarnessPluginCore>;
