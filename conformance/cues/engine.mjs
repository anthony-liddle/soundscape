// The engine's own parseCueDocument, loaded straight from its TypeScript
// source, so the corpus's expected results always come from the code in this
// checkout, with no build in between. Node strips the types; this hook only
// adds the `.ts` the source's relative imports leave off.
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) {
      for (const tail of ['.ts', '/index.ts']) {
        const url = new URL(specifier + tail, context.parentURL);
        if (existsSync(fileURLToPath(url))) return next(url.href, context);
      }
    }
    return next(specifier, context);
  },
});

export const { parseCueDocument } = await import('../../packages/engine/src/cues/index.ts');

export const NOT_JSON = 'is not valid JSON';

/**
 * The engine's answer for a text, as the corpus records it: `{ ok: true }`, or
 * the whole ordered list of problems. A text that is not JSON is recorded with
 * the message "is not valid JSON" alone: what follows it is the JavaScript
 * engine's own JSON.parse wording, which differs between engines and Node
 * releases, so both suites compare only the path "" and that prefix.
 */
export function answerFor(text) {
  const result = parseCueDocument(text);
  if (result.ok) return { ok: true };
  const problems = result.problems.map(({ path, message }) =>
    path === '' && message.startsWith(NOT_JSON) ? { path, message: NOT_JSON } : { path, message },
  );
  return { ok: false, problems };
}
