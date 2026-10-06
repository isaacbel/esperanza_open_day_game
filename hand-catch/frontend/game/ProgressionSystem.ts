/**
 * ProgressionSystem.ts - Player XP, Levels (1-20), Titles and Unlockables
 *
 * Persists player progression to localStorage.
 * Awards XP dynamically based on score, combo multipliers, catch style, and accuracy.
 */

export interface LevelThreshold {
  level: number;
  title: string;
  xpRequired: number;
  unlockName: string;
  unlockDesc: string;
}

export const LEVEL_TIERS: LevelThreshold[] = [
  { level: 1,  title: 'NOVICE CADET',     xpRequired: 0,      unlockName: 'Neon Arena',       unlockDesc: 'Standard Cyberspace Arena' },
  { level: 2,  title: 'REFLEX INITIATE',  xpRequired: 500,    unlockName: 'Gold Pulse',       unlockDesc: 'Golden particle catch burst' },
  { level: 3,  title: 'CYBER GRIPPER',    xpRequired: 1200,   unlockName: 'Survival Mode',    unlockDesc: 'Endless accelerating challenge' },
  { level: 4,  title: 'VECTOR PILOT',     xpRequired: 2200,   unlockName: 'Time Attack',      unlockDesc: '30-second rapid sprint' },
  { level: 5,  title: 'NEURAL CATCHER',   xpRequired: 3500,   unlockName: 'Zen Mode',         unlockDesc: 'Calm, flow-state practice' },
  { level: 6,  title: 'LIGHTNING HAND',   xpRequired: 5200,   unlockName: 'Emerald Trail',    unlockDesc: 'Vibrant green motion trails' },
  { level: 7,  title: 'QUANTUM AGENT',    xpRequired: 7400,   unlockName: 'Chaos Mode',       unlockDesc: 'Dense multi-trajectory storm' },
  { level: 8,  title: 'DUAL STRIKER',     xpRequired: 10000,  unlockName: 'Two Hands Mode',   unlockDesc: 'Coordinated dual hand trials' },
  { level: 9,  title: 'HYPER REFLEX',     xpRequired: 13200,  unlockName: 'Plasma Shockwave', unlockDesc: 'Intense radial floor pulses' },
  { level: 10, title: 'SYNAPSE MASTER',   xpRequired: 17000,  unlockName: 'Cyber Gold Skin',  unlockDesc: 'Metallic gold hand skeleton' },
  { level: 11, title: 'ARCADE GLADIATOR', xpRequired: 21500,  unlockName: 'Slow-Mo Matrix',   unlockDesc: 'Enhanced time dilation FX' },
  { level: 12, title: 'SUB-SECOND TITAN', xpRequired: 26800,  unlockName: 'Nightmare Mode',   unlockDesc: 'Ultra-fast brutal overdrive' },
  { level: 13, title: 'PHANTOM INTERCEPT',xpRequired: 33000,  unlockName: 'Ghost Scanner',    unlockDesc: 'Spectral aura hand overlay' },
  { level: 14, title: 'KINETIC EMPEROR',  xpRequired: 40000,  unlockName: 'Electric Trails',  unlockDesc: 'Lightning lightning sparks' },
  { level: 15, title: 'NEO CHOREOGRAPHER',xpRequired: 48000,  unlockName: 'VIP Call-Sign',    unlockDesc: 'Glowing animated name tag' },
  { level: 16, title: 'TEMPORAL DRIFTER', xpRequired: 57000,  unlockName: 'Vortex Burst',     unlockDesc: 'Swirling gravity explosions' },
  { level: 17, title: 'OVERDRIVE MONARCH',xpRequired: 67000,  unlockName: 'Crimson Fury',     unlockDesc: 'Deep crimson theme palette' },
  { level: 18, title: 'SUPREME CATCHER',  xpRequired: 78500,  unlockName: 'Supernova Aura',   unlockDesc: 'Blinding milestone explosions' },
  { level: 19, title: 'TRANSCENDENT',     xpRequired: 91500,  unlockName: 'God-Speed Flare',  unlockDesc: 'Sub-150ms reflex aura' },
  { level: 20, title: 'CYBERNETIC DEITY', xpRequired: 106000, unlockName: 'Infinite Crown',   unlockDesc: 'Legendary Master Badge' }
];

export interface XPGainBreakdown {
  scoreXP: number;
  comboXP: number;
  accuracyXP: number;
  styleBonusXP: number;
  totalXP: number;
  leveledUp: boolean;
  oldLevel: number;
  newLevel: number;
  unlockedItem?: LevelThreshold;
}

export class ProgressionSystem {
  private static STORAGE_KEY = 'handCatch.progression';

  public static getProgression(): { xp: number; level: number; title: string; currentTier: LevelThreshold; nextTier: LevelThreshold | null } {
    let totalXP = 0;
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(ProgressionSystem.STORAGE_KEY);
        if (saved) totalXP = parseInt(saved, 10) || 0;
      } catch (_) {}
    }

    let currentTier = LEVEL_TIERS[0];
    let nextTier: LevelThreshold | null = LEVEL_TIERS[1];

    for (let i = LEVEL_TIERS.length - 1; i >= 0; i--) {
      if (totalXP >= LEVEL_TIERS[i].xpRequired) {
        currentTier = LEVEL_TIERS[i];
        nextTier = LEVEL_TIERS[i + 1] || null;
        break;
      }
    }

    return {
      xp: totalXP,
      level: currentTier.level,
      title: currentTier.title,
      currentTier,
      nextTier
    };
  }

  public static awardSessionXP(
    score: number,
    maxCombo: number,
    accuracy: number,
    caught: number
  ): XPGainBreakdown {
    const prevProg = ProgressionSystem.getProgression();

    const scoreXP = Math.floor(score * 0.15);
    const comboXP = maxCombo * 25;
    const accuracyXP = Math.floor(accuracy * 5);
    const styleBonusXP = caught * 8;
    const totalGained = scoreXP + comboXP + accuracyXP + styleBonusXP;

    const newXP = prevProg.xp + totalGained;

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(ProgressionSystem.STORAGE_KEY, newXP.toString());
      } catch (_) {}
    }

    const newProg = ProgressionSystem.getProgression();
    const leveledUp = newProg.level > prevProg.level;

    return {
      scoreXP,
      comboXP,
      accuracyXP,
      styleBonusXP,
      totalXP: totalGained,
      leveledUp,
      oldLevel: prevProg.level,
      newLevel: newProg.level,
      unlockedItem: leveledUp ? newProg.currentTier : undefined
    };
  }
}
