export interface Adapter {
  /** Install hooks/listeners for the agent. Returns cleanup function. */
  install(socketPath: string, settingsDir?: string): Promise<() => Promise<void>>;
  /** Agent identifier string */
  readonly agentName: string;
}
