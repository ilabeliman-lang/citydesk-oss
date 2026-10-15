/**
 * upg-u-069 — presence heartbeat coalescing.
 *
 * One heartbeat per user per window (2 seconds). The first push in a window
 * sends immediately (leading edge). Pushes that arrive while the window is
 * open are coalesced — the latest state replaces earlier ones — and flushed
 * when the window ends (trailing edge), so the final state still lands
 * within the window. Nothing is dropped silently: every caller's promise
 * settles when the send it belongs to actually happens.
 */

/** Acceptance (upg-u-069): at most one heartbeat per user per 2 seconds. */
export const HEARTBEAT_WINDOW_MS = 2_000;

type Waiter<R> = {
  promise: Promise<R>;
  resolve: (value: R) => void;
  reject: (error: unknown) => void;
};

type PendingEntry<T, R> = { payload: T; waiters: Array<Waiter<R>> };

export type HeartbeatSend<T, R> = (payload: T) => R | Promise<R>;

export type PresenceHeartbeatOptions<T, R> = {
  /** Performs the actual send. Called at most once per user per window. */
  send: HeartbeatSend<T, R>;
  /** Coalescing window in ms. Defaults to HEARTBEAT_WINDOW_MS. */
  windowMs?: number;
  /** Injectable clock (tests). Defaults to Date.now. */
  now?: () => number;
};

function waiter<R>(): Waiter<R> {
  let resolve!: (value: R) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<R>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export class PresenceHeartbeat<T, R> {
  private readonly send: HeartbeatSend<T, R>;
  private readonly windowMs: number;
  private readonly now: () => number;
  /** Per user: when the last heartbeat was sent. */
  private readonly lastSent = new Map<string, number>();
  /** Per user: the trailing flush waiting to go out. */
  private readonly pending = new Map<string, PendingEntry<T, R>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: PresenceHeartbeatOptions<T, R>) {
    this.send = options.send;
    this.windowMs = options.windowMs ?? HEARTBEAT_WINDOW_MS;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Queue one heartbeat for `userId`. Resolves with the send result once this
   * state is actually transmitted — immediately on the leading edge, or when
   * the trailing flush fires.
   */
  push(userId: string, payload: T): Promise<R> {
    const now = this.now();
    const last = this.lastSent.get(userId);
    if (last === undefined || now - last >= this.windowMs) {
      // Leading edge: nothing sent in this window — send now.
      this.lastSent.set(userId, now);
      return this.deliver(payload);
    }
    // Inside the window: coalesce. The latest state wins; every caller that
    // queued during the window settles together when the trailing flush sends.
    const due = last + this.windowMs;
    const entry = this.pending.get(userId);
    const waiting = waiter<R>();
    if (entry) {
      entry.payload = payload;
      entry.waiters.push(waiting);
    } else {
      this.pending.set(userId, { payload, waiters: [waiting] });
      this.timers.set(
        userId,
        setTimeout(() => {
          this.flush(userId);
        }, Math.max(0, due - now)),
      );
    }
    return waiting.promise;
  }

  /** Cancel any pending trailing flush (teardown / tests). */
  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.pending.clear();
  }

  private flush(userId: string): void {
    this.timers.delete(userId);
    const entry = this.pending.get(userId);
    this.pending.delete(userId);
    if (!entry) return;
    this.lastSent.set(userId, this.now());
    this.deliver(entry.payload).then(
      (value) => {
        for (const w of entry.waiters) w.resolve(value);
      },
      (error: unknown) => {
        for (const w of entry.waiters) w.reject(error);
      },
    );
  }

  private deliver(payload: T): Promise<R> {
    try {
      return Promise.resolve(this.send(payload));
    } catch (error) {
      return Promise.reject(error);
    }
  }
}
