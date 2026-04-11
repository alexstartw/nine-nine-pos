import { useReducer } from 'react';
import { createDefaultTab, TabState } from './types';

const MAX_TABS = 8;

type Action =
  | { type: 'ADD_TAB' }
  | { type: 'REMOVE_TAB'; id: string }
  | { type: 'SWITCH_TAB'; id: string }
  | { type: 'UPDATE_TAB'; id: string; patch: Partial<TabState> }
  | { type: 'RESET_TAB'; id: string };

interface ManagerState {
  tabs: TabState[];
  activeTabId: string;
}

function reducer(state: ManagerState, action: Action): ManagerState {
  switch (action.type) {
    case 'ADD_TAB': {
      if (state.tabs.length >= MAX_TABS) return state;
      const newTab = createDefaultTab(`訂單 ${state.tabs.length + 1}`);
      return { tabs: [...state.tabs, newTab], activeTabId: newTab.id };
    }
    case 'REMOVE_TAB': {
      if (state.tabs.length <= 1) return state;
      const idx = state.tabs.findIndex((t) => t.id === action.id);
      const newTabs = state.tabs.filter((t) => t.id !== action.id);
      const newActiveId =
        state.activeTabId === action.id
          ? newTabs[Math.max(0, idx - 1)].id
          : state.activeTabId;
      return { tabs: newTabs, activeTabId: newActiveId };
    }
    case 'SWITCH_TAB':
      return { ...state, activeTabId: action.id };
    case 'UPDATE_TAB':
      return {
        ...state,
        tabs: state.tabs.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t))
      };
    case 'RESET_TAB':
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id ? { ...createDefaultTab(t.label), id: t.id } : t
        )
      };
    default:
      return state;
  }
}

export function useTabManager() {
  const initialTab = createDefaultTab('訂單 1');
  const [state, dispatch] = useReducer(reducer, {
    tabs: [initialTab],
    activeTabId: initialTab.id
  });

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)!;

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab,
    addTab: () => dispatch({ type: 'ADD_TAB' }),
    removeTab: (id: string) => dispatch({ type: 'REMOVE_TAB', id }),
    switchTab: (id: string) => dispatch({ type: 'SWITCH_TAB', id }),
    updateTab: (id: string, patch: Partial<TabState>) =>
      dispatch({ type: 'UPDATE_TAB', id, patch }),
    resetTab: (id: string) => dispatch({ type: 'RESET_TAB', id }),
    canAddTab: state.tabs.length < MAX_TABS,
    canRemoveTab: state.tabs.length > 1
  };
}
