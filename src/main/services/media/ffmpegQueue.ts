export class FfmpegQueue {
  private running = 0
  private readonly queue: Array<{
    run: () => Promise<unknown>
    resolve: (v: unknown) => void
    reject: (e: unknown) => void
  }> = []

  constructor(private readonly maxConcurrent: number) {}

  async enqueue<T>(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ run, resolve: resolve as unknown as (v: unknown) => void, reject })
      this.pump()
    })
  }

  private pump(): void {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift()
      if (!job) return
      this.running += 1
      void job
        .run()
        .then((v) => job.resolve(v))
        .catch((e) => job.reject(e))
        .finally(() => {
          this.running -= 1
          this.pump()
        })
    }
  }
}

