import { OpenAI } from "openai";

export const config = {
  api: {
    bodyParser: false,
  },
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  try {
    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", async () => {
      const buffer = Buffer.concat(chunks);

      const file = {
        name: "audio.webm",
        type: "audio/webm",
        buffer,
      };

      const result = await openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-tts",
      });

      res.status(200).json({ text: result.text });
    });
  } catch (err) {
    console.error("Whisper API error:", err);
    res.status(500).json({ error: "Whisper error" });
  }
}