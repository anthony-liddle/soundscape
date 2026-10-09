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
