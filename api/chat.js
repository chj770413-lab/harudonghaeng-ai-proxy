// ----------------------------
// CORS 설정
// ----------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ----------------------------
// 기본 응답 함수
// ----------------------------
function sendResponse(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  for (const key in CORS_HEADERS) {
    res.setHeader(key, CORS_HEADERS[key]);
  }
  res.send(JSON.stringify(body));
}

// ----------------------------
// 메인 핸들러
// ----------------------------
export default async function handler(req, res) {
  // OPTIONS 요청 처리
  if (req.method === "OPTIONS") {
    for (const key in CORS_HEADERS) {
      res.setHeader(key, CORS_HEADERS[key]);
    }
    return res.status(200).end();
  }

  // POST만 허용
  if (req.method !== "POST") {
    return sendResponse(res, 405, { error: "POST 요청만 허용됩니다." });
  }

  // 사용자 메시지
  const { message } = req.body || {};
  if (!message) {
    return sendResponse(res, 400, { error: "message 파라미터가 없습니다." });
  }

  // OPENAI KEY 확인
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return sendResponse(res, 500, { error: "OPENAI_API_KEY 환경변수가 없습니다." });
  }

  try {
    // ----------------------------
    // 하루동행 전용 SYSTEM PROMPT
    // ----------------------------
    const systemPrompt = `
당신은 '하루동행'이라는 시니어 건강 도우미입니다.

응답 규칙:
1. 첫 응답은 항상 2문장 이내로 짧고 따뜻하게 말합니다.
2. 설명을 바로 하지 말고, 질문으로 다음 대화를 이어갑니다.
3. 말투는 차분한 존댓말을 사용합니다.
4. 전문 용어, 긴 설명, 나열식 안내는 사용하지 않습니다.
5. 사용자가 정보가 필요한 질문을 하더라도,
   첫 응답에서는 방향만 제시하고 질문으로 이어갑니다.

응답 예시:
- "말씀해 주셔서 감사합니다. 지금 어떤 점이 가장 불편하신가요?"
- "알려주셔서 고마워요. 몇 가지만 확인해도 될까요?"
`;

    // ----------------------------
    // OpenAI API 호출
    // ----------------------------
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4, // 🔒 톤 안정화
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
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
      error: "서버 내부 오류 발생",
      details: err.toString(),
    });
  }
}
