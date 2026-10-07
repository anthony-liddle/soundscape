/**
 * Which keys the focused element keeps for itself, so a shortcut never takes
 * a key the element needs.
 */

// Inputs of every kind keep every key, as they always have here: a slider
// keeps its arrows, a checkbox its Space. So does anything you can type into.
const KEEPS_EVERY_KEY = 'input, textarea, [contenteditable]:not([contenteditable="false"])';

// Controls that Space presses, toggles or opens
const KEEPS_SPACE = [
  'button',
  'select',
  'summary',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(', ');

export function keepsEveryKey(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(KEEPS_EVERY_KEY) !== null;
}

export function keepsSpace(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(KEEPS_SPACE) !== null;
}
