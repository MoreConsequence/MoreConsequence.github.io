export class TelemetryCollector {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCostUsd = 0;
  private turnCount = 0;

  public recordUsage(promptTokens: number, completionTokens: number): void {
    this.totalInputTokens += promptTokens;
    this.totalOutputTokens += completionTokens;
    // 简易成本估算：$2.5 / M input, $10 / M output
    this.totalCostUsd += (promptTokens / 1_000_000) * 2.5 + (completionTokens / 1_000_000) * 10.0;
  }

  public incrementTurn(): void {
    this.turnCount++;
  }

  public generateReport(): string {
    return `
\x1b[36m================ Mini-Pi Telemetry Summary ================\x1b[0m
  Total Turns Executed:   ${this.turnCount}
  Total Input Tokens:     ${this.totalInputTokens}
  Total Output Tokens:    ${this.totalOutputTokens}
  Estimated Total Cost:   $${this.totalCostUsd.toFixed(5)} USD
\x1b[36m===========================================================\x1b[0m
`;
  }
}
