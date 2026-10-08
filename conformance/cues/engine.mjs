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
