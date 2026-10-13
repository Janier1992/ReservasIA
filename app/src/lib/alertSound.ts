/**
 * Aviso sonoro corto (dos tonos) con Web Audio: sin archivos de audio.
 * El navegador solo deja sonar después de que alguien tocó la página;
 * si no se puede, no pasa nada.
 */
let context: AudioContext | null = null;

export function playAlertSound(): void {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    context ??= new AudioCtx();
    const ctx = context;
    if (ctx.state === "suspended") void ctx.resume();
    [880, 660].forEach((frequency, i) => {
      const start = ctx.currentTime + i * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.21);
    });
  } catch {
    // Sin audio disponible: la tarjeta igual queda resaltada.
  }
}
