// Audio service for sound effects
// Uses Web Audio API for reliable, low-latency playback

class AudioService {
  private audioContext: AudioContext | null = null;
  private enabled = true;

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  // Play a pleasant completion sound - a soft chime
  public playComplete(): void {
    if (!this.enabled) return;

    const ctx = this.getContext();
    const now = ctx.currentTime;

    // Create oscillators for a pleasant chime sound
    const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5 - major chord

    frequencies.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, now);

      // Stagger the notes slightly for a pleasant arpeggio effect
      const startTime = now + i * 0.05;
      const duration = 0.4;

      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    });
  }

  // Play a subtle sound for milestone completion - deeper, more satisfying
  public playMilestoneComplete(): void {
    if (!this.enabled) return;

    const ctx = this.getContext();
    const now = ctx.currentTime;

    // Lower, richer chord for milestone completion
    const frequencies = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5

    frequencies.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, now);

      const startTime = now + i * 0.08;
      const duration = 0.6;

      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.12, startTime + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    });
  }

  // Play a soft click for UI interactions
  public playClick(): void {
    if (!this.enabled) return;

    const ctx = this.getContext();
    const now = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, now);
    oscillator.frequency.exponentialRampToValueAtTime(600, now + 0.05);

    gainNode.gain.setValueAtTime(0.1, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(now);
    oscillator.stop(now + 0.05);
  }

  // Clean up AudioContext resources
  public cleanup(): void {
    if (this.audioContext) {
      this.audioContext.close().catch((err) => {
        console.error('Failed to close AudioContext:', err);
      });
      this.audioContext = null;
    }
  }
}

// Singleton instance
export const audioService = new AudioService();
