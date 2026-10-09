import SwiftUI

@main
struct CueCheckApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

/// One screen: the output, the controls, the log, and Peach's cues.
struct ContentView: View {
    @State private var model = Model()
    @Environment(\.scenePhase) private var phase

    var body: some View {
        NavigationStack {
            List {
                Section("Output") {
                    LabeledContent("Now", value: model.output)
                    LabeledContent("Player", value: model.rendering)
                }

                Section("Controls") {
                    Button("Type a word fast") {
                        Task { await model.typeFast() }
                    }
                    LabeledContent("Cues asked for", value: "\(model.asked)")
                    LabeledContent("Volume") {
                        Slider(value: Binding(get: { model.volume }, set: { model.setVolume($0) }), in: 0...1)
                    }
                    Toggle("Mute", isOn: Binding(get: { model.muted }, set: { model.setMuted($0) }))
                }

                Section("Log, newest first") {
                    if model.log.isEmpty {
                        Text("Nothing yet").foregroundStyle(.secondary)
                    }
                    ForEach(model.log.reversed()) { entry in
                        HStack(alignment: .firstTextBaseline) {
                            Text(entry.time, format: .dateTime.hour().minute().second())
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                            Text(entry.text)
                        }
                        .font(.footnote)
                    }
                }

                Section("Peach's cues") {
                    if let problem = model.problem {
                        Text(problem).foregroundStyle(.red)
                    }
                    ForEach(model.names, id: \.self) { name in
                        Button(name) { model.play(name) }
                    }
                }
            }
            .navigationTitle("Cue Check")
        }
        .task { await model.load() }
        .task {
            // The session's rate and channels can change without a
            // notification the app sees first, so they are read twice a second
            while !Task.isCancelled {
                model.refreshOutput()
                try? await Task.sleep(for: .milliseconds(500))
            }
        }
        .onChange(of: phase) { _, phase in
            model.note("app: \(phase)")
        }
    }
}
