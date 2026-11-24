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
    @State private var showCalendar = true
    @State private var notifyMy = true
    @State private var notifyOrg = true
    @State private var notifyTeam = false
    @State private var photoURL: String?
    @State private var photoItem: PhotosPickerItem?
    @State private var uploading = false
    @State private var toast: String?
    @State private var deleteOpen = false
    @State private var proOpen = false
    @State private var manageOpen = false

    private var api: APIClient { Backend.shared.api }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // 프로필이 오기 전에는 빈 이름 칸 대신 자리 표시 — 비어 보이면 이름이 지워진 줄 안다
                profileCard
                    .redacted(reason: profile == nil ? .placeholder : [])
                    .modifier(PulseWhile(active: profile == nil))
                    .allowsHitTesting(profile != nil)
                themeCard
                langCard
                viewCard
                notifyCard
                proCard
                legalCard
                deleteCard
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 20)
        }
        .background(CanvasBackground())
        .overlay(alignment: .bottom) { Toast(message: $toast) }
        .task { await load() }
        .task(id: name) { await saveNameAfterPause() }
        .onChange(of: photoItem) { _, item in if let item { Task { await upload(item) } } }
        .sheet(isPresented: $proOpen) { ProSheet(userId: userId) }
        .manageSubscriptionsSheet(isPresented: $manageOpen)
        .task { await ProStore.shared.refresh() }
        .sheet(isPresented: $deleteOpen) {
            DeleteAccountSheet { await session.signOut() }
        }
    }

    // MARK: 카드들

    private var profileCard: some View {
        PageCard {
            // 이름은 아래 칸이 이미 보여 준다 — 아바타 옆에 또 적지 않는다
            // 사진을 누르면 고르기·지우기가 뜬다(EditablePhoto) — 버튼 두 개를 늘어놓지 않는다
            HStack(spacing: 14) {
                EditablePhoto(hasPhoto: photoURL != nil, uploading: uploading, item: $photoItem,
                              onRemove: { Task { await clearPhoto() } }) {
                    AvatarView(member: profile.map(meSummary), size: 64)
                }
                Text(email ?? "").font(.tlCaption).foregroundStyle(tk.inkFaint).lineLimit(1)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(tr("이름", "Name", "名前")).font(.tl(13, .medium)).foregroundStyle(tk.inkSecondary)
                TextField("", text: $name)
                    .submitLabel(.done)
                    .tlField()
                    .onChange(of: name) { _, v in if v.count > 30 { name = String(v.prefix(30)) } }
            }
            .padding(.top, 16)
        }
    }

    private var themeCard: some View {
        PageCard {
            Text(tr("테마", "Theme", "テーマ")).font(.tlTitle).foregroundStyle(tk.ink)
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
        PageCard {
            Text(tr("언어", "Language", "言語")).font(.tlTitle).foregroundStyle(tk.ink)
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

    /// 앱 푸시 — 웹 /me의 「알림」과 같은 값(계정에 저장)
    private var notifyCard: some View {
        PageCard {
            Text(tr("알림", "Notifications", "通知")).font(.tlTitle).foregroundStyle(tk.ink)
            VStack(spacing: 12) {
                settingToggle(tr("내 할 일 소식", "My to-dos", "自分のタスクのお知らせ"), isOn: notifyMy) {
                    notifyMy.toggle()
                    let next = notifyMy
                    Task { await save { try await api.updateProfile(notifyMyTodos: next) } onFail: { notifyMy = !next } }
                }
                settingToggle(tr("조직 일정·새 멤버", "Org events and new members", "チームの予定・新しいメンバー"), isOn: notifyOrg) {
                    notifyOrg.toggle()
                    let next = notifyOrg
                    Task { await save { try await api.updateProfile(notifyOrg: next) } onFail: { notifyOrg = !next } }
                }
                settingToggle(tr("팀원이 올린 할 일", "Teammates' to-dos", "メンバーが追加したタスク"), isOn: notifyTeam) {
                    notifyTeam.toggle()
                    let next = notifyTeam
                    Task { await save { try await api.updateProfile(notifyTeamTodos: next) } onFail: { notifyTeam = !next } }
                }
            }
            .padding(.top, 12)
        }
    }

    private var viewCard: some View {
        PageCard {
            Text(tr("화면", "What to show", "表示")).font(.tlTitle).foregroundStyle(tk.ink)
            VStack(spacing: 12) {
                settingToggle(tr("완료한 할 일도 보기", "Show completed to-dos", "完了したタスクも表示"), isOn: showDone) {
                    showDone.toggle()
                    let next = showDone
                    Task { await save { try await api.updateProfile(showDone: next) } onFail: { showDone = !next } }
                }
                settingToggle(tr("달력 쓰기", "Use the calendar", "カレンダーを使う"), isOn: showCalendar) {
                    showCalendar.toggle()
                    let next = showCalendar
                    Task { await save { try await api.updateProfile(showCalendar: next) } onFail: { showCalendar = !next } }
                }
                settingToggle(tr("가계부 쓰기", "Use the ledger", "支出を使う"), isOn: showLedger) {
                    showLedger.toggle()
                    let next = showLedger
                    Task { await save { try await api.updateProfile(showLedger: next) } onFail: { showLedger = !next } }
                }
            }
            .padding(.top, 12)
        }
    }

    /// todolight Pro — 쓰는 중이면 기한과 관리, 아니면 알아보기
    private var proCard: some View {
        PageCard {
            Text("todolight Pro").font(.tlTitle).foregroundStyle(tk.ink)
            if let s = ProStore.shared.status, s.active {
                if let end = s.expiresAt {
                    Text(tr("\(end.formatted(.dateTime.year().month().day().locale(AppLang.locale)))까지 쓰고 있어요",
                            "Active until \(end.formatted(.dateTime.year().month().day().locale(AppLang.locale)))", "\(end.formatted(.dateTime.year().month().day().locale(AppLang.locale)))まで利用中です"))
                        .font(.tlBodySm).foregroundStyle(tk.inkSecondary).padding(.top, 4)
                }
                if s.source == "apple" {
                    Button(tr("구독 관리", "Manage subscription", "サブスクリプションを管理")) { manageOpen = true }
                        .buttonStyle(TLButtonStyle(variant: .outline, fill: true))
                        .padding(.top, 12)
                } else if s.source == "web" {
                    Text(tr("웹에서 결제했어요. 해지도 웹에서 해요.", "Purchased on the web. Cancel it there.", "Webで購入しました。解約もWebで行います。"))
                        .font(.tlCaption).foregroundStyle(tk.inkMuted).padding(.top, 4)
                }
            } else {
                Text(tr("내가 방장인 조직에 \(FreeSeats.count)명 넘게 초대할 수 있어요.",
                        "Invite more than \(FreeSeats.count) people to orgs you own.", "自分がオーナーのチームに\(FreeSeats.count)人を超えて招待できます。"))
                    .font(.tlBodySm).foregroundStyle(tk.inkSecondary).padding(.top, 4)
                Button(tr("알아보기", "Learn more", "詳しく見る")) { proOpen = true }
                    .buttonStyle(TLButtonStyle(variant: .outline, fill: true))
                    .padding(.top, 12)
            }
        }
    }

    /// 약관 — 심사자는 앱 안에서도 닿을 수 있기를 본다. 웹 페이지를 그대로 연다(로그인 없이 열린다).
    private var legalCard: some View {
        PageCard {
            Text(tr("약관", "Legal", "規約")).font(.tlTitle).foregroundStyle(tk.ink)
            VStack(spacing: 0) {
                legalLink(tr("이용약관", "Terms of Service", "利用規約"), "legal/terms")
                legalLink(tr("개인정보 처리방침", "Privacy Policy", "プライバシーポリシー"), "legal/privacy")
            }
            .padding(.top, 8)
        }
    }

    /// 맨 아래 — 매일 만지는 설정과 평생 한 번 누를 버튼을 떨어뜨려 둔다.
    private var deleteCard: some View {
        // 버튼 하나만(웹과 같다) — 제목을 달면 버튼과 같은 말이 두 번 보인다. 설명은 확인 시트가 한다
        Button(tr("계정 삭제", "Delete account", "アカウント削除")) { deleteOpen = true }
            .buttonStyle(TLButtonStyle(variant: .danger, fill: true))
    }

    // MARK: 조각


    private func settingToggle(_ label: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                CheckBox(checked: isOn)
                Text(label).font(.tlBodySm).foregroundStyle(tk.ink)
                Spacer()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScale(scale: 0.98))
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


    // MARK: 동작

    /// 앱이 이 화면에서 바로 열리면 로그인 세션이 아직 준비되기 전이라 첫 조회가 실패할 수 있다.
    /// 한 번 실패로 끝내면 이름 칸이 빈 채로 남는다 — 잠깐씩 기다리며 몇 번 더 묻는다.
    private func load() async {
        var fetched: Profile?
        for attempt in 0..<4 {
            if let p = try? await api.fetchMyProfile() { fetched = p; break }
            try? await Task.sleep(for: .milliseconds(300 << attempt))
            if Task.isCancelled { return }
        }
        guard let p = fetched else { return }
        profile = p
        name = p.displayName
        savedName = p.displayName
        showDone = p.showDone
        showLedger = p.showLedger
        showCalendar = p.showCalendar ?? true
        notifyMy = p.notifyMyTodos ?? true
        notifyOrg = p.notifyOrg ?? true
        notifyTeam = p.notifyTeamTodos ?? false
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
            toast = tr("사진을 바꿨어요", "Photo updated", "写真を変更しました")
        } catch {
            toast = error is CancellationError ? tr("사진을 읽지 못했어요", "Couldn't read that photo", "写真を読み込めませんでした") : BoardStore.message(error)
        }
    }

    private func clearPhoto() async {
        uploading = true
        defer { uploading = false }
        do {
            _ = try await Backend.shared.supabase.storage.from("avatars").remove(paths: ["\(userId)/avatar.webp"])
            profile = try await api.updateProfile(avatarUrl: .clear)
            photoURL = nil
            toast = tr("사진을 지웠어요", "Photo removed", "写真を削除しました")
        } catch {
            toast = BoardStore.message(error)
        }
    }

    static func squareJPEG(_ data: Data, side: CGFloat) -> Data? {
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
        ("system", tr("시스템", "System", "システム"), ["#ffffff", "#101010", "#8a8a8a"]),
        ("ink", tr("화이트", "Light", "ライト"), ["#ffffff", "#f4f2ee", "#14120f"]),
        ("ink-dark", tr("다크", "Dark", "ダーク"), ["#101010", "#232221", "#f5f2ec"]),
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
            Text(tr("계정 삭제", "Delete account", "アカウント削除")).font(.tlTitle).foregroundStyle(tk.ink)
            VStack(alignment: .leading, spacing: 8) {
                ForEach([
                    tr("로그인 정보와 이름·이메일·프로필 사진을 지워요. 다시 로그인할 수 없어요.", "Your sign-in details, name, email, and profile photo are deleted. You will not be able to sign in again.", "ログイン情報と名前・メールアドレス・プロフィール写真を削除します。再びログインすることはできません。"),
                    tr("방장으로 있는 조직은 남은 멤버 중 먼저 들어온 관리자에게 방장을 넘겨요.", "Orgs you own are handed to the longest-standing admin among the remaining members.", "オーナーを務めているチームは、残ったメンバーのうち最も早く参加した管理者にオーナーを引き継ぎます。"),
                    tr("나 혼자인 조직은 그 조직의 할 일·일정·가계부와 함께 지워요.", "Orgs where you are the only member are deleted, along with their to-dos, events, and ledger.", "自分しかいないチームは、そのチームのタスク・予定・支出と一緒に削除します。"),
                    tr("팀에 남긴 할 일과 메모, 가계부 기록은 이름 없이 남아요 — 팀의 장부가 나 때문에 바뀌면 안 되니까요.", "To-dos, notes, and ledger entries you left with your team stay, without your name — your team's books shouldn't change because you left.", "チームに残したタスクやメモ、支出の記録は名前なしで残ります。自分が抜けたことでチームの記録が変わってはいけないからです。"),
                ], id: \.self) { Text($0).font(.tlBodySm).foregroundStyle(tk.ink) }
            }
            .padding(14)
            .background(tk.canvasSoft, in: RoundedRectangle(cornerRadius: 12))
            Text(tr("이 동작은 되돌릴 수 없어요.", "This cannot be undone.", "この操作は元に戻せません。")).font(.tlCaption).foregroundStyle(tk.danger)
            if let error { Text(error).font(.tlCaption).foregroundStyle(tk.danger) }
            HStack(spacing: 8) {
                Button(tr("취소", "Cancel", "キャンセル")) { dismiss() }
                    .buttonStyle(TLButtonStyle(variant: .outline, fill: true))
                Button(deleting ? tr("지우는 중…", "Deleting…", "削除中…") : tr("삭제할래요", "Delete", "削除する")) { Task { await run() } }
                    .buttonStyle(TLButtonStyle(variant: .danger, fill: true))
            }
            .disabled(deleting)
        }
        .padding(20)
        .frame(maxHeight: .infinity, alignment: .top)
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


/// 불러오는 동안만 깜빡인다 — 다 오면 원래 모습 그대로
private struct PulseWhile: ViewModifier {
    let active: Bool
    func body(content: Content) -> some View {
        if active { content.skeletonPulse() } else { content }
    }
}
