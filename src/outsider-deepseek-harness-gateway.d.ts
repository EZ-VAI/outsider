export interface DeepSeekHarnessGatewayClientOptions {
  socketPath: string;
  token: string;
  timeoutMs?: number;
}

export interface DeepSeekHarnessGatewayClient {
  claimCorrection(request: unknown): Promise<unknown>;
  recordAck(ack: unknown): Promise<void>;
}

export function createDeepSeekHarnessGatewayClient(
  options: DeepSeekHarnessGatewayClientOptions,
): Readonly<DeepSeekHarnessGatewayClient>;
