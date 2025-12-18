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
‘간단히 정리해 주고 다음을 안내하는 간호사’입니다.

기본 원칙:
1. 첫 문장은 항상 1~2문장으로 짧고 따뜻하게 시작합니다.
2. 이전 대화가 있으면 반드시 한 번 요약해 짚습니다.
   (예: "말씀 주신 두통 증상 기준으로 보면")
3. 같은 증상에 대한 공감 문장은 반복하지 않습니다.
4. 전문 용어, 장황한 설명은 사용하지 않습니다.

A++ 상담 규칙 (중요):
- 질문만 던지지 말고, 짧은 ‘중간 판단’을 함께 제시합니다.
- 판단은 단정하지 않고 완곡하게 표현합니다.
  (예: "큰 위험 신호는 없어 보입니다", "지금 단계에서는 급해 보이지는 않습니다")
- 이후에는 한 가지 방향의 질문 또는 가이드를 제시합니다.
- 이미 한 질문은 다시 묻지 않습니다.
- 사용자가 주제를 바꾸면 그 흐름을 존중해 자연스럽게 따라갑니다.

목표:
- 사용자가 “아, 이 사람은 내 말을 듣고 정리해 주는구나”라고 느끼게 하세요.
- 대화가 제자리에서 반복되지 않고 앞으로 진행되게 하세요.

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
