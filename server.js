// server.js
const express = require('express');
const { Groq } = require('groq-sdk');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors()); // Allows your HTML file to talk to this server

const groq = new Groq({ apiKey: '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' });

app.post('/verify', async (req, res) => {
    const { userAnswer, correctAnswer } = req.body;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a quiz checker. Compare the user's answer to the correct answer. If it's a minor typo or sounds the same, return JSON: {\"isCorrect\": true}. If the meaning is different, return {\"isCorrect\": false}. Only return JSON."
                },
                {
                    role: "user",
                    content: `Correct: "${correctAnswer}", User: "${userAnswer}"`
                }
            ],
            model: "llama-3.1-8b-instant",
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(chatCompletion.choices[0].message.content);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: "Groq error" });
    }
});

app.listen(3000, () => console.log('Typo Checker running on http://localhost:3000'));