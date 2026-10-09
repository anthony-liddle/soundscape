# Releasing

Two things ship from this repository, on two lines of tags that never meet:

| What | Tags | Where it goes | Changelog |
|---|---|---|---|
| The engine, `soundscape-engine` | `engine-v0.4.0` and on | npm, by `.github/workflows/publish.yml` | `packages/engine/CHANGELOG.md` |
| The Swift package, `Soundscape` | `0.1.0` and on, bare semver | nowhere: SwiftPM reads the tag from GitHub | `swift/CHANGELOG.md` |

For both:

- **Tag the merge commit on `main`,** never a branch's commit before it merges.
- **Never move or delete a tag once pushed.** npm will not take a version twice. SwiftPM records each tag's commit in its users' `Package.resolved`, so a moved tag breaks their builds.

## The Engine

1. **On a branch,** set the version in `packages/engine/package.json`, and move the changelog's *Unreleased* section under a heading for it, `## 0.5.0 - <date>`, opening a fresh *Unreleased* above. Commit it as `chore(engine): release 0.5.0`.
2. **Open a pull request,** and merge it once CI is green.
3. **Tag the merge commit and push the tag:**

   ```sh
   git switch main && git pull
   git tag engine-v0.5.0
   git push origin engine-v0.5.0
   ```

4. **`publish.yml` runs on the tag.** It checks the tag matches `package.json`, tests, builds, checks the package, and publishes with npm's trusted publishing, so there is no token. A version with a hyphen, such as `0.5.0-rc.1`, goes to the `next` dist-tag, anything else to `latest`.
5. **A workflow runs from the tag's commit.** A fix to `publish.yml` takes a new version and a new tag.
6. **Removing a dist-tag is by hand,** after a release candidate: `npm dist-tag rm soundscape-engine next --otp=<code>`. It needs a local login and a one-time code passed explicitly; npm will not prompt for it.

## The Swift Package

Nothing publishes the Swift package: a tag on GitHub is the release. SwiftPM reads a tag as a version only if it is semver, with at most a leading `v`, so it never sees the engine's `engine-v*` tags. This package's tags are bare, `0.1.0`, with no `v`.

1. **Before every release:** Antoine's check, in `swift/CueCheck.swiftpm/README.md`, passes on his iPhone.
2. **On a branch,** move `swift/CHANGELOG.md`'s *Unreleased* section under a heading for the version, `## 0.2.0 - <date>`, opening a fresh *Unreleased* above, and commit it as `chore(swift): release 0.2.0`. No file holds the version.
3. **Open a pull request,** and merge it once `test`, `swift` and `apple` are green.
4. **Tag the merge commit and push the tag:**

   ```sh
   git switch main && git pull
   git tag 0.2.0
   git push origin 0.2.0
   ```

5. **Check it from outside.** In a scratch directory outside the repository, make a package that depends on `https://github.com/anthony-liddle/soundscape.git` with `exact: "0.2.0"`, build it, and play a cue. That is what a user's first fetch does.
6. **Optionally, a GitHub release** from the tag, its notes the changelog's section: `gh release create 0.2.0 --verify-tag --title 0.2.0 --notes-file <section>`.

## Why A Bare Tag Cannot Publish The Engine

- **`publish.yml` runs only for pushed tags matching `engine-v*`.** In GitHub's filter patterns `*` matches any characters but `/`, so the pattern needs a tag that begins `engine-v`, and `0.1.0` does not.
- **Even if it ran,** a step before any publishing compares the tag with `engine-v` stripped, here `0.1.0`, to the engine's `package.json` version, and stops on the mismatch.
- **The other workflows don't run on tags either.** `test.yml` and `deploy.yml` filter pushes by branch alone, and a workflow whose push trigger names branches and no tags does not run when a tag is pushed.
