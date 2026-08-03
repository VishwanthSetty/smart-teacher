type Level = 'info' | 'warn' | 'error';

export interface LogFields {
  videoId?: string;
  jobId?: string;
  attempt?: number;
  [key: string]: unknown;
}

/**
 * One JSON object per line.
 *
 * A worker's output is read by `docker logs` and whatever ships it onward, never by a
 * human tailing a terminal, so structure beats prettiness: correlating a failure to a
 * videoId across a fleet is a grep on a field, not on a message.
 */
export class Logger {
  constructor(private readonly context: string) {}

  info(message: string, fields: LogFields = {}): void {
    this.write('info', message, fields);
  }

  warn(message: string, fields: LogFields = {}): void {
    this.write('warn', message, fields);
  }

  error(message: string, fields: LogFields = {}): void {
    this.write('error', message, fields);
  }

  private write(level: Level, message: string, fields: LogFields): void {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...fields,
    });
    // stderr for anything actionable so a log shipper can split streams without parsing.
    if (level === 'error' || level === 'warn') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
}
