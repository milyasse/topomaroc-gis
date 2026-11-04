// @ts-check
/** Pile d'annulation / rétablissement des opérations d'édition (session courante). */

/** @typedef {{ label: string, undo: () => Promise<void>|void, redo: () => Promise<void>|void }} Command */

export class History extends EventTarget {
  constructor(limit = 100) {
    super();
    /** @type {Command[]} */ this.undoStack = [];
    /** @type {Command[]} */ this.redoStack = [];
    this.limit = limit;
  }
  /** Enregistre une opération déjà effectuée. @param {Command} cmd */
  push(cmd) {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.emit();
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  async undo() {
    const c = this.undoStack.pop();
    if (!c) return null;
    await c.undo();
    this.redoStack.push(c);
    this.emit();
    return c.label;
  }
  async redo() {
    const c = this.redoStack.pop();
    if (!c) return null;
    await c.redo();
    this.undoStack.push(c);
    this.emit();
    return c.label;
  }
  clear() { this.undoStack = []; this.redoStack = []; this.emit(); }
  emit() { this.dispatchEvent(new CustomEvent('change')); }
}
