import Security
import SwiftUI
import UIKit

@main
struct BYOKApp: App {
    var body: some Scene {
        WindowGroup {
            BYOKRootView()
        }
    }
}

struct BYOKRootView: View {
    @StateObject private var store = APIKeyStore()
    @State private var activeSheet: BYOKSheet?

    var body: some View {
        NavigationStack {
            List {
                if store.entries.isEmpty {
                    ContentUnavailableView(
                        "No Keys",
                        systemImage: "key",
                        description: Text("Choose a provider, paste the key, and BYOK will ask before sharing it.")
                    )
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                } else {
                    ForEach(store.entries) { entry in
                        Button {
                            activeSheet = .editor(KeyEditorDraft(
                                service: entry.id,
                                displayName: entry.displayName,
                                apiKey: store.key(for: entry.id) ?? ""
                            ))
                        } label: {
                            APIKeyRow(entry: entry)
                        }
                        .buttonStyle(.plain)
                        .swipeActions {
                            Button(role: .destructive) {
                                store.delete(entry)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
            }
            .navigationTitle("BYOK")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        activeSheet = .providerPicker
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add API key")
                }
            }
        }
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .providerPicker:
                ProviderPickerView(
                    store: store,
                    onSelect: { preset in
                        activeSheet = .editor(KeyEditorDraft(
                            service: preset.service,
                            displayName: preset.displayName,
                            apiKey: store.key(for: preset.service) ?? ""
                        ))
                    },
                    onCustom: {
                        activeSheet = .editor(KeyEditorDraft())
                    }
                )
            case .editor(let draft):
                KeyEditorView(store: store, draft: draft)
            case .share(let request):
                ShareRequestView(store: store, request: request)
            }
        }
        .onOpenURL { url in
            handle(url: url)
        }
    }

    private func handle(url: URL) {
        guard let link = BYOKDeepLink(url: url) else { return }
        guard let callbackURL = link.callbackURL else {
            activeSheet = .editor(KeyEditorDraft(
                service: link.service,
                displayName: ProviderCatalog.displayName(for: link.service),
                apiKey: store.key(for: link.service) ?? ""
            ))
            return
        }
        activeSheet = .share(KeyShareRequest(
            service: link.service,
            displayName: ProviderCatalog.displayName(for: link.service),
            callbackURL: callbackURL,
            source: link.source
        ))
    }
}

private enum BYOKSheet: Identifiable {
    case providerPicker
    case editor(KeyEditorDraft)
    case share(KeyShareRequest)

    var id: String {
        switch self {
        case .providerPicker:
            return "provider-picker"
        case .editor(let draft):
            return "editor-\(draft.id)"
        case .share(let request):
            return "share-\(request.id)"
        }
    }
}

private struct APIKeyRow: View {
    var entry: APIKeyEntry

    var body: some View {
        HStack(spacing: 12) {
            ProviderLogoMark(service: entry.id, size: 34)

            VStack(alignment: .leading, spacing: 3) {
                Text(ProviderCatalog.displayName(for: entry.id, fallback: entry.displayName))
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(entry.id)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text(entry.updatedAt, style: .date)
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }
}

private struct ProviderPickerView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: APIKeyStore

    var onSelect: (ProviderPreset) -> Void
    var onCustom: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section("AI Providers") {
                    ForEach(ProviderCatalog.aiProviders) { preset in
                        providerButton(preset)
                    }
                }

                Section("Data, Infra & Payments") {
                    ForEach(ProviderCatalog.infrastructureProviders) { preset in
                        providerButton(preset)
                    }
                }

                Section {
                    Button(action: onCustom) {
                        HStack(spacing: 12) {
                            ProviderLogoMark(service: "custom", size: 34)
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Custom Provider")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(.primary)
                                Text("Use any byok:// service name")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                }
            }
            .navigationTitle("Add Key")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func providerButton(_ preset: ProviderPreset) -> some View {
        Button {
            onSelect(preset)
        } label: {
            HStack(spacing: 12) {
                ProviderLogoMark(service: preset.service, size: 34)

                VStack(alignment: .leading, spacing: 3) {
                    Text(preset.displayName)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text(preset.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if store.key(for: preset.service) != nil {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.accentColor)
                }
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }
}

private struct KeyEditorDraft: Identifiable {
    var id = UUID()
    var service = ""
    var displayName = ""
    var apiKey = ""
}

private struct KeyEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: APIKeyStore

    @State private var service: String
    @State private var apiKey: String
    private let lockedPreset: ProviderPreset?

    init(store: APIKeyStore, draft: KeyEditorDraft) {
        self.store = store
        _service = State(initialValue: draft.service)
        _apiKey = State(initialValue: draft.apiKey)
        lockedPreset = ProviderCatalog.preset(for: draft.service)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        ProviderLogoMark(service: normalizedService.isEmpty ? "custom" : normalizedService, size: 42)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(displayName)
                                .font(.headline)
                            Text(normalizedService.isEmpty ? "Custom provider" : normalizedService)
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)

                    if lockedPreset == nil {
                        TextField("service-name", text: $service)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }

                    SecureField("API key", text: $apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Key")
                } footer: {
                    Text(footerText)
                }
            }
            .navigationTitle(displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        store.setKey(
                            apiKey.trimmingCharacters(in: .whitespacesAndNewlines),
                            for: service,
                            displayName: displayName
                        )
                        dismiss()
                    }
                    .disabled(!canSave)
                }
            }
        }
    }

    private var canSave: Bool {
        !normalizedService.isEmpty &&
        !apiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var normalizedService: String {
        APIKeyStore.normalizedService(service)
    }

    private var displayName: String {
        let name = ProviderCatalog.displayName(for: service)
        return name.isEmpty ? "API Key" : name
    }

    private var footerText: String {
        if let lockedPreset {
            return "Other apps request this key with byok://\(lockedPreset.service)."
        }
        return "The display name is generated automatically from the service name."
    }
}

private struct ShareRequestView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: APIKeyStore

    let request: KeyShareRequest

    @State private var replacementKey = ""
    @State private var message: String?

    private var storedKey: String? {
        store.key(for: request.service)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        ProviderLogoMark(service: request.service, size: 44)

                        VStack(alignment: .leading, spacing: 8) {
                            Text(request.displayName)
                                .font(.title3.weight(.semibold))
                            Text(request.source.map { "\($0) is asking for this key." } ?? "Another app is asking for this key.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }

                if storedKey == nil {
                    Section {
                        SecureField("API key", text: $replacementKey)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    } header: {
                        Text("No saved key")
                    } footer: {
                        Text("Save the key here to share it with the requesting app.")
                    }
                }

                Section {
                    Button {
                        share()
                    } label: {
                        Label(storedKey == nil ? "Save and Share" : "Share Key", systemImage: "arrowshape.turn.up.right")
                    }
                    .disabled(!canShare)

                    if let message {
                        Text(message)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Share Key?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private var canShare: Bool {
        storedKey != nil || !replacementKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func share() {
        let key: String
        if let storedKey {
            key = storedKey
        } else {
            key = replacementKey.trimmingCharacters(in: .whitespacesAndNewlines)
            store.setKey(key, for: request.service, displayName: request.displayName)
        }

        guard var components = URLComponents(url: request.callbackURL, resolvingAgainstBaseURL: false) else {
            message = "The callback URL is invalid."
            return
        }
        var items = components.queryItems ?? []
        items.removeAll { ["service", "key", "api_key"].contains($0.name) }
        items.append(URLQueryItem(name: "service", value: request.service))
        items.append(URLQueryItem(name: "key", value: key))
        components.queryItems = items

        guard let callbackURL = components.url else {
            message = "The callback URL could not be built."
            return
        }

        UIApplication.shared.open(callbackURL)
        dismiss()
    }
}

private struct BYOKDeepLink {
    var service: String
    var callbackURL: URL?
    var source: String?

    init?(url: URL) {
        guard url.scheme?.lowercased() == "byok" else { return nil }

        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let queryItems = components?.queryItems ?? []

        let rawService = url.host?.isEmpty == false
            ? url.host
            : url.pathComponents.first { $0 != "/" && $0.lowercased() != "request" }
        guard let rawService else { return nil }

        let normalized = APIKeyStore.normalizedService(rawService)
        guard !normalized.isEmpty else { return nil }

        service = normalized
        source = queryItems.first(where: { $0.name == "source" })?.value

        if let callback = queryItems.first(where: { $0.name == "callback" })?.value {
            callbackURL = URL(string: callback)
        }
    }
}

private struct KeyShareRequest: Identifiable {
    var id = UUID()
    var service: String
    var displayName: String
    var callbackURL: URL
    var source: String?
}

private struct ProviderPreset: Identifiable {
    var id: String { service }
    var service: String
    var displayName: String
    var subtitle: String
    var mark: String
    var background: Color
    var foreground: Color
}

private enum ProviderCatalog {
    static let aiProviders: [ProviderPreset] = [
        ProviderPreset(service: "openrouter", displayName: "OpenRouter", subtitle: "Model routing", mark: "OR", background: Color(red: 0.08, green: 0.10, blue: 0.13), foreground: .white),
        ProviderPreset(service: "ollama", displayName: "Ollama Cloud", subtitle: "Hosted Ollama models", mark: "OC", background: Color(red: 0.07, green: 0.09, blue: 0.15), foreground: .white),
        ProviderPreset(service: "elevenlabs", displayName: "ElevenLabs", subtitle: "Speech and transcription", mark: "11", background: Color(red: 0.95, green: 0.95, blue: 0.92), foreground: .black),
        ProviderPreset(service: "assemblyai", displayName: "AssemblyAI", subtitle: "Speech-to-text", mark: "AA", background: Color(red: 0.36, green: 0.29, blue: 1.00), foreground: .white),
        ProviderPreset(service: "openai", displayName: "OpenAI", subtitle: "Models and speech", mark: "AI", background: Color(red: 0.05, green: 0.45, blue: 0.36), foreground: .white),
        ProviderPreset(service: "anthropic", displayName: "Anthropic", subtitle: "Claude models", mark: "A", background: Color(red: 0.86, green: 0.80, blue: 0.72), foreground: Color(red: 0.18, green: 0.14, blue: 0.11)),
        ProviderPreset(service: "google", displayName: "Google AI", subtitle: "Gemini API", mark: "G", background: Color(red: 0.26, green: 0.52, blue: 0.96), foreground: .white),
        ProviderPreset(service: "xai", displayName: "xAI", subtitle: "Grok models", mark: "x", background: .black, foreground: .white),
        ProviderPreset(service: "mistral", displayName: "Mistral AI", subtitle: "Mistral models", mark: "M", background: Color(red: 1.00, green: 0.70, blue: 0.18), foreground: .black),
        ProviderPreset(service: "groq", displayName: "Groq", subtitle: "Fast inference", mark: "GQ", background: Color(red: 0.96, green: 0.30, blue: 0.12), foreground: .white),
        ProviderPreset(service: "deepseek", displayName: "DeepSeek", subtitle: "Reasoning models", mark: "DS", background: Color(red: 0.13, green: 0.31, blue: 0.88), foreground: .white),
        ProviderPreset(service: "perplexity", displayName: "Perplexity", subtitle: "Search-backed models", mark: "P", background: Color(red: 0.08, green: 0.58, blue: 0.58), foreground: .white),
        ProviderPreset(service: "together", displayName: "Together AI", subtitle: "Open model inference", mark: "T", background: Color(red: 0.13, green: 0.11, blue: 0.44), foreground: .white),
        ProviderPreset(service: "replicate", displayName: "Replicate", subtitle: "Hosted model APIs", mark: "R", background: .black, foreground: .white),
        ProviderPreset(service: "huggingface", displayName: "Hugging Face", subtitle: "Inference and datasets", mark: "HF", background: Color(red: 1.00, green: 0.80, blue: 0.18), foreground: .black)
    ]

    static let infrastructureProviders: [ProviderPreset] = [
        ProviderPreset(service: "supabase", displayName: "Supabase", subtitle: "Database and auth", mark: "S", background: Color(red: 0.18, green: 0.72, blue: 0.46), foreground: .white),
        ProviderPreset(service: "pinecone", displayName: "Pinecone", subtitle: "Vector database", mark: "P", background: Color(red: 0.05, green: 0.47, blue: 0.36), foreground: .white),
        ProviderPreset(service: "stripe", displayName: "Stripe", subtitle: "Payments", mark: "S", background: Color(red: 0.38, green: 0.34, blue: 0.95), foreground: .white),
        ProviderPreset(service: "resend", displayName: "Resend", subtitle: "Email API", mark: "R", background: .black, foreground: .white),
        ProviderPreset(service: "vercel", displayName: "Vercel", subtitle: "Deployments", mark: "V", background: .black, foreground: .white),
        ProviderPreset(service: "cloudflare", displayName: "Cloudflare", subtitle: "Workers and DNS", mark: "CF", background: Color(red: 0.96, green: 0.45, blue: 0.08), foreground: .white),
        ProviderPreset(service: "github", displayName: "GitHub", subtitle: "Developer platform", mark: "GH", background: Color(red: 0.13, green: 0.15, blue: 0.18), foreground: .white)
    ]

    static var all: [ProviderPreset] {
        aiProviders + infrastructureProviders
    }

    static func preset(for service: String) -> ProviderPreset? {
        let normalized = APIKeyStore.normalizedService(service)
        return all.first { $0.service == normalized }
    }

    static func displayName(for service: String, fallback: String? = nil) -> String {
        let normalized = APIKeyStore.normalizedService(service)
        if let preset = preset(for: normalized) {
            return preset.displayName
        }
        if let fallback, !fallback.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return fallback
        }
        return normalized
            .replacingOccurrences(of: "-", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
            .map { $0.capitalized }
            .joined(separator: " ")
    }
}

private struct ProviderLogoMark: View {
    var service: String
    var size: CGFloat

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: max(8, size * 0.22), style: .continuous)
                .fill(preset.background)

            Text(preset.mark)
                .font(.system(size: fontSize, weight: .black, design: .rounded))
                .foregroundStyle(preset.foreground)
                .minimumScaleFactor(0.55)
                .lineLimit(1)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var preset: ProviderPreset {
        ProviderCatalog.preset(for: service) ??
        ProviderPreset(
            service: "custom",
            displayName: "Custom",
            subtitle: "Custom provider",
            mark: customMark,
            background: Color.accentColor.opacity(0.16),
            foreground: Color.accentColor
        )
    }

    private var customMark: String {
        let normalized = APIKeyStore.normalizedService(service)
        let words = normalized
            .replacingOccurrences(of: "-", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
        if words.count >= 2 {
            return words.prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
        }
        let mark = String(normalized.prefix(2)).uppercased()
        return mark.isEmpty ? "?" : mark
    }

    private var fontSize: CGFloat {
        preset.mark.count <= 1 ? size * 0.54 : size * 0.38
    }
}

private struct APIKeyEntry: Identifiable, Codable, Equatable {
    var id: String
    var displayName: String
    var updatedAt: Date
}

@MainActor
private final class APIKeyStore: ObservableObject {
    @Published private(set) var entries: [APIKeyEntry] = []

    private let defaultsKey = "byok.entries"

    init() {
        load()
    }

    func key(for service: String) -> String? {
        BYOKKeychain.get(account: Self.normalizedService(service))
    }

    func setKey(_ key: String, for service: String, displayName: String? = nil) {
        let account = Self.normalizedService(service)
        guard !account.isEmpty, !key.isEmpty else { return }

        BYOKKeychain.set(key, account: account)
        let label = displayName?.trimmingCharacters(in: .whitespacesAndNewlines)
        upsert(APIKeyEntry(
            id: account,
            displayName: ProviderCatalog.displayName(for: account, fallback: label),
            updatedAt: Date()
        ))
    }

    func delete(_ entry: APIKeyEntry) {
        BYOKKeychain.delete(account: entry.id)
        entries.removeAll { $0.id == entry.id }
        save()
    }

    private func upsert(_ entry: APIKeyEntry) {
        if let index = entries.firstIndex(where: { $0.id == entry.id }) {
            entries[index] = entry
        } else {
            entries.append(entry)
        }
        entries.sort { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
        save()
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: defaultsKey),
              let decoded = try? JSONDecoder().decode([APIKeyEntry].self, from: data) else {
            entries = []
            return
        }
        entries = decoded
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(entries) else { return }
        UserDefaults.standard.set(data, forKey: defaultsKey)
    }

    nonisolated static func normalizedService(_ raw: String) -> String {
        let allowed = Set("abcdefghijklmnopqrstuvwxyz0123456789-_.")
        return raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .filter { allowed.contains($0) }
    }
}

private enum BYOKKeychain {
    private static let service = "app.byok.keys"

    static func set(_ value: String, account: String) {
        delete(account: account)
        guard let data = value.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        if status != errSecSuccess {
            print("[BYOK] SecItemAdd failed for \(account): OSStatus=\(status)")
        }
    }

    static func get(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}
