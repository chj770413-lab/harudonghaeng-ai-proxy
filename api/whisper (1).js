import { OpenAI } from "openai";

export const config = {
  api: {
    bodyParser: false, // 파일을 raw 데이터로 받기 위해 필요
  },
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  try {
    // 1) Raw binary 음성 데이터를 직접 buffer로 수집
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));

    req.on("end", async () => {
      const audioBuffer = Buffer.concat(chunks);

      // 2) OpenAI Whisper로 직접 buffer 전송
      const result = await openai.audio.transcriptions.create({
        file: {
          buffer: audioBuffer,
          filename: "audio.webm",
          contentType: "audio/webm",
        },
        model: "gpt-4o-mini-tts",
      });

      res.status(200).json({ text: result.text });
    });
  } catch (err) {
    console.error("Whisper API Error:", err);
    res.status(500).json({ error: "Whisper processing failed" });
  }
}
