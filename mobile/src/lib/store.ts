import { useEffect, useState } from "react";

// Memoria entre pantallas: la lista y sus hojas (pantallas modales) ven los mismos datos y se actualizan juntas.
export function createStore<T>(empty: T) {
  const data = new Map<string, T>();
  const listeners = new Set<() => void>();
  const get = (key: string) => data.get(key) ?? empty;
  const set = (key: string, update: (current: T) => T) => { data.set(key, update(get(key))); listeners.forEach((listener) => listener()); };

  function useValue(key: string) {
    const [, setTick] = useState(0);
    useEffect(() => {
      const listener = () => setTick((value) => value + 1);
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }, []);
    return get(key);
  }

  return { get, set, has: (key: string) => data.has(key), useValue };
}
