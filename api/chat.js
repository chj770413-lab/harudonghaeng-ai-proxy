// ----------------------------
// CORS 설정
// ----------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ----------------------------
// 기본 응답 함수 (응답 전송)
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
  // OPTIONS 요청 처리 (CORS Preflight)
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

  // 사용자 메시지 추출
  const { message } = req.body || {};
  if (!message) {
    return sendResponse(res, 400, { error: "message 파라미터가 없습니다." });
  }

  // OPENAI KEY 검증
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return sendResponse(res, 500, { error: "OPENAI_API_KEY 환경변수가 없습니다." });
  }

  try {
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
        messages: [
          {
            role: "user",
            content: message,
          },
        ],
      }),
    });

    const data = await openaiRes.json();

    // OpenAI 응답 유효성 확인
    if (!openaiRes.ok) {
      return sendResponse(res, 500, {
        error: "OpenAI API 오류",
        details: data,
      });
    }

    // 메시지 추출
    const reply = data.choices?.[0]?.message?.content || "답변을 가져오지 못했습니다.";

    return sendResponse(res, 200, { reply });
  } catch (err) {
    return sendResponse(res, 500, {
      error: "서버 내부 오류 발생",
      details: err.toString(),
    });
  }
}
