/// The cue format this library reads, as `CUE_FORMAT` and `CUE_VERSION` name it
/// in the engine's `cues/types.ts`.
public enum CueFormat {
    /// Every cue document's `format`, so a cue file cannot be mistaken for anything else.
    public static let name = "soundscape-cues"
    /// The one version so far. A document of any other version is refused.
    public static let version = 1
}
