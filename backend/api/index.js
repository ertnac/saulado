const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const { Groq } = require('groq-sdk');

const app = express();

// --- MIDDLEWARE ---
app.use(express.json());
// Allow both local development and deployed frontend
app.use(cors());

// --- CONFIGURATION ---
// Use process.env for security! Input these in the Vercel Dashboard Settings
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ,
    // REQUIRED for Cloud Databases (Aiven/Railway)
    ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false
});

db.connect(err => {
    if (err) {
        console.error('❌ MySQL Connection Failed:', err.message);
    } else {
        console.log('✅ MySQL Connected');
    }
});

// --- API ROUTES ---
// IMPORTANT: All routes here start with /api to match your Vercel rewrites

app.get('/api/library', (req, res) => {
    const deckQuery = 'SELECT * FROM decks';
    const cardQuery = 'SELECT * FROM cards ORDER BY order_val ASC';

    db.query(deckQuery, (err, decks) => {
        if (err) return res.status(500).json(err);
        db.query(cardQuery, (err, cards) => {
            if (err) return res.status(500).json(err);
            const buildTree = (parentId = null) => {
                return decks
                    .filter(d => d.parent_id === parentId)
                    .map(d => ({
                        ...d,
                        cards: cards.filter(c => c.deck_id === d.id),
                        subDecks: buildTree(d.id)
                    }));
            };
            res.json(buildTree(null));
        });
    });
});

app.post('/api/decks', (req, res) => {
    const { name, parent_id } = req.body;
    db.query('INSERT INTO decks (name, parent_id) VALUES (?, ?)', [name, parent_id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ id: result.insertId });
    });
});

app.delete('/api/decks/:id', (req, res) => {
    db.query('DELETE FROM decks WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        res.sendStatus(200);
    });
});

app.delete('/api/decks/:id/cards', (req, res) => {
    db.query('DELETE FROM cards WHERE deck_id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        res.sendStatus(200);
    });
});

app.post('/api/cards', (req, res) => {
    const { deck_id, html, order_val } = req.body;
    db.query('INSERT INTO cards (deck_id, html, order_val) VALUES (?, ?, ?)',
        [deck_id, html, order_val], (err) => {
            if (err) return res.status(500).json(err);
            res.sendStatus(200);
        });
});

app.put('/api/cards/:id', (req, res) => {
    const { html } = req.body;
    db.query('UPDATE cards SET html = ? WHERE id = ?', [html, req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        res.sendStatus(200);
    });
});

app.delete('/api/cards/:id', (req, res) => {
    db.query('DELETE FROM cards WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        res.sendStatus(200);
    });
});

app.put('/api/cards/:id/track', (req, res) => {
    const { isCorrect } = req.body;
    const correctIncrement = isCorrect ? 1 : 0;
    db.query(
        'UPDATE cards SET attempt_count = attempt_count + 1, correct_count = correct_count + ? WHERE id = ?',
        [correctIncrement, req.params.id],
        (err) => {
            if (err) return res.status(500).json(err);
            res.sendStatus(200);
        }
    );
});

// Changed from /verify to /api/verify to keep everything consistent
app.post('/api/verify', async (req, res) => {
    const { userAnswer, correctAnswer } = req.body;
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a quiz checker. Compare the user's answer to the correct answer. If it is a minor typo, sounds similar, or represents the same person/place/concept, return JSON: {\"isCorrect\": true}. Otherwise, return {\"isCorrect\": false}. Return only valid JSON."
                },
                { role: "user", content: `Correct: "${correctAnswer}", User: "${userAnswer}"` }
            ],
            model: "llama-3.1-8b-instant",
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(chatCompletion.choices[0].message.content);
        res.json(result);
    } catch (error) {
        const fallback = userAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
        res.json({ isCorrect: fallback });
    }
});

// --- EXPORT FOR VERCEL ---
module.exports = app;