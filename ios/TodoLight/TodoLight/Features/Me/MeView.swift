import PhotosUI
import Supabase
import SwiftUI
import TodoLightKit

/// 내 설정 — 웹 `app/(app)/me/MeClient.tsx`.
///
/// **저장 버튼이 없다.** 테마는 고르는 순간 화면이 바뀌고 사진은 고르는 즉시 올라가는데 저장 버튼만
/// 남겨 두면 "어떤 건 눌러야 남는지"를 화면이 설명하지 못한다. 이름만 입력이 멎은 뒤(700ms) 보낸다.
/// 실패하면 토스트로 알리고 값을 되돌린다.
struct MeView: View {
    @Environment(\.tokens) private var tk
    @Environment(ThemeStore.self) private var theme
    @Environment(LangStore.self) private var lang
    @Environment(SessionStore.self) private var session
    let userId: String
    private var email: String? { profile?.email }

    @State private var profile: Profile?
    @State private var name = ""
    @State private var savedName = ""
    @State private var showDone = true
    @State private var showLedger = true
    @State private var photoURL: String?
    @State private var photoItem: PhotosPickerItem?
    @State private var uploading = false
    @State private var toast: String?
    @State private var deleteOpen = false

    private var api: APIClient { Backend.shared.api }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                profileCard
                themeCard
                langCard
                viewCard
                legalCard
                deleteCard
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 20)
        }
        .background(CanvasBackground())
        .overlay(alignment: .bottom) { toastView }
        .task { await load() }
        .task(id: name) { await saveNameAfterPause() }
        .onChange(of: photoItem) { _, item in if let item { Task { await upload(item) } } }
        .sheet(isPresented: $deleteOpen) {
            DeleteAccountSheet { await session.signOut() }
        }
    }

    // MARK: 카드들

    private var profileCard: some View {
        card {
            // 이름은 아래 칸이 이미 보여 준다 — 아바타 옆에 또 적지 않는다
            HStack(spacing: 12) {
                AvatarView(member: profile.map(meSummary), size: 56)
                VStack(alignment: .leading, spacing: 8) {
                    Text(email ?? "").font(.tlCaption).foregroundStyle(tk.inkFaint).lineLimit(1)
                    photoButtons
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(tr("이름", "Name")).font(.tl(13, .medium)).foregroundStyle(tk.inkSecondary)
                TextField("", text: $name)
                    .submitLabel(.done)
                    .tlField()
                    .onChange(of: name) { _, v in if v.count > 30 { name = String(v.prefix(30)) } }
            }
            .padding(.top, 16)
        }
    }

    private var photoButtons: some View {
        HStack(spacing: 8) {
            PhotosPicker(selection: $photoItem, matching: .images) {
                Text(uploading ? tr("올리는 중…", "Uploading…") : photoURL == nil ? tr("사진 올리기", "Upload photo") : tr("사진 바꾸기", "Change photo"))
            }
            .buttonStyle(TLButtonStyle(variant: .outline, size: .sm, fill: true))
            .disabled(uploading)
            if photoURL != nil {
                Button(tr("삭제", "Delete")) { Task { await clearPhoto() } }
                    .buttonStyle(TLButtonStyle(variant: .outline, size: .sm))
                    .disabled(uploading)
            }
        }
    }

    private var themeCard: some View {
        card {
            Text(tr("테마", "Theme")).font(.tlTitle).foregroundStyle(tk.ink)
            // 시스템 · 화이트 · 다크 — 3열 한 줄
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                ForEach(Self.themes, id: \.key) { t in
                    let on = theme.preference == t.key
                    Button { pickTheme(t.key) } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 4) {
                                ForEach(t.swatch, id: \.self) { hex in
                                    Circle().fill(Color(hex: hex)).frame(width: 16, height: 16)
                                        .overlay(Circle().strokeBorder(.black.opacity(0.1)))
                                }
                            }
                            Text(t.name).font(.tl(13, .medium)).foregroundStyle(tk.ink).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        // 고른 표시는 accent 테두리 — surface-alt만으로는 어두운 테마에서 안 보인다
                        .background(on ? tk.accentSoft : .clear, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(on ? tk.accent : tk.hairline))
                    }
                    .buttonStyle(PressScale(scale: 0.97))
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .padding(.top, 12)
        }
    }

    /// 언어 — 고르는 순간 앱 전체가 그 언어로 다시 그려지고 계정에 저장된다(웹 /me와 같은 값)
    private var langCard: some View {
        card {
            Text(tr("언어", "Language")).font(.tlTitle).foregroundStyle(tk.ink)
            HStack(spacing: 8) {
                ForEach(AppLang.allCases, id: \.self) { l in
                    let on = lang.lang == l
                    Button { pickLang(l) } label: {
                        Text(l.label).font(.tl(14, .medium)).foregroundStyle(tk.ink)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(on ? tk.accentSoft : .clear, in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(on ? tk.accent : tk.hairline))
                    }
                    .buttonStyle(PressScale(scale: 0.97))
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .padding(.top, 12)
        }
    }

    private var viewCard: some View {
        card {
            Text(tr("화면", "Display")).font(.tlTitle).foregroundStyle(tk.ink)
            VStack(spacing: 12) {
                settingToggle(tr("완료한 할 일도 보기", "Show finished to-dos"), isOn: showDone) {
                    showDone.toggle()
                    let next = showDone
                    Task { await save { try await api.updateProfile(showDone: next) } onFail: { showDone = !next } }
                }
                settingToggle(tr("가계부 쓰기", "Use the ledger"), isOn: showLedger) {
                    showLedger.toggle()
                    let next = showLedger
                    Task { await save { try await api.updateProfile(showLedger: next) } onFail: { showLedger = !next } }
                }
            }
            .padding(.top, 12)
        }
    }

    /// 약관 — 심사자는 앱 안에서도 닿을 수 있기를 본다. 웹 페이지를 그대로 연다(로그인 없이 열린다).
    private var legalCard: some View {
        card {
            Text(tr("약관", "Legal")).font(.tlTitle).foregroundStyle(tk.ink)
            VStack(spacing: 0) {
                legalLink(tr("이용약관", "Terms of Service"), "legal/terms")
                legalLink(tr("개인정보 처리방침", "Privacy Policy"), "legal/privacy")
            }
            .padding(.top, 8)
        }
    }

    /// 맨 아래 — 매일 만지는 설정과 평생 한 번 누를 버튼을 떨어뜨려 둔다.
    private var deleteCard: some View {
        card {
            Text(tr("계정과 로그인 정보를 지워요. 되돌릴 수 없어요.", "Deletes your account and login. This can't be undone.")).font(.tlCaption).foregroundStyle(tk.inkMuted)
            Button(tr("계정 삭제", "Delete account")) { deleteOpen = true }
                .buttonStyle(TLButtonStyle(variant: .danger, fill: true))
                .padding(.top, 16)
        }
    }

    // MARK: 조각

    private func card<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 0, content: content)
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tk.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(tk.hairline))
    }

    private func settingToggle(_ label: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                CheckBox(checked: isOn)
                Text(label).font(.tlBodySm).foregroundStyle(tk.ink)
                Spacer()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    private func legalLink(_ label: String, _ path: String) -> some View {
        Link(destination: AppConfig.apiBaseURL.appending(path: path)) {
            HStack {
                Text(label).font(.tlBodySm).foregroundStyle(tk.ink)
                Spacer()
                Image(systemName: "arrow.up.right").font(.system(size: 12)).foregroundStyle(tk.inkFaint)
            }
            .frame(minHeight: 44)
        }
    }

    @ViewBuilder private var toastView: some View {
        if let toast {
            Text(toast).font(.tl(14, .medium)).foregroundStyle(tk.ink)
                .padding(.horizontal, 16).frame(minHeight: 48)
                .glassCard(radius: 14)
                .padding(.bottom, 24)
                .transition(.opacity)
                .task(id: toast) {
                    try? await Task.sleep(for: .seconds(3))
                    if self.toast == toast { self.toast = nil }
                }
        }
    }

    // MARK: 동작

    private func load() async {
        guard let p = try? await api.fetchMyProfile() else { return }
        profile = p
        name = p.displayName
        savedName = p.displayName
        showDone = p.showDone
        showLedger = p.showLedger
        photoURL = p.avatarUrl
    }

    /// 글자마다 보내면 서버를 두들긴다 — 입력이 700ms 멎으면 조용히 보낸다.
    /// `task(id: name)`가 새 글자마다 이전 대기를 취소하므로 마지막 값만 나간다.
    private func saveNameAfterPause() async {
        let next = name.trimmingCharacters(in: .whitespaces)
        guard profile != nil, !next.isEmpty, next != savedName else { return }
        try? await Task.sleep(for: .milliseconds(700))
        guard !Task.isCancelled else { return }
        let before = savedName
        savedName = next
        await save { try await api.updateProfile(displayName: next) } onFail: {
            savedName = before
            name = before
        }
    }

    private func pickLang(_ next: AppLang) {
        let before = lang.lang
        guard next != before else { return }
        Task {
            // 저장이 먼저다 — 루트가 다시 그려지면 이 화면의 Task가 끊길 수 있다
            do {
                _ = try await api.updateProfile(locale: next.rawValue)
                lang.lang = next
            } catch {
                toast = BoardStore.message(error)
            }
        }
    }

    private func pickTheme(_ key: String) {
        let before = theme.preference
        theme.preference = key
        Task { await save { try await api.updateProfile(theme: key) } onFail: { theme.preference = before } }
    }

    private func save(_ request: () async throws -> Profile, onFail: () -> Void) async {
        do { profile = try await request() } catch {
            onFail()
            toast = BoardStore.message(error)
        }
    }

    /// 가운데를 정사각형으로 잘라 256px로 줄여 올린다(폰 사진 3~5MB → 수십 KB).
    /// 경로는 웹과 같은 `{userId}/avatar.webp` 하나 — 사람마다 파일이 하나라 웹의 "삭제"가 그대로 지운다.
    /// iOS는 WebP를 **쓸** 수 없어 내용은 JPEG이고 content-type으로 알린다(브라우저는 타입을 본다).
    private func upload(_ item: PhotosPickerItem) async {
        photoItem = nil
        uploading = true
        defer { uploading = false }
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let jpeg = Self.squareJPEG(data, side: 256) else { throw CancellationError() }
            let storage = Backend.shared.supabase.storage.from("avatars")
            let path = "\(userId)/avatar.webp"
            try await storage.upload(path, data: jpeg, options: FileOptions(contentType: "image/jpeg", upsert: true))
            // 경로가 늘 같아 브라우저·AsyncImage가 옛 사진을 캐시한다 — 주소 끝을 바꿔 무효화한다
            let url = try storage.getPublicURL(path: path).absoluteString + "?v=\(Int(Date().timeIntervalSince1970 * 1000))"
            profile = try await api.updateProfile(avatarUrl: .set(url))
            photoURL = url
            toast = tr("사진을 바꿨어요", "Photo updated")
        } catch {
            toast = error is CancellationError ? tr("사진을 읽지 못했어요", "Couldn't read that photo") : BoardStore.message(error)
        }
    }

    private func clearPhoto() async {
        uploading = true
        defer { uploading = false }
        do {
            _ = try await Backend.shared.supabase.storage.from("avatars").remove(paths: ["\(userId)/avatar.webp"])
            profile = try await api.updateProfile(avatarUrl: .clear)
            photoURL = nil
            toast = tr("사진을 지웠어요", "Photo removed")
        } catch {
            toast = BoardStore.message(error)
        }
    }

    private static func squareJPEG(_ data: Data, side: CGFloat) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let s = min(image.size.width, image.size.height)
        let crop = CGRect(x: (image.size.width - s) / 2, y: (image.size.height - s) / 2, width: s, height: s)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).jpegData(withCompressionQuality: 0.85) { _ in
            let scale = side / s
            image.draw(in: CGRect(x: -crop.minX * scale, y: -crop.minY * scale,
                                  width: image.size.width * scale, height: image.size.height * scale))
        }
    }

    private func meSummary(_ p: Profile) -> MemberSummary {
        MemberSummary(userId: userId, role: .member, displayName: name, avatarColor: p.avatarColor, avatarUrl: photoURL, email: email)
    }

    /// 웹 `lib/themes.ts`의 THEMES — 이름은 messages/ko.json `me.theme.names`
    private static var themes: [(key: String, name: String, swatch: [String])] { [
        ("system", tr("시스템", "System"), ["#ffffff", "#101010", "#8a8a8a"]),
        ("ink", tr("화이트", "White"), ["#ffffff", "#f4f2ee", "#14120f"]),
        ("ink-dark", tr("다크", "Dark"), ["#101010", "#232221", "#f5f2ec"]),
    ] }
}

/// 계정 삭제 확인 — "정말 삭제할까요?"만 묻지 않고 **무슨 일이 벌어지는지** 적는다.
private struct DeleteAccountSheet: View {
    @Environment(\.tokens) private var tk
    @Environment(\.dismiss) private var dismiss
    let onDeleted: () async -> Void
    @State private var deleting = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(tr("계정 삭제", "Delete account")).font(.tlTitle).foregroundStyle(tk.ink)
            VStack(alignment: .leading, spacing: 8) {
                ForEach([
                    tr("로그인 정보와 이름·이메일·프로필 사진을 지워요. 다시 로그인할 수 없어요.", "Your login, name, email and profile photo are deleted. You won't be able to log in again."),
                    tr("방장으로 있는 조직은 남은 멤버 중 먼저 들어온 관리자에게 방장을 넘겨요.", "Orgs you own are handed to the earliest-joined admin among remaining members."),
                    tr("나 혼자인 조직은 그 조직의 할 일·일정·가계부와 함께 지워요.", "Orgs where you're the only member are deleted along with their to-dos, events and ledger."),
                    tr("팀에 남긴 할 일과 메모, 가계부 기록은 이름 없이 남아요 — 팀의 장부가 나 때문에 바뀌면 안 되니까요.", "To-dos, notes and ledger entries you left stay without your name — the team's records shouldn't change because you left."),
                ], id: \.self) { Text($0).font(.tlBodySm).foregroundStyle(tk.ink) }
            }
            .padding(14)
            .background(tk.canvasSoft, in: RoundedRectangle(cornerRadius: 12))
            Text(tr("이 동작은 되돌릴 수 없어요.", "This can't be undone.")).font(.tlCaption).foregroundStyle(tk.danger)
            if let error { Text(error).font(.tlCaption).foregroundStyle(tk.danger) }
            HStack(spacing: 8) {
                Button(tr("취소", "Cancel")) { dismiss() }
                    .buttonStyle(TLButtonStyle(variant: .outline, fill: true))
                Button(deleting ? tr("지우는 중…", "Deleting…") : tr("삭제할래요", "Delete it")) { Task { await run() } }
                    .buttonStyle(TLButtonStyle(variant: .danger, fill: true))
            }
            .disabled(deleting)
        }
        .padding(20)
        .presentationDetents([.medium, .large])
        .presentationBackground(tk.glassBgStrong)
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(deleting)
    }

    /// 성공하면 서버에서 세션이 이미 죽었다 — 로컬 세션도 지워 로그인 화면으로 보낸다.
    private func run() async {
        deleting = true
        do {
            try await Backend.shared.api.deleteMyAccount()
            await onDeleted()
        } catch {
            self.error = BoardStore.message(error)
            deleting = false
        }
    }
}

extension Color {
    /// `#rrggbb` — 테마 미리보기 스와치 전용(웹 THEMES의 값을 그대로 옮긴다)
    init(hex: String) {
        let n = Int(hex.dropFirst(), radix: 16) ?? 0
        self.init(.sRGB, red: Double(n >> 16 & 255) / 255, green: Double(n >> 8 & 255) / 255, blue: Double(n & 255) / 255)
    }
}
