import { createContext, useContext, useReducer } from "react";
import type { Dispatch } from "react";
import {
  boothReducer,
  initialBoothContext,
  type BoothContext,
  type BoothEvent,
} from "../state/BoothStateMachine";
import { defaultSettings, type BoothSettings } from "./Settings";

/**
 * Top-level app state: the booth state machine plus operator-configurable
 * settings. Kept separate from BoothStateMachine.ts so the state machine
 * itself stays a pure, framework-free module (easy to unit test).
 */
export interface AppState {
  booth: BoothContext;
  settings: BoothSettings;
}

export type AppAction =
  | { kind: "booth"; event: BoothEvent }
  | { kind: "settings"; patch: Partial<BoothSettings> }
  | { kind: "settings/reset" };

export const initialAppState: AppState = {
  booth: initialBoothContext,
  settings: defaultSettings,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.kind) {
    case "booth":
      return { ...state, booth: boothReducer(state.booth, action.event) };
    case "settings":
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case "settings/reset":
      return { ...state, settings: defaultSettings };
    default:
      return state;
  }
}

export const AppStateContext = createContext<AppState>(initialAppState);
export const AppDispatchContext = createContext<Dispatch<AppAction>>(() => {});

export function useAppState(): AppState {
  return useContext(AppStateContext);
}

export function useAppDispatch(): Dispatch<AppAction> {
  return useContext(AppDispatchContext);
}

/** Convenience hook mirroring useReducer, used once at the App root. */
export function useAppReducer() {
  return useReducer(appReducer, initialAppState);
}
