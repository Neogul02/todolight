import Foundation

/// 서버와 주고받는 JSON의 규칙. **인코딩과 디코딩이 서로 다르다** — 그게 이 파일이 있는 이유다.
public enum TodoLightCoding {

    /// 응답을 읽는 디코더.
    ///
    /// 응답 본문은 DB 행이 그대로 나오므로 **snake_case**다(`owner_id`, `due_date`,
    /// `completed_at`). 그래서 `.convertFromSnakeCase`를 쓴다.
    /// 액션이 손으로 만든 몇몇 키(`doneTotals`, `orgId`)는 밑줄이 없어 그대로 통과한다.
    public static func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom(decodeTimestamp)
        return d
    }

    /// 요청을 쓰는 인코더.
    ///
    /// **`keyEncodingStrategy`를 절대 건드리지 말 것.** 요청 본문의 키는 DB 컬럼이 아니라
    /// **서버 액션의 파라미터 이름**이라 처음부터 camelCase다(`orgId`, `dueDate`, `ownerId`,
    /// `orderedUserIds`, `spentOn`). 디코더와 짝을 맞추겠다고 `.convertToSnakeCase`를 켜면
    /// 모든 쓰기가 조용히 "필수 항목이 없어요"로 실패한다.
    public static func makeEncoder() -> JSONEncoder {
        let e = JSONEncoder()
        // 기본값(변환 없음)이 정답이다. 아래 한 줄을 추가하는 순간 API 전체가 깨진다:
        //   e.keyEncodingStrategy = .convertToSnakeCase   // ← 금지
        return e
    }

    /*
      타임스탬프 파싱.

      Postgres가 주는 값은 `2026-09-05T11:22:31.167+00:00`처럼 소수 자릿수가 **일정하지
      않다**(0~6자리). `.iso8601`은 소수점이 있으면 통째로 실패하고, 한 행만 실패해도
      응답 전체의 디코딩이 무너진다 — 보드 하나가 안 뜨는 형태로 나타난다.
      그래서 소수 있음 → 없음 순으로 두 번 시도한다.

      **`due_date`·`spent_on`은 여기 오지 않는다.** 그건 `YYYY-MM-DD` 문자열이고 모델에서도
      `String`으로 둔다 — Date로 바꾸면 기기 시간대에 따라 하루가 밀린다(웹도 KST 문자열로 다룬다).
    */
    static func decodeTimestamp(_ decoder: any Decoder) throws -> Date {
        let raw = try decoder.singleValueContainer().decode(String.self)
        if let d = timestampParser.date(from: raw) { return d }
        throw DecodingError.dataCorrupted(
            .init(codingPath: decoder.codingPath,
                  debugDescription: "타임스탬프를 읽을 수 없다: \(raw)")
        )
    }
}

/*
  `ISO8601DateFormatter`는 만드는 비용이 꽤 있어서 매번 새로 만들면 목록 하나 디코딩에
  수백 번 생성된다. 그렇다고 전역 `static let`으로 둘 수도 없다 — Swift 6의 엄격 동시성이
  **정확히 이 지점을 막는다.** 이 클래스는 Sendable이 아니고, 여러 Task가 동시에 디코딩하면
  같은 인스턴스를 나눠 쓰게 된다.

  그래서 락을 건 상자에 넣는다. `@unchecked Sendable`은 "컴파일러 대신 내가 보증한다"는
  뜻이고, 여기서 그 보증의 근거는 **모든 접근이 이 락 안에서만 일어난다**는 것이다 —
  두 formatter를 밖으로 노출하지 않는 이유이기도 하다.
*/
private final class TimestampParser: @unchecked Sendable {
    private let lock = NSLock()
    private let withFraction: ISO8601DateFormatter
    private let withoutFraction: ISO8601DateFormatter

    init() {
        withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        withoutFraction = ISO8601DateFormatter()
        withoutFraction.formatOptions = [.withInternetDateTime]
    }

    /// 소수 있음 → 없음 순으로 시도한다. Postgres가 주는 소수 자릿수가 일정하지 않아서,
    /// 한쪽만 두면 어떤 행에서는 반드시 실패한다.
    func date(from raw: String) -> Date? {
        lock.lock()
        defer { lock.unlock() }
        return withFraction.date(from: raw) ?? withoutFraction.date(from: raw)
    }
}

private let timestampParser = TimestampParser()
