import SwiftUI
import Supabase

/// 이메일 + 비밀번호 — 웹 `app/login/LoginForm.tsx`와 같은 흐름.
struct LoginView: View {
    enum Mode: CaseIterable {
        case signIn, signUp
        var label: String { self == .signIn ? tr("로그인", "Sign in") : tr("회원가입", "Sign up") }
    }
    enum Field { case name, email, password }

    @State private var mode: Mode = .signIn
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @State private var notice: String?
    @FocusState private var focus: Field?

    @Environment(\.tokens) private var tk

    /// 웹 `app/login/LoginForm.tsx` — 카드 안에 워드마크 · 두 칸 탭 · 라벨 붙은 칸 · 큰 버튼.
    var body: some View {
        ZStack {
            CanvasBackground()
            VStack(alignment: .leading, spacing: 0) {
                // 앱 이름은 두지 않는다 — 이 화면이 할 일은 로그인·회원가입 중 하나를 고르는 것뿐이다(웹과 같다)
                HStack(spacing: 0) {
                    ForEach(Mode.allCases, id: \.self) { m in
                        Button { mode = m } label: {
                            Text(m.label).font(.tl(14, .medium))
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .foregroundStyle(mode == m ? tk.accentInk : tk.inkMuted)
                                .background(mode == m ? tk.accent : tk.surface)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(tk.hairline))

                VStack(alignment: .leading, spacing: 12) {
                    if mode == .signUp {
                        labeled(tr("이름", "Name")) {
                            TextField("", text: $name, prompt: placeholder(tr("팀원에게 보일 이름", "Name your teammates will see"), tk))
                                .textContentType(.name)
                                .focused($focus, equals: .name)
                                .submitLabel(.next)
                                .onSubmit { focus = .email }
                                .tlField()
                        }
                    }
                    // iOS가 첫 글자를 대문자로 바꿔 로그인이 실패한다 — 웹과 같은 규칙(CLAUDE.md 「그 밖의 iOS 대응」)
                    labeled(tr("이메일", "Email")) {
                        TextField("", text: $email, prompt: placeholder("you@company.com", tk))
                            .keyboardType(.emailAddress)
                            .textContentType(.username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focus, equals: .email)
                            .submitLabel(.next)
                            .onSubmit { focus = .password }
                            .tlField()
                    }
                    labeled(tr("비밀번호", "Password")) {
                        SecureField("", text: $password, prompt: placeholder(tr("6자 이상", "6+ characters"), tk))
                            .textContentType(mode == .signUp ? .newPassword : .password)
                            .focused($focus, equals: .password)
                            .submitLabel(.go)
                            .onSubmit { Task { await submit() } }
                            .tlField()
                    }

                    if let notice {
                        Text(notice).font(.tlCaption).foregroundStyle(tk.inkMuted)
                    }
                    if let error {
                        Text(error).font(.tlCaption).foregroundStyle(tk.danger)
                    }

                    Button {
                        Task { await submit() }
                    } label: {
                        Group {
                            if busy { ProgressView().tint(tk.accentInk) } else { Text(mode.label) }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(TLButtonStyle())
                    .disabled(busy || email.isEmpty || password.count < 6)
                    .padding(.top, 8)

                    // 재설정은 웹 흐름 그대로 쓴다 — 메일 링크가 어차피 브라우저에서 열리고, 거기서 새 비밀번호를 정한다
                    if mode == .signIn {
                        Link(tr("비밀번호를 잊으셨나요?", "Forgot your password?"),
                             destination: AppConfig.apiBaseURL.appending(path: "reset"))
                            .font(.tlCaption).foregroundStyle(tk.inkMuted)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 4)
                    }
                }
                .padding(.top, 16)
            }
            .padding(24)
            .background(tk.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(tk.hairline))
            .shadow(color: .black.opacity(0.04), radius: 9, y: 4)
            .padding(.horizontal, 20)
        }
    }

    private func labeled<Field: View>(_ label: String, @ViewBuilder field: () -> Field) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.tl(13, .medium)).foregroundStyle(tk.inkSecondary)
            field()
        }
    }

    private func submit() async {
        guard !busy else { return }
        busy = true
        error = nil
        notice = nil
        defer { busy = false }
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        do {
            let auth = Backend.shared.supabase.auth
            if mode == .signUp {
                let displayName = name.trimmingCharacters(in: .whitespaces)
                // handle_new_user 트리거가 이 메타데이터로 profiles를 만든다(웹과 같은 키)
                let res = try await auth.signUp(
                    email: trimmed,
                    password: password,
                    data: [
                        "display_name": .string(displayName.isEmpty ? String(trimmed.split(separator: "@").first ?? "") : displayName),
                        "locale": .string(Locale.current.language.languageCode?.identifier == "en" ? "en" : "ko"),
                    ],
                    // 메일 링크는 브라우저에서 열린다. 확인 자체는 링크를 누르는 순간 서버에서 끝나므로
                    // 거기서는 웹 로그인 화면만 보여 주고, 사용자는 앱으로 돌아와 로그인한다.
                    redirectTo: AppConfig.apiBaseURL.appending(path: "login")
                )
                // 이메일 확인이 켜져 있으면 세션 없이 돌아온다 — 아무 말 없이 화면이 그대로면 고장처럼 보인다
                if res.session == nil {
                    notice = tr("\(trimmed) 주소로 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.", "We sent a confirmation email to \(trimmed). Tap the link in it, then sign in.")
                    mode = .signIn
                }
            } else {
                try await auth.signIn(email: trimmed, password: password)
            }
        } catch {
            self.error = Self.message(for: error, signingUp: mode == .signUp)
        }
    }

    /// Supabase Auth의 영어 원문을 화면 문구로 옮긴다 — 웹 `lib/auth-errors.ts`와 같은 판정·같은 문구
    private static func message(for error: Error, signingUp: Bool) -> String {
        let m = String(describing: error).lowercased()
        if m.contains("already registered") {
            return tr("이미 가입한 이메일이에요. 로그인해 주세요.", "That email already has an account. Please sign in.")
        }
        if m.contains("email address") && m.contains("invalid") {
            return tr("이메일 주소를 다시 확인해 주세요. 받을 수 있는 주소여야 해요.", "Please check the email address. It needs to be one that can receive mail.")
        }
        if m.contains("rate limit") {
            return tr("요청이 너무 많았어요. 잠시 뒤에 다시 시도해 주세요.", "Too many attempts. Please try again in a little while.")
        }
        return signingUp
            ? tr("가입하지 못했어요. 잠시 뒤에 다시 시도해 주세요.", "Couldn't sign up. Please try again in a moment.")
            : tr("이메일이나 비밀번호가 맞지 않아요.", "That email or password isn't right.")
    }
}
