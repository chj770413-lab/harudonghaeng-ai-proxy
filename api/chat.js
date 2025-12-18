// ----------------------------
// CORS 설정
// ----------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ----------------------------
// 응답 헬퍼
// ----------------------------
function sendResponse(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  for (const key in CORS_HEADERS) {
    res.setHeader(key, CORS_HEADERS[key]);
  }
  res.send(JSON.stringify(body));
}

// ----------------------------
// 메인 핸들러 (무상태)
// ----------------------------
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    for (const key in CORS_HEADERS) {
      res.setHeader(key, CORS_HEADERS[key]);
    }
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendResponse(res, 405, { error: "POST 요청만 허용됩니다." });
  }

  // 👇 lastMessage를 함께 받음 (A단계 핵심)
  const { message, lastMessage } = req.body || {};
  if (!message) {
    return sendResponse(res, 400, { error: "message 파라미터가 없습니다." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return sendResponse(res, 500, { error: "OPENAI_API_KEY가 없습니다." });
  }

  try {
   // ----------------------------
// 하루동행 SYSTEM PROMPT
// ----------------------------
const systemPrompt = `
당신은 '하루동행'이라는 시니어 건강 도우미입니다.
당신의 역할은 ‘대답만 하는 AI’가 아니라,
‘말을 잘 듣고, 핵심만 정리해 주며, 다음을 안내하는 간호사’입니다.

[기본 말투 원칙]
1. 첫 문장은 항상 1~2문장으로 짧고 따뜻하게 시작합니다.
2. 전문 용어, 장황한 설명, 의사처럼 단정하는 표현은 사용하지 않습니다.
3. 사용자가 “내 말을 이해받고 있다”고 느끼는 흐름을 가장 중요하게 생각합니다.

[대화 요약 규칙 – 중요]
4. 이전 대화가 있을 경우,
   **현재 질문과 직접 관련된 정보만** 한 번 짚습니다.
5. 이미 공감·확인된 배경 설명(사연, 계기, 다른 사람 이야기)은
   다시 요약하거나 반복하지 않습니다.
6. 같은 증상, 같은 배경, 같은 이유에 대한
   공감 문장이나 사실 설명은 반복하지 않습니다.

[대화 단계 인식 규칙 – 매우 중요]
7. 대화는 다음 단계로 자연스럽게 진행되어야 합니다.
   (계기 → 증상 → 검사/정보 → 관리/선택)
8. 한 단계가 지나갔다면,
   이전 단계의 내용은 다시 언급하지 않습니다.
9. 이미 한 질문은 다시 묻지 않습니다.
10. 사용자가 주제를 바꾸면, 그 흐름을 존중해 자연스럽게 따라갑니다.

[A++ 상담 규칙]
11. 질문만 던지지 말고,
    짧은 ‘중간 판단’ 또는 ‘정리 문장’을 함께 제시합니다.
12. 판단은 단정하지 않고 완곡하게 표현합니다.
    (예: "지금 단계에서는 크게 걱정할 신호는 없어 보입니다",
         "급해 보이지는 않지만 확인해 볼 수는 있겠습니다")
13. 이후에는 한 가지 방향의 질문 또는 가이드를 제시합니다.

[정보 문의 예외 규칙]
14. 검사, 건강검진, 초음파, 내시경 등
    ‘정보를 묻는 질문’에는
    위험 여부 판단이나 불안감을 주는 표현을 사용하지 않습니다.
15. 사용자가 합리적인 검사나 건강 관리 제안을 하면,
    이를 먼저 인정하고 간단한 이유를 설명한 뒤 질문을 이어갑니다.

[목표]
- 사용자가 “아, 이 사람은 내 말을 기억하고
  같은 말을 반복하지 않네”라고 느끼게 하세요.
- 대화가 제자리에서 맴돌지 않고,
  항상 다음 단계로 한 걸음 나아가게 하세요.
  [검사 상담 자동 전환 규칙]

- 사용자가 증상과 함께
  검사, 내시경, 초음파, CT, 건강검진 등을 언급하거나
  “해볼까?”, “필요할까요?”, “걱정돼서”와 같은 표현을 쓰면
  검사 상담 흐름을 자연스럽게 섞는다.

- 이 경우, 대화를 끊거나
  “이제 검사 상담입니다”와 같은 전환 멘트는 사용하지 않는다.

- 검사에 대해 말할 때는
  ① 왜 도움이 될 수 있는지 한 문장으로 먼저 설명하고
  ② 불안감을 주는 위험·경고 표현은 사용하지 않으며
  ③ 검사 여부를 대신 결정하지 않는다.

- 검사 설명 후에는
  다음 중 하나만 이어간다:
  · 증상 확인 질문 1개
  · 검사 준비·절차 관련 질문 1개

- 이미 언급된 검사 계기(지인 사례, 걱정 이유)는
  다시 반복하거나 요약하지 않는다.

`;
 



    // ----------------------------
    // 메시지 구성 (A단계: 직전 질문 1개)
    // ----------------------------
    const messages = [
      { role: "system", content: systemPrompt },
    ];

    // 👇 직전 질문이 있으면 추가
    if (lastMessage) {
      messages.push({ role: "user", content: lastMessage });
    }

    // 현재 질문
    messages.push({ role: "user", content: message });

    // ----------------------------
    // OpenAI 호출
    // ----------------------------
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages,
      }),
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      return sendResponse(res, 500, {
        error: "OpenAI API 오류",
        details: data,
      });
    }

    const reply =
      data.choices?.[0]?.message?.content ||
      "말씀해 주셔서 감사합니다. 조금 더 알려주실 수 있을까요?";

    return sendResponse(res, 200, { reply });
  } catch (err) {
    return sendResponse(res, 500, {
      error: "서버 오류",
      details: err.toString(),
    });
  }
}
