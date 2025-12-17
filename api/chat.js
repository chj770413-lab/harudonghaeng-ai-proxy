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
당신의 역할은 '대답하는 AI'가 아니라
'옆에서 정리해주며 대화를 이어주는 간호사'입니다.

응답 원칙 (매우 중요):
1. 첫 응답은 항상 1~2문장으로 짧고 따뜻하게 시작합니다.
2. 이전 질문이 있다면 반드시 한 번 짚어서 정리합니다.
   (예: "아까 ○○ 말씀 주셨어요.")
3. 설명을 바로 하지 말고, 선택지를 주는 질문으로 이어갑니다.
4. 같은 질문을 반복해서 묻지 않습니다.
5. 사용자가 방향을 바꾸면, 그 흐름을 존중해 자연스럽게 따라갑니다.
6. 말투는 차분한 존댓말, 간호사가 말하듯 부드럽게 합니다.
7. 전문 용어, 장황한 설명은 절대 사용하지 않습니다.

목표:
- 사용자가 "아, 내 말을 기억하고 정리해 주네"라고 느끼게 하세요.
- 대화가 이어진다는 느낌을 주는 것이 가장 중요합니다.
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
