import SwiftUI
import Supabase

/// 이메일 + 비밀번호 — 웹 `app/login/LoginForm.tsx`와 같은 흐름.
struct LoginView: View {
    enum Mode: String, CaseIterable { case signIn = "로그인", signUp = "회원가입" }
    enum Field { case name, email, password }

    @State private var mode: Mode = .signIn
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("todolight").font(.largeTitle.bold())

            Picker("", selection: $mode) {
                ForEach(Mode.allCases, id: \.self) { Text($0.rawValue) }
            }
            .pickerStyle(.segmented)

            if mode == .signUp {
                TextField("팀원에게 보일 이름", text: $name)
                    .textContentType(.name)
                    .focused($focus, equals: .name)
                    .submitLabel(.next)
                    .onSubmit { focus = .email }
            }
            // iOS가 첫 글자를 대문자로 바꿔 로그인이 실패한다 — 웹과 같은 규칙(CLAUDE.md 「그 밖의 iOS 대응」)
            TextField("이메일", text: $email)
                .keyboardType(.emailAddress)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focus, equals: .email)
                .submitLabel(.next)
                .onSubmit { focus = .password }
            SecureField("비밀번호 (6자 이상)", text: $password)
                .textContentType(mode == .signUp ? .newPassword : .password)
                .focused($focus, equals: .password)
                .submitLabel(.go)
                .onSubmit { Task { await submit() } }

            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }

            Button {
                Task { await submit() }
            } label: {
                Group {
                    if busy { ProgressView() } else { Text(mode.rawValue) }
                }
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .disabled(busy || email.isEmpty || password.count < 6)
        }
        .textFieldStyle(.roundedBorder)
        .padding(24)
    }

    private func submit() async {
        guard !busy else { return }
        busy = true
        error = nil
        defer { busy = false }
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        do {
            let auth = Backend.shared.supabase.auth
            if mode == .signUp {
                let displayName = name.trimmingCharacters(in: .whitespaces)
                // handle_new_user 트리거가 이 메타데이터로 profiles를 만든다(웹과 같은 키)
                try await auth.signUp(
                    email: trimmed,
                    password: password,
                    data: [
                        "display_name": .string(displayName.isEmpty ? String(trimmed.split(separator: "@").first ?? "") : displayName),
                        "locale": .string(Locale.current.language.languageCode?.identifier == "en" ? "en" : "ko"),
                    ]
                )
            } else {
                try await auth.signIn(email: trimmed, password: password)
            }
        } catch {
            self.error = "로그인하지 못했어요. 이메일과 비밀번호를 확인해 주세요."
        }
    }
}
