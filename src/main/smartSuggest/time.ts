export async function withTimeout<T>(label: string, ms: number, p: Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return await p
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    )
  ])
}

