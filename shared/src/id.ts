/** Deterministic, human-readable id generator: PREFIX-000001, PREFIX-000002, ... */
export class IdGenerator {
  private counters = new Map<string, number>();

  next(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}-${String(n).padStart(6, '0')}`;
  }

  reset(): void {
    this.counters.clear();
  }
}
