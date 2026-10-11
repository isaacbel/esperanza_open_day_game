/**
 * GameState.ts - Central State Machine for HAND CATCH
 * Pure TypeScript state management. Decouples state changes from React renders.
 */
import { AppState, GameMode } from '../vision/HandTypes';

export interface GameOverStats {
  score: number;
  maxCombo: number;
  caught: number;
  missed: number;
  totalSpawned: number;
  accuracy: number;
  averageReactionTime: number;
  bestReactionTime?: number;
  performanceRating: string;
  objectsPerMinute?: number;
  highestLevel?: string;
  xpEarned?: number;
  playerLevel?: number;
  playerTitle?: string;
  handControlRating?: number;
  achievementsUnlocked?: string[];
  spatialInsights?: string[];
  weakSide?: string;
  dominantSide?: string;
  leftAccuracy?: number;
  rightAccuracy?: number;
  centerAccuracy?: number;
  mode: GameMode;
  playerName: string;
  reason: string;
}

export type StateChangeListener = (state: AppState, payload?: unknown) => void;

export class GameStateManager {
  private currentState: AppState = 'LOADING';
  private currentMode: GameMode = 'NORMAL';
  private playerName: string = 'PLAYER';
  private listeners: Set<StateChangeListener> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedName = localStorage.getItem('handCatch.playerName');
        if (savedName) this.playerName = savedName.slice(0, 12);
        const savedMode = localStorage.getItem('handCatch.mode');
        if (savedMode === 'ENDLESS') this.currentMode = 'ENDLESS';
      } catch (_) {}
    }
  }

  public getState(): AppState {
    return this.currentState;
  }

  public getMode(): GameMode {
    return this.currentMode;
  }

  public setMode(mode: GameMode): void {
    this.currentMode = mode;
    try {
      localStorage.setItem('handCatch.mode', mode);
    } catch (_) {}
  }

  public getPlayerName(): string {
    return this.playerName;
  }

  public setPlayerName(name: string): void {
    const clean = name.trim().slice(0, 12) || 'PLAYER';
    this.playerName = clean;
    try {
      localStorage.setItem('handCatch.playerName', clean);
    } catch (_) {}
  }

  public setState(nextState: AppState, payload?: unknown): void {
    if (this.currentState === nextState && !payload) return;
    this.currentState = nextState;
    this.notify(nextState, payload);
  }

  public subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(state: AppState, payload?: unknown): void {
    for (const listener of this.listeners) {
      listener(state, payload);
    }
  }
}

export const gameStateManager = new GameStateManager();
