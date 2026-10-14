import { AudioEngine, parseCueDocument, type CueDocument } from 'soundscape-engine'
import peachCues from '../../../../examples/cues/peach.cues.json?raw'
import everyFeatureCues from '../../../../examples/cues/every-feature.cues.json?raw'

/**
 * The cue audition page: one button per cue in a cue document, played through
 * a real AudioContext. Two documents, each read as text and parsed the way a
 * game would:
 *
 * - examples/cues/peach.cues.json, two of Peach of a Word's sounds, the default;
 * - examples/cues/every-feature.cues.json, every feature cue the Swift renderer
 *   is held to, the same document Cue Check plays, so the two can be heard
 *   side by side on one phone. `?document=every-feature` opens it.
 */
const DOCUMENTS = {
  peach: { label: "Two of Peach of a Word's sounds", text: peachCues },
  'every-feature': { label: 'Every feature cue', text: everyFeatureCues },
} as const
type DocumentName = keyof typeof DOCUMENTS

const engine = new AudioEngine()
let started: Promise<void> | null = null
let loaded: DocumentName | null = null

const list = document.getElementById('cues')!
const status = document.getElementById('status')!
const choice = document.getElementById('document') as HTMLSelectElement

function parse(name: DocumentName): CueDocument {
  const parsed = parseCueDocument(DOCUMENTS[name].text)
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.path}: ${p.message}`).join('; '))
  return parsed.document
}

/**
 * The AudioContext must start from a user gesture, so it starts on the first
 * press, and the chosen document is loaded then, or again when it changes.
 */
async function ready(): Promise<void> {
  started ??= engine.initialize()
  await started
  const name = choice.value as DocumentName
  if (loaded !== name) {
    engine.loadCues(parse(name))
    loaded = name
  }
}

function show(name: DocumentName): void {
  list.replaceChildren()
  let cues: CueDocument['cues']
  try {
    cues = parse(name).cues
  } catch (error) {
    status.textContent = `The cue document is invalid: ${(error as Error).message}`
    return
  }
  for (const [cue, { notes }] of Object.entries(cues)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'primary'
    button.textContent = cue
    button.setAttribute('aria-describedby', `${cue}-notes`)
    const description = document.createElement('span')
    description.id = `${cue}-notes`
    description.className = 'notes'
    description.textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`
    button.addEventListener('click', async () => {
      await ready()
      await engine.resume()
      engine.playCue(cue)
      status.textContent = `Played ${cue}.`
    })
    const row = document.createElement('li')
    row.append(button, description)
    list.append(row)
  }
  status.textContent = `${DOCUMENTS[name].label}: ${Object.keys(cues).length} cues. Press one to hear it.`
}

for (const [name, { label }] of Object.entries(DOCUMENTS)) {
  choice.append(new Option(label, name))
}
const asked = new URLSearchParams(location.search).get('document')
choice.value = asked !== null && asked in DOCUMENTS ? asked : 'peach'
choice.addEventListener('change', () => {
  const name = choice.value as DocumentName
  const url = new URL(location.href)
  if (name === 'peach') url.searchParams.delete('document')
  else url.searchParams.set('document', name)
  history.replaceState(null, '', url)
  show(name)
})
show(choice.value as DocumentName)

const mute = document.getElementById('mute') as HTMLInputElement
mute.addEventListener('change', async () => {
  await ready()
  engine.setCuesMuted(mute.checked)
  status.textContent = mute.checked ? 'Cues muted.' : 'Cues unmuted.'
})
