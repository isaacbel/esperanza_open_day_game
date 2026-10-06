/**
 * AchievementSystem.ts - Persistent Achievement Engine
 *
 * Tracks milestone triggers, unlocks achievements in localStorage,
 * and emits celebratory toast notifications.
 */

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  xpReward: number;
  unlockedAt?: string;
}

export const ALL_ACHIEVEMENTS: Achievement[] = [
  { id: 'first_catch', icon: '🏆', title: 'First Catch', description: 'Catch your first falling column.', xpReward: 100 },
  { id: 'speed_demon', icon: '⚡', title: 'Speed Demon', description: 'React and catch in under 180 ms.', xpReward: 350 },
  { id: 'lightning_strike', icon: '⚡⚡', title: 'Lightning Fast', description: 'Reach a hand velocity above 450 px/s on catch.', xpReward: 400 },
  { id: 'combo_master', icon: '🔥', title: 'Combo Master', description: 'Reach a combo streak of 30 or more.', xpReward: 500 },
  { id: 'combo_god', icon: '🔥🔥', title: 'Unstoppable Flow', description: 'Reach a combo streak of 50 or more.', xpReward: 1000 },
  { id: 'two_hands', icon: '👐', title: 'Two Hands Master', description: 'Catch simultaneous targets on opposite sides of the arena.', xpReward: 450 },
  { id: 'bomb_deflector', icon: '💥', title: 'Bomb Deflector', description: 'Deflect a hazard bomb with a high-velocity swipe.', xpReward: 500 },
  { id: 'perfect_grab', icon: '✊', title: 'Iron Grip', description: 'Execute 5 perfect fist grabs in a single game.', xpReward: 300 },
  { id: 'pinch_precision', icon: '🤏', title: 'Micro Precision', description: 'Catch an object using a pinch gesture.', xpReward: 350 },
  { id: 'ghost_buster', icon: '👻', title: 'Ghost Buster', description: 'Solidify and catch a phase-shifting ghost object.', xpReward: 400 },
  { id: 'time_dilation', icon: '❄️', title: 'Chrono Shifter', description: 'Catch a freeze orb to slow down time.', xpReward: 250 },
  { id: 'teleport_hunter', icon: '🌀', title: 'Quantum Hunter', description: 'Intercept a teleporting object immediately after warp.', xpReward: 450 },
  { id: 'nightmare_survivor', icon: '💀', title: 'Nightmare Survivor', description: 'Survive Nightmare Mode with a score over 10,000.', xpReward: 1500 },
  { id: 'perfect_round', icon: '🎯', title: 'Flawless Victory', description: 'Complete a full round with 100% accuracy.', xpReward: 1200 },
  { id: 'zen_master', icon: '🧘', title: 'Zen Flow', description: 'Achieve a 40+ combo in Zen mode without any rushed gestures.', xpReward: 600 }
];

export class AchievementSystem {
  private static STORAGE_KEY = 'handCatch.achievements';
  public static newlyUnlocked: Achievement[] = [];

  public static getUnlockedIds(): Set<string> {
    if (typeof window === 'undefined') return new Set();
    try {
      const saved = localStorage.getItem(AchievementSystem.STORAGE_KEY);
      if (saved) return new Set(JSON.parse(saved));
    } catch (_) {}
    return new Set();
  }

  public static checkAndUnlock(id: string): Achievement | null {
    const unlocked = AchievementSystem.getUnlockedIds();
    if (unlocked.has(id)) return null;

    const achievement = ALL_ACHIEVEMENTS.find(a => a.id === id);
    if (!achievement) return null;

    unlocked.add(id);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(AchievementSystem.STORAGE_KEY, JSON.stringify(Array.from(unlocked)));
      } catch (_) {}
    }

    AchievementSystem.newlyUnlocked.push(achievement);
    return achievement;
  }

  public static getAllWithStatus(): (Achievement & { isUnlocked: boolean })[] {
    const unlocked = AchievementSystem.getUnlockedIds();
    return ALL_ACHIEVEMENTS.map(a => ({
      ...a,
      isUnlocked: unlocked.has(a.id)
    }));
  }
}
