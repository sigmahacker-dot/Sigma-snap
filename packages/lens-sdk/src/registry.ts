// @sigma-snap/lens-sdk — LensRegistry.
import type { LensCategory, LensDefinition } from './types';

/** Registry of available lenses. New lenses are added by registering them — core code never changes. */
export class LensRegistry {
  private readonly lenses = new Map<string, LensDefinition>();

  /** Register (or replace) a lens. Throws on malformed definitions. */
  register(lens: LensDefinition): void {
    if (!lens || typeof lens.id !== 'string' || lens.id.length === 0) {
      throw new Error('[lens-sdk] register() requires a lens with a non-empty string id');
    }
    if (typeof lens.apply !== 'function' || typeof lens.thumbnail !== 'function') {
      throw new Error(`[lens-sdk] lens "${lens.id}" must implement apply() and thumbnail()`);
    }
    this.lenses.set(lens.id, lens);
  }

  /** Every registered lens, in registration order. */
  all(): LensDefinition[] {
    return [...this.lenses.values()];
  }

  /** Look up a lens by id (kebab-case). */
  get(id: string): LensDefinition | undefined {
    return this.lenses.get(id);
  }

  /** True when a lens with this id is registered. */
  has(id: string): boolean {
    return this.lenses.has(id);
  }

  /** All lenses in one category, in registration order. */
  byCategory(category: LensCategory): LensDefinition[] {
    return this.all().filter((lens) => lens.category === category);
  }

  /** Remove a lens. Returns true when something was removed. */
  unregister(id: string): boolean {
    return this.lenses.delete(id);
  }
}
