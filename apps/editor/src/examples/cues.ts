import { AudioEngine, parseCueDocument } from 'soundscape-engine'
import peachCues from '../../../../examples/cues/peach.cues.json?raw'

/**
 * The cue audition page: one button per cue in a cue document, played through
 * a real AudioContext. The document is examples/cues/peach.cues.json, two of
 * Peach of a Word's sounds, read as text and parsed the way a game would.
 */
const engine = new AudioEngine()
let ready: Promise<void> | null = null

/** The AudioContext must start from a user gesture, so it starts on the first press. */
function start(): Promise<void> {
  ready ??= (async () => {
    await engine.initialize()
    const parsed = parseCueDocument(peachCues)
    if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.path}: ${p.message}`).join('\n'))
    engine.loadCues(parsed.document)
  })()
  return ready
}

const list = document.getElementById('cues')!
const status = document.getElementById('status')!

const parsed = parseCueDocument(peachCues)
if (!parsed.ok) {
  status.textContent = 'The cue document is invalid: ' + parsed.problems.map((p) => `${p.path}: ${p.message}`).join('; ')
} else {
  for (const name of Object.keys(parsed.document.cues)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'primary'
    button.textContent = name
    button.setAttribute('aria-describedby', `${name}-notes`)
    const notes = document.createElement('span')
    notes.id = `${name}-notes`
    notes.className = 'notes'
    const count = parsed.document.cues[name]!.notes.length
    notes.textContent = `${count} note${count === 1 ? '' : 's'}`
    button.addEventListener('click', async () => {
      await start()
      await engine.resume()
      engine.playCue(name)
      status.textContent = `Played ${name}.`
    })
    const row = document.createElement('li')
    row.append(button, notes)
    list.append(row)
  }
}

const mute = document.getElementById('mute') as HTMLInputElement
mute.addEventListener('change', async () => {
  await start()
  engine.setCuesMuted(mute.checked)
  status.textContent = mute.checked ? 'Cues muted.' : 'Cues unmuted.'
})
