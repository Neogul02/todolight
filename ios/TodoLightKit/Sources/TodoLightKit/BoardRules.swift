import Foundation

/*
  화면이 아니라 **규칙**이다. 웹의 `MemberColumn`·`lib/utils.ts`에 있는 결정을 1:1로 옮긴 것이라,
  SwiftUI를 어떻게 그리든 이 규칙은 그대로여야 한다. 두 클라이언트에서 같은 목록이 다른 순서로
  보이면 그건 디자인 차이가 아니라 버그다.

  옮긴 근거는 `CLAUDE.md`의 「컬럼 안 정렬」과 「사람 이름 뒤 조사」.
*/
public enum BoardRules {

    /// 한 사람의 컬럼을 **미완료 / 완료** 둘로 갈라 각각 정렬한다.
    ///
    /// 미완료는 급한 것부터 위로 — **지난 마감 → 오늘 → 나중 → 마감 없음**.
    /// 마감이 같으면 나중에 넣은 것이 위로 온다(`position`은 새 할 일일수록 작다).
    /// 완료는 맨 아래에 **최근 끝낸 순**으로 쌓는다 — 방금 뭘 끝냈는지가 먼저 보여야 한다.
    public static func split(_ todos: [Todo]) -> (open: [Todo], done: [Todo]) {
        let open = todos
            .filter { $0.status != .done }
            .sorted(by: openIsBefore)

        let done = todos
            .filter { $0.status == .done }
            .sorted { lhs, rhs in
                // 최근 끝낸 것이 위. 아직 시각이 없으면(낙관적 반영 직후) 맨 뒤로 둔다.
                switch (lhs.completedAt, rhs.completedAt) {
                case let (l?, r?): return l > r
                case (nil, _?): return false
                case (_?, nil): return true
                case (nil, nil): return lhs.createdAt > rhs.createdAt
                }
            }

        return (open, done)
    }

    /// 미완료 두 개의 순서. `sorted(by:)`가 요구하는 **엄격한 약순서**를 지킨다 —
    /// 같은 값에 true를 돌려주면 정렬이 정의되지 않는다.
    static func openIsBefore(_ lhs: Todo, _ rhs: Todo) -> Bool {
        if lhs.dueDate != rhs.dueDate {
            // 마감 없는 건 급할 게 없으니 맨 뒤로
            guard let l = lhs.dueDate else { return false }
            guard let r = rhs.dueDate else { return true }
            // `YYYY-MM-DD`는 사전순 = 날짜순이다. Date로 바꿔 비교할 이유가 없다.
            return l < r
        }
        return lhs.position < rhs.position
    }

    /// 사람 이름 뒤에 붙는 주격 조사. 받침이 있으면 "이", 없으면 "가".
    ///
    /// "최진형**이** 부탁" / "최진우**가** 부탁". 하나로 고정하면 반드시 한쪽이 어색해진다.
    /// 한글이 아니면(영문·숫자·이모지) "가"로 둔다.
    public static func subjectParticle(_ name: String) -> String {
        guard let last = name.trimmingCharacters(in: .whitespaces).unicodeScalars.last else {
            return "가"
        }
        let code = last.value
        // 한글 음절 영역 밖이면 판정할 근거가 없다
        guard (0xAC00...0xD7A3).contains(code) else { return "가" }
        // 한글 음절은 (초성, 중성, 종성) 조합이고 종성 인덱스 0이 "받침 없음"이다
        return (code - 0xAC00) % 28 == 0 ? "가" : "이"
    }

    /// 이름 첫 글자 — 프로필 사진이 없을 때 아바타에 쓴다.
    public static func initial(of name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard let first = trimmed.first else { return "?" }
        return String(first).uppercased()
    }

    /// 이 사람의 완료 할 일 중 **서버가 실어 보내지 않은** 개수.
    ///
    /// `todos/list`는 완료를 주인별 최근 20개까지만 준다. 화면에 있는 것보다 적게 말하지
    /// 않도록 총계를 받은 개수로 한 번 끌어올린다 — 방금 내가 체크한 할 일은 낙관적으로
    /// 이미 목록에 있는데 총계는 다음 재조회 때 따라오기 때문이다.
    public static func notLoadedDoneCount(doneTotal: Int, loadedDone: Int) -> Int {
        max(0, doneTotal - loadedDone)
    }
}
