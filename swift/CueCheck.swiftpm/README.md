# Cue Check

The smallest app for hearing Soundscape's Swift cue player on an iPhone. It plays Peach of a Word's 34 cues through `CuePlayer`. It is for testing only: it is never submitted and never shipped.

It is an app playground, a Swift package Xcode opens as an app. That needs nothing installed but Xcode: no project to generate, and no project file to keep. It depends on this repository's Soundscape package by its path, so it always plays the library as it is in your clone.

## What It Shows

- **Output.** *Now* is the output's sample rate, channel count and route, as the audio session reports them, read twice a second. *Player* is the rate the player read from the output and renders at, and the output's channels.
- **Type a word fast.** Five ticks at 20 presses a second, the fastest bursts of the fastest typists, then the found cue for a five-letter word, as Peach plays them. *Cues asked for* counts every cue the app has asked for.
- **Volume and Mute,** the player's `setCueVolume` and `cuesMuted`.
- **The log, newest first.** Lines starting `player:` are what the player did: interruptions, output changes and rebuilds, a media services reset, going inactive, and the engine starting again. Lines starting `route:` and `app:` are the system's route changes and the app's own phase, shown beside them.
- **Peach's cues.** A tap plays one.

## Run It On Your iPhone

You need a Mac with Xcode 26 or later, an iPhone on iOS 17 or later, and a USB cable for the first run. A free Apple Account is enough to sign with.

1. **Sign in to Xcode,** once: Xcode › Settings › Accounts, then **+** and your Apple Account. A free account appears as a team named *Your Name (Personal Team)*.
2. **Open the app.** In Terminal, from the repository's root: `open swift/CueCheck.swiftpm`. Xcode opens it and resolves the Soundscape package from the repository; wait until the activity area at the top says it is done.
3. **Connect the iPhone** with the cable and unlock it. If it asks whether to trust this computer, tap **Trust** and enter its passcode.
4. **Turn on Developer Mode,** once: on the iPhone, Settings › Privacy & Security › Developer Mode. The switch appears only after the phone has been connected to Xcode. Turn it on, let the phone restart, and confirm.
5. **Choose the phone as the destination.** In Xcode's toolbar, next to the scheme *Cue Check*, open the destination menu and pick the iPhone. The first time, Xcode prepares the phone for development, which can take a few minutes.
6. **Choose your team.** Select *Cue Check* at the top of the navigator on the left, then **Signing & Capabilities**, and pick your team from **Team**. Xcode should write it into `teamIdentifier` in `Package.swift`.
   - **Check what it changed:** `git diff swift/CueCheck.swiftpm/Package.swift`. If anything besides `teamIdentifier` changed, undo it with `git checkout swift/CueCheck.swiftpm/Package.swift`, and set the team by hand.
   - **By hand,** if the picker is unavailable or changed more: put the team's ten-character ID between the quotes of `teamIdentifier: ""`. A paid team's ID is under Membership details on developer.apple.com. For the team Peach's iOS app signs with, it is `DEVELOPMENT_TEAM` in that project's `project.yml`.
   - **Keep the team out of commits.** If Xcode says the bundle identifier is taken, change `bundleIdentifier` in `Package.swift` to something of your own.
7. **Run it:** Product › Run, or **⌘R**. Xcode builds, installs and opens the app on the phone.
8. **If the phone says *Untrusted Developer*,** as it does for a free team: Settings › General › VPN & Device Management, tap your Apple Account, then **Trust**. Open the app again from the home screen.
9. **Turn silent mode off** before listening: the cues use the `.ambient` category, so silent mode silences them, as it should.

An app signed with a free team stops opening after seven days. Run it from Xcode again to renew it.

## How It Stays Honest

- **The cue file is a copy.** An app's resources must sit inside it, so `peach-of-a-word.json` is a copy of `conformance/cues/cases/peach-of-a-word.json`. `CueCheckTests` in the package's tests fails if the two ever differ by a byte.
- **CI builds it.** The `apple` job builds the app for the iOS Simulator on every push, so it cannot quietly stop compiling against the library.

## Antoine's Check

What `0.1.0` waits for. Do these in order, on the phone, with silent mode off unless a step says otherwise. Each says what you should see or hear. Anything else is a finding: note what the log said.

1. **The cues sound like the web game's.** On the phone or the Mac, open [peachofaword.com/sounds](https://peachofaword.com/sounds), the game's page of every sound it makes. Play the same cues in both, at least `tick`, `invalid`, `found-3-set`, `found-8-mythic-cute`, `source` and `edition`.
   - *Hear:* the same notes, the same lengths and the same loudness in both. The web page plays through WebKit, which the Swift renders are held to.
2. **A tap feels immediate.** Tap `tick` a few times, at your own pace.
   - *Hear:* each tick as your finger lifts, with no lag you notice.
3. **Silent mode silences it.** Turn silent mode on, with the Ring/Silent switch or the Action button, and tap a few cues.
   - *Hear:* nothing.
   - *See:* *Cues asked for* still counts them.
   - Turn silent mode off, and the next tap sounds.
4. **Other apps' music keeps playing.** Start music in Music or another app, come back to Cue Check, and tap cues.
   - *Hear:* the music carries on at its own level, neither paused nor quieter, and the cues play over it.
5. **After Siri or a call, the next tap plays.** Ask Siri something, or have someone call you and end the call. Then come back and tap a cue.
   - *See:* the log includes `player: interrupted, engine stopped`, often with `player: interruption over, resuming` after it.
   - *Hear and see:* the next tap plays, and the log includes `player: started at`.
6. **AirPods mid-session.** Play a cue on the speaker, then connect AirPods while the app is open.
   - *See:* the log includes `route: new device`, and *Now* names the AirPods. If the rate or the channels changed, it includes `player: output changed` and `player: rebuilt at` the new rate.
   - *Hear:* the next tap plays in the AirPods at the right pitch and speed, with no crackle. Take them out, and the same holds on the speaker.
7. **Home screen and back.** Go to the home screen, wait a few seconds, and come back.
   - *See:* the log includes `player: app went inactive, engine stopped` and `app: background`, and `app: active` on your return. The order of these lines, and any others the system adds, does not matter.
   - *Hear and see:* the next tap plays, and the log includes `player: started at`.
8. **The fast button never drops a cue.** Press *Type a word fast*, then press it again and again, as fast as you can.
   - *Hear:* every time, five quick ticks then the chime, with none missing and none cut short.
   - *See:* *Cues asked for* rises by 6 with each press.
