/**
 * Particle for dissolve effect animation
 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  lifetime: number;
  maxLifetime: number;
  active: boolean;  // For object pooling
}

/**
 * Object pool for particles to reduce GC pressure during dissolve animations.
 * Pre-allocates particles and recycles them instead of creating new objects.
 */
export class ParticlePool {
  private static pool: Particle[] = [];
  private static readonly INITIAL_SIZE = 50;  // Pre-allocate for ~4 simultaneous dissolves
  private static initialized = false;

  static initialize(): void {
    if (this.initialized) return;
    for (let i = 0; i < this.INITIAL_SIZE; i++) {
      this.pool.push(this.createParticle());
    }
    this.initialized = true;
  }

  private static createParticle(): Particle {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 0,
      alpha: 0,
      lifetime: 0,
      maxLifetime: 0,
      active: false,
    };
  }

  static acquire(): Particle {
    // Find inactive particle in pool
    for (const p of this.pool) {
      if (!p.active) {
        p.active = true;
        return p;
      }
    }
    // Pool exhausted, create new particle (will be recycled later)
    const p = this.createParticle();
    p.active = true;
    this.pool.push(p);
    return p;
  }

  static release(particle: Particle): void {
    particle.active = false;
  }

  static releaseAll(particles: Particle[]): void {
    for (const p of particles) {
      p.active = false;
    }
  }
}
