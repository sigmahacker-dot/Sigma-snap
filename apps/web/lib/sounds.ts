// ORIGINAL synthesized UI sounds for SIGMA SNAP.
// Every sound is generated in-browser with the WebAudio API (oscillators +
// filtered noise). No audio files, no copyrighted material.
'use client';

let ctx: AudioContext | null = null;
function ac(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(opts: { freq: number; freqEnd?: number; dur?: number; type?: OscillatorType; gain?: number; delay?: number }) {
  try {
    const c = ac();
    const t0 = c.currentTime + (opts.delay ?? 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(opts.freq, t0);
    if (opts.freqEnd) o.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + (opts.dur ?? 0.15));
    const v = opts.gain ?? 0.12;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (opts.dur ?? 0.15));
    o.connect(g).connect(c.destination);
    o.start(t0); o.stop(t0 + (opts.dur ?? 0.15) + 0.05);
  } catch { /* audio unavailable */ }
}

function noiseBurst(opts: { dur?: number; gain?: number; filterFreq?: number; delay?: number }) {
  try {
    const c = ac();
    const t0 = c.currentTime + (opts.delay ?? 0);
    const len = Math.floor(c.sampleRate * (opts.dur ?? 0.08));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = opts.filterFreq ?? 2500;
    const g = c.createGain(); g.gain.value = opts.gain ?? 0.2;
    src.connect(f).connect(g).connect(c.destination);
    src.start(t0);
  } catch { /* noop */ }
}

export const sounds = {
  /** camera shutter: short filtered click */
  shutter() { noiseBurst({ dur: 0.06, gain: 0.35, filterFreq: 3200 }); tone({ freq: 1900, freqEnd: 900, dur: 0.05, type: 'square', gain: 0.05 }); },
  /** start video recording */
  recStart() { tone({ freq: 660, dur: 0.09, type: 'sine', gain: 0.14 }); tone({ freq: 990, dur: 0.12, type: 'sine', gain: 0.14, delay: 0.09 }); },
  /** stop video recording */
  recStop() { tone({ freq: 990, dur: 0.09, type: 'sine', gain: 0.14 }); tone({ freq: 660, dur: 0.12, type: 'sine', gain: 0.14, delay: 0.09 }); },
  /** focus lock blip */
  focus() { tone({ freq: 2400, dur: 0.05, type: 'sine', gain: 0.08 }); },
  /** message sent */
  send() { tone({ freq: 880, freqEnd: 1320, dur: 0.12, type: 'sine', gain: 0.1 }); },
  /** message received */
  receive() { tone({ freq: 1320, freqEnd: 880, dur: 0.12, type: 'sine', gain: 0.08 }); },
  /** like pop */
  pop() { tone({ freq: 520, freqEnd: 1040, dur: 0.1, type: 'triangle', gain: 0.16 }); },
  /** UI tap */
  tap() { tone({ freq: 700, dur: 0.05, type: 'sine', gain: 0.06 }); },
  /** success chime */
  success() { tone({ freq: 784, dur: 0.12, gain: 0.1 }); tone({ freq: 1046, dur: 0.16, gain: 0.1, delay: 0.1 }); },
  /** error buzz */
  error() { tone({ freq: 220, freqEnd: 160, dur: 0.2, type: 'sawtooth', gain: 0.08 }); },
  /** incoming call ring (two-tone loop tick) */
  ring() { tone({ freq: 940, dur: 0.18, gain: 0.1 }); tone({ freq: 940, dur: 0.18, gain: 0.1, delay: 0.28 }); },
  /** lens switch whoosh */
  whoosh() { noiseBurst({ dur: 0.18, gain: 0.12, filterFreq: 800 }); },
};
