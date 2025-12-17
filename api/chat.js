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
// 메모리 (A단계: 직전 질문 1개)
// ⚠️ MVP용 임시 메모리 (서버 재시작 시 초기화됨)
// ----------------------------
let lastUserMessage = null;
let lastAssistantMessage = null;

// ----------------------------
// 메인 핸들러
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

  const { message } = req.body || {};
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

응답 원칙:
1. 첫 응답은 항상 2문장 이내로 짧고 따뜻하게 말합니다.
2. 설명을 바로 하지 말고, 질문으로 다음 대화를 이어갑니다.
3. 말투는 차분한 존댓말을 사용합니다.
4. 전문 용어, 장황한 설명은 피합니다.
5. 이전 대화 맥락이 있다면 자연스럽게 이어서 답합니다.
`;

    // ----------------------------
    // 메시지 구성 (A단계 메모리)
    // ----------------------------
    const messages = [
      { role: "system", content: systemPrompt },
    ];

    // 직전 대화가 있으면 추가
    if (lastUserMessage && lastAssistantMessage) {
      messages.push(
        { role: "user", content: lastUserMessage },
        { role: "assistant", content: lastAssistantMessage }
      );
    }

    // 현재 사용자 메시지
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

    // ----------------------------
    // 메모리 업데이트 (A단계)
    // ----------------------------
    lastUserMessage = message;
    lastAssistantMessage = reply;

    return sendResponse(res, 200, { reply });
  } catch (err) {
    return sendResponse(res, 500, {
      error: "서버 오류",
      details: err.toString(),
    });
  }
}
