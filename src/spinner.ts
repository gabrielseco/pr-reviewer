export class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private currentFrame = 0;
  private intervalId: Timer | null = null;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    // Hide cursor
    process.stdout.write("\x1B[?25l");

    this.intervalId = setInterval(() => {
      const frame = this.frames[this.currentFrame];
      process.stdout.write(`\r${frame} ${this.message}`);
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
  }

  updateMessage(message: string): void {
    this.message = message;
  }

  succeed(message?: string): void {
    this.stop("✓", message);
  }

  fail(message?: string): void {
    this.stop("✗", message);
  }

  private stop(symbol: string, message?: string): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Clear the line and show final message
    process.stdout.write(`\r${symbol} ${message || this.message}\n`);

    // Show cursor
    process.stdout.write("\x1B[?25h");
  }
}

export function bell(): void {
  process.stdout.write("\x07");
}
