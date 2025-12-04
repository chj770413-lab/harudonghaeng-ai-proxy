export const config = {
  runtime: "edge",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // 필요하면 나중에 특정 도메인만 허용으로 바꿀 수 있어요
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default async function handler(req) {
  // ✅ 프리플라이트(OPTIONS) 요청 처리
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: CORS_HEADERS,
    });
  }

  // ✅ POST만 허용
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
        },
      }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
      {
        status: 500,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    // 프론트에서 보낸 데이터 읽기
    const { mode, message } = await req.json();

    const systemPrompt =
      mode === "mood"
        ? "너는 시니어의 감정을 다정하게 들어주고 공감해주는 하루동행 감정 케어 봇이야. 말투는 존댓말이고, 길지 않게 3~4문장 정도로 따뜻하게 답해줘."
        : mode === "health"
        ? "너는 시니어의 건강 상태를 부드럽게 점검해주는 하루동행 건강 케어 봇이야. 말투는 존댓말이고, 위험한 의학 조언은 하지 말고 생활 습관, 컨디션 위주로 간단히 물어봐 줘."
        : "너는 시니어가 보호자에게 전하고 싶은 마음을 예쁘게 정리해 주는 하루동행 메시지 정리 봇이야. 말투는 존댓말이고, 3~5문장 안에서 따뜻하게 정리해 줘.";

    // 🔗 OpenAI API 호출
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errorText = await openaiRes.text();
      console.error("OpenAI API error:", openaiRes.status, errorText);

      return new Response(
        JSON.stringify({ error: "OpenAI API error" }),
        {
          status: 500,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const data = await openaiRes.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "답변을 가져오지 못했어요.";

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("Server error:", err);

    return new Response(
      JSON.stringify({ error: "Server error" }),
      {
        status: 500,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
        },
      }
    );
  }
}

