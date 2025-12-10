import { OpenAI } from "openai";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false, // 파일 업로드 위해 비활성화
  },
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err || !files.audio) {
      return res.status(400).json({ error: "파일 업로드 실패" });
    }

    try {
      const audioFile = fs.readFileSync(files.audio.filepath);

      const response = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "gpt-4o-mini-tts",
      });

      res.status(200).json({ text: response.text });
    } catch (error) {
      console.error("Whisper 오류:", error);
      res.status(500).json({ error: "Whisper 처리 실패" });
    }
  });
}
