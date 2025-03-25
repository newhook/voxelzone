import * as Tone from 'tone';

export class SoundManager {
  private playerShootSynth: Tone.Synth;
  private enemyShootSynth: Tone.Synth;
  private hitSynth: Tone.MembraneSynth;
  private radarPingSynth: Tone.Synth;
  private movementNoise: Tone.Noise;
  private movementGain: Tone.Gain;
  private marqueeMusic: Tone.Player;

  constructor() {
    console.log('sound manager');
    // Initialize synths and effects
    this.playerShootSynth = new Tone.Synth().toDestination();
    this.enemyShootSynth = new Tone.Synth().toDestination();
    this.hitSynth = new Tone.MembraneSynth().toDestination();
    this.radarPingSynth = new Tone.Synth().toDestination();

    // Movement noise setup
    this.movementNoise = new Tone.Noise('pink');
    this.movementGain = new Tone.Gain(0).toDestination();
    this.movementNoise.connect(this.movementGain);

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
    this.movementNoise.start();
    this.movementGain.gain.setValueAtTime(0.1, Tone.now());
  }

  stopMovementNoise() {
    this.movementGain.gain.setValueAtTime(0, Tone.now());
    this.movementNoise.stop();
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
}