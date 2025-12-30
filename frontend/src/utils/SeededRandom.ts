/**
 * Deterministic seeded PRNG (mulberry32)
 * Same seed always produces same sequence of random numbers
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  next(): number {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  reset(seed: number): void {
    this.state = seed;
  }
}

/**
 * Create deterministic seed from node ID and morph parameters
 * Used for consistent puff generation across renders
 */
export function createMorphSeed(nodeId: string, mode: string, requiredW: number, requiredH: number): number {
  const str = `${nodeId}-${mode}-${Math.round(requiredW / 10)}-${Math.round(requiredH / 10)}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) >>> 0; // Ensure positive uint32
}
