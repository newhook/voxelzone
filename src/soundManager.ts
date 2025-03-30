import * as Tone from 'tone';

export class SoundManager {
  private playerShootSynth: Tone.Synth;
  private enemyShootSynth: Tone.Synth;
  private hitSynth: Tone.MembraneSynth;
  private radarPingSynth: Tone.Synth;
  private movementNoise: Tone.Noise;
  private movementGain: Tone.Gain;
  private movementFilter: Tone.Filter;
  private movementLFO: Tone.LFO;
  private isMovementPlaying: boolean = false;
  private marqueeMusic: Tone.Player;
  private powerupSynth: Tone.PolySynth; // New synth for powerup sounds

  constructor() {
    console.log('sound manager');
    // Initialize synths and effects
    this.playerShootSynth = new Tone.Synth().toDestination();
    this.enemyShootSynth = new Tone.Synth().toDestination();
    this.hitSynth = new Tone.MembraneSynth().toDestination();
    this.radarPingSynth = new Tone.Synth().toDestination();
    
    // Initialize powerup synth with effects for a more rewarding sound
    this.powerupSynth = new Tone.PolySynth().toDestination();
    const powerupFilter = new Tone.Filter(800, "lowpass").toDestination();
    const powerupReverb = new Tone.Reverb(1.5).toDestination();
    this.powerupSynth.connect(powerupFilter);
    this.powerupSynth.connect(powerupReverb);

    // Enhanced movement noise setup for throbbing tank engine sound
    this.movementNoise = new Tone.Noise('brown'); // Brown noise for deeper engine sound
    this.movementFilter = new Tone.Filter({
      type: "bandpass",
      frequency: 250,
      Q: 1.5
    });
    this.movementGain = new Tone.Gain(0);
    
    // Create a pulsing/throbbing effect with LFO
    this.movementLFO = new Tone.LFO({
      frequency: 4, // 4 Hz - adjust for desired throb rate
      min: 0.04,
      max: 0.12
    });
    
    // Connect components in the audio chain
    this.movementNoise.connect(this.movementFilter);
    this.movementFilter.connect(this.movementGain);
    this.movementGain.toDestination();
    this.movementLFO.connect(this.movementGain.gain);

    // Marquee music setup
    this.marqueeMusic = new Tone.Player('/marquee-music.mp3').toDestination();
    this.marqueeMusic.autostart = true
  }

  async startAudioContext() {
    console.log("startAudioContext");
    await Tone.start();
    console.log('AudioContext started');
  }

  async loadMarqueeMusic() {
    try {
      await this.marqueeMusic.load();
      console.log('Marquee music loaded');
    } catch (error) {
      console.error('Error loading marquee music:', error);
    }
  }

  playPlayerShoot() {
    this.playerShootSynth.triggerAttackRelease('C4', '8n');
  }

  playEnemyShoot() {
    this.enemyShootSynth.triggerAttackRelease('G3', '8n');
  }

  playHit() {
    this.hitSynth.triggerAttackRelease('C2', '16n');
  }

  playRadarPing() {
    console.log("playRadarPing");
    this.radarPingSynth.triggerAttackRelease('A5', '32n');
  }

  startMovementNoise() {
    if (!this.isMovementPlaying) {
      this.movementNoise.start();
      this.movementLFO.start();
      this.movementGain.gain.rampTo(0.08, 0.2); // Smooth start
      this.isMovementPlaying = true;
    }
  }

  stopMovementNoise() {
    if (this.isMovementPlaying) {
      // Fade out smoothly
      this.movementGain.gain.rampTo(0, 0.3);
      
      // Schedule the actual stopping after the fade
      setTimeout(() => {
        this.movementNoise.stop();
        this.movementLFO.stop();
        this.isMovementPlaying = false;
      }, 350);
    }
  }

  playMarqueeMusic() {
    if (this.marqueeMusic.loaded) {
      this.marqueeMusic.start();
    } else {
      console.warn('Marquee music is not loaded yet');
    }
  }

  stopMarqueeMusic() {
    this.marqueeMusic.stop();
  }

  /**
   * Play a positive sound effect when a powerup is collected
   */
  playPowerup() {
    // Play an ascending arpeggio for a rewarding sound
    const now = Tone.now();
    // Play three notes in quick succession
    this.powerupSynth.triggerAttackRelease("C5", "16n", now);
    this.powerupSynth.triggerAttackRelease("E5", "16n", now + 0.05);
    this.powerupSynth.triggerAttackRelease("G5", "16n", now + 0.1);
    this.powerupSynth.triggerAttackRelease("C6", "8n", now + 0.15);
  }
}