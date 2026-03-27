import React, { useState, useEffect, useRef } from "react";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import confetti from "canvas-confetti";
import * as mammoth from "mammoth";
import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
ChartJS.register(ArcElement, Tooltip, Legend);

const API_URL = "https://saulado.onrender.com";

function App() {
  // --- CORE STATE ---
  const [library, setLibrary] = useState([]);
  const [activeDeck, setActiveDeck] = useState(null);
  const [expandedDecks, setExpandedDecks] = useState(new Set());
  const [isModalOpen, setIsModalOpen] = useState(null);
  const [isQuizOpen, setIsQuizOpen] = useState(false);

  // Magic & UI State
  const [magicText, setMagicText] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const editorRef = useRef(null);

  // Quiz Engine State
  const [quizQueue, setQuizQueue] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [quizPhase, setQuizPhase] = useState("asking");
  const [quizMode, setQuizMode] = useState("type");
  const [sessionHistory, setSessionHistory] = useState([]);
  const [mistakesQueue, setMistakesQueue] = useState([]);
  const [cardLimit, setCardLimit] = useState(0);
  const [studyFilter, setStudyFilter] = useState("all");

  useEffect(() => {
    fetchLibrary();
  }, []);

  const fetchLibrary = async () => {
    try {
      const res = await fetch(`${API_URL}/api/library`);
      const data = await res.json();
      setLibrary(data);
      if (data.length > 0 && !activeDeck) setActiveDeck(data[0]);
      if (activeDeck) {
        const updated = findDeck(activeDeck.id, data);
        setActiveDeck(updated || (data.length > 0 ? data[0] : null));
      }
    } catch (e) {
      console.error("Backend offline");
    }
  };

  // --- UTILS ---
  const findDeck = (id, list) => {
    for (let d of list) {
      if (d.id === id) return d;
      if (d.subDecks) {
        let f = findDeck(id, d.subDecks);
        if (f) return f;
      }
    }
    return null;
  };

  const findParentDeck = (parentId, list) => {
    for (let d of list) {
      if (d.id === parentId) return d;
      if (d.subDecks) {
        let f = findParentDeck(parentId, d.subDecks);
        if (f) return f;
      }
    }
    return null;
  };

  const getAllCardsRecursively = (deck) => {
    if (!deck) return [];
    let cards = [...deck.cards];
    if (deck.subDecks)
      deck.subDecks.forEach(
        (sub) => (cards = [...cards, ...getAllCardsRecursively(sub)]),
      );
    return cards;
  };

  const calculateMastery = (cards) => {
    if (cards.length === 0) return 0;
    let totalPct = 0;
    cards.forEach((c) => {
      if (c.attempt_count > 0) totalPct += c.correct_count / c.attempt_count;
    });
    return Math.round((totalPct / cards.length) * 100);
  };

  const getAnswerFromHtml = (html) => {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.querySelector(".answer-highlight")?.innerText || "";
  };

  // --- EDITOR TOOLS ---
  const toggleHighlight = () => {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    let parent = sel.anchorNode.parentNode;
    if (parent.classList.contains("answer-highlight")) {
      const text = parent.innerText;
      parent.replaceWith(document.createTextNode(text));
    } else {
      const span = document.createElement("span");
      span.className = "answer-highlight";
      try {
        range.surroundContents(span);
      } catch (e) {
        console.error("Invalid Selection");
      }
    }
  };

  const formatAsBulletedList = () => {
    const rawText = editorRef.current.innerText;
    if (!rawText.trim()) return;
    const lines = rawText.split("\n");
    let formattedHtml = "";
    lines.forEach((line) => {
      let cleanLine = line.trim();
      if (!cleanLine) return;
      if (!cleanLine.includes(":") && !cleanLine.includes(" - ")) {
        formattedHtml += `<div>${cleanLine}</div>`;
        return;
      }
      cleanLine = cleanLine.replace(/^[•\*-]\s*/, "");
      let sepIdx = -1;
      let sepLen = 0;
      const colonIdx = cleanLine.indexOf(":");
      const hyphenIdx = cleanLine.indexOf(" - ");
      if (colonIdx !== -1 && (hyphenIdx === -1 || colonIdx < hyphenIdx)) {
        sepIdx = colonIdx;
        sepLen = 1;
      } else if (hyphenIdx !== -1) {
        sepIdx = hyphenIdx;
        sepLen = 3;
      }
      if (sepIdx !== -1) {
        const term = cleanLine.substring(0, sepIdx).trim();
        const definition = cleanLine.substring(sepIdx + sepLen).trim();
        formattedHtml += `<div>• <span class="answer-highlight">${term}</span>${sepLen === 1 ? ":" : " -"} ${definition}</div>`;
      } else {
        formattedHtml += `<div>• <span class="answer-highlight">${cleanLine}</span></div>`;
      }
    });
    editorRef.current.innerHTML = formattedHtml;
  };

  const saveCard = async () => {
    const html = editorRef.current.innerHTML;
    if (!editorRef.current.innerText.trim() || !activeDeck) return;
    await fetch(`${API_URL}/api/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deck_id: activeDeck.id,
        html,
        order_val: Date.now(),
      }),
    });
    editorRef.current.innerHTML = "";
    fetchLibrary();
  };

  const editCard = async (card) => {
    if (
      editorRef.current.innerText.trim() !== "" &&
      !confirm("Overwrite editor?")
    )
      return;
    editorRef.current.innerHTML = card.html;
    await fetch(`${API_URL}/api/cards/${card.id}`, { method: "DELETE" });
    fetchLibrary();
    editorRef.current.focus();
  };

  // --- DATABASE ACTIONS ---
  const handleCreateDeck = async (parentId = null) => {
    if (!newDeckName) return;
    const res = await fetch(`${API_URL}/api/decks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newDeckName, parent_id: parentId }),
    });
    const data = await res.json();
    setNewDeckName("");
    setIsModalOpen(null);
    if (parentId) expandedDecks.add(parentId);
    await fetchLibrary();
  };

  // --- SHUFFLE & ORDER ---
  const shuffleCards = () => {
    if (!activeDeck) return;
    const shuffled = [...activeDeck.cards].sort(() => Math.random() - 0.5);
    setActiveDeck({ ...activeDeck, cards: shuffled });
  };

  const resetOrder = () => {
    if (!activeDeck) return;
    const ordered = [...activeDeck.cards].sort(
      (a, b) => a.order_val - b.order_val,
    );
    setActiveDeck({ ...activeDeck, cards: ordered });
  };

  // --- MAGIC IMPORT ---
  const handleFileImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    let text = "";
    if (ext === "txt") text = await file.text();
    else if (ext === "docx") {
      const result = await mammoth.extractRawText({
        arrayBuffer: await file.arrayBuffer(),
      });
      text = result.value;
    } else if (ext === "pdf") {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((s) => s.str).join(" ") + "\n";
      }
    }
    setMagicText(text);
  };

  const processMagic = async () => {
    setIsImporting(true);
    const lines = magicText.split("\n");
    const baseTime = Date.now();
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim().replace(/^[•\*-]\s*/, "");
      if (!line) continue;
      let sepIdx = -1;
      let sepLen = 0;
      const colonIdx = line.indexOf(": ");
      const hyphenIdx = line.indexOf(" - ");
      if (colonIdx !== -1 && (hyphenIdx === -1 || colonIdx < hyphenIdx)) {
        sepIdx = colonIdx;
        sepLen = 2;
      } else if (hyphenIdx !== -1) {
        sepIdx = hyphenIdx;
        sepLen = 3;
      }
      if (sepIdx !== -1) {
        const term = line.substring(0, sepIdx).trim();
        const def = line.substring(sepIdx + sepLen).trim();
        if (term && def) {
          await fetch(`${API_URL}/api/cards`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deck_id: activeDeck.id,
              html: `<span class="answer-highlight">${term}</span> - ${def}`,
              order_val: baseTime + i,
            }),
          });
        }
      }
    }
    setMagicText("");
    setIsImporting(false);
    setIsModalOpen(null);
    fetchLibrary();
  };

  // --- QUIZ ENGINE ---
  const startQuiz = (limit) => {
    let pool = getAllCardsRecursively(activeDeck);
    if (studyFilter === "new") pool = pool.filter((c) => c.attempt_count === 0);
    if (pool.length === 0) return alert("Walang cards na tumutugma!");

    const shuffled = [...pool]
      .sort(() => 0.5 - Math.random())
      .slice(0, limit || pool.length);
    setQuizQueue(shuffled);
    setCurrentIdx(0);
    setCorrectCount(0);
    setStreak(0);
    setSessionHistory([]);
    setMistakesQueue([]);
    setQuizMode("type");
    setQuizPhase("asking");
    setIsQuizOpen(true);
    setIsModalOpen(null);
  };

  const submitAnswer = async (userVal) => {
    const card = quizQueue[currentIdx];
    const correct = getAnswerFromHtml(card.html);
    const temp = document.createElement("div");
    temp.innerHTML = card.html;

    setQuizPhase("checking");
    try {
      const res = await fetch(`${API_URL}/api/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAnswer: userVal, correctAnswer: correct }),
      });
      const data = await res.json();
      fetch(`${API_URL}/api/cards/${card.id}/track`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCorrect: data.isCorrect }),
      });

      if (data.isCorrect) {
        setCorrectCount((c) => c + 1);
        setStreak((s) => s + 1);
        confetti({ particleCount: 30, spread: 50 });
      } else {
        setStreak(0);
        setMistakesQueue((prev) => [...prev, card]);
      }

      setSessionHistory((prev) => [
        ...prev,
        {
          prompt: temp.innerText.replace(correct, "_______"),
          correct,
          user: userVal,
          isCorrect: data.isCorrect,
        },
      ]);
      setQuizPhase("feedback");
    } catch (e) {
      setQuizPhase("asking");
    }
  };

  const generateDecoys = (correct) => {
    const allAnswers = [
      ...new Set(quizQueue.map((c) => getAnswerFromHtml(c.html))),
    ].filter((a) => a && a !== correct);
    return [
      correct,
      ...allAnswers.sort(() => 0.5 - Math.random()).slice(0, 3),
    ].sort(() => 0.5 - Math.random());
  };

  const renderSidebarDecks = (decks, level = 0) => {
    return decks.map((deck) => (
      <div key={deck.id}>
        <div
          onClick={() => setActiveDeck(deck)}
          className={`group flex items-center justify-between px-4 py-2 rounded-xl cursor-pointer mb-1 transition-all ${activeDeck?.id === deck.id ? "bg-indigo-50 text-indigo-700 font-bold shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
          style={{ marginLeft: `${level * 12}px` }}
        >
          <div className="flex items-center truncate">
            {deck.subDecks?.length > 0 && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  const n = new Set(expandedDecks);
                  n.has(deck.id) ? n.delete(deck.id) : n.add(deck.id);
                  setExpandedDecks(n);
                }}
                className={`mr-2 transition-transform text-[10px] ${expandedDecks.has(deck.id) ? "rotate-90" : ""}`}
              >
                ▶
              </span>
            )}
            <span>{deck.name}</span>
          </div>
        </div>
        {expandedDecks.has(deck.id) &&
          deck.subDecks &&
          renderSidebarDecks(deck.subDecks, level + 1)}
      </div>
    ));
  };

  return (
    <div className="h-screen flex overflow-hidden bg-[#f8fafc] font-jakarta">
      {/* SIDEBAR */}
      <aside className="w-72 bg-white border-r hidden md:flex flex-col shrink-0 shadow-sm">
        <div className="p-8 text-center">
          <div className="text-3xl mb-2">🦉</div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tighter mb-6 uppercase">
            SAULADO<span className="text-indigo-600">.AI</span>
          </h1>
          <button
            onClick={() => setIsModalOpen("mainDeck")}
            className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-bold text-sm shadow-lg"
          >
            + Collection
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-4 pb-10 custom-scroll text-sm">
          {renderSidebarDecks(library)}
        </nav>
      </aside>

      {/* MAIN VIEW */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b flex items-center justify-between px-10 shrink-0 z-20">
          <div className="flex items-center gap-4">
            {activeDeck?.parent_id && (
              <button
                onClick={() => {
                  const parent = findParentDeck(activeDeck.parent_id, library);
                  if (parent) setActiveDeck(parent);
                }}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-600"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}
            <div className="text-sm font-bold text-slate-800 uppercase tracking-tight">
              {activeDeck?.name || "Select Collection"}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsModalOpen("magic")}
              className="bg-amber-400 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-sm uppercase tracking-tighter"
            >
              ✨ Magic Import
            </button>
            <button
              onClick={() => {
                setCardLimit(getAllCardsRecursively(activeDeck).length);
                setIsModalOpen("settings");
              }}
              className="bg-slate-900 text-white px-8 py-2.5 rounded-xl text-xs font-black shadow-xl uppercase tracking-tighter"
            >
              🚀 Simulan Na!
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-10 custom-scroll">
          {activeDeck ? (
            <div className="max-w-4xl mx-auto space-y-8 pb-24">
              <div className="bg-white p-6 rounded-[2rem] border shadow-sm">
                <div className="flex justify-between items-center mb-2 text-[10px] font-black text-slate-400 uppercase">
                  Knowledge Mastery{" "}
                  <span className="text-indigo-600">
                    {calculateMastery(getAllCardsRecursively(activeDeck))}%
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-1000"
                    style={{
                      width: `${calculateMastery(getAllCardsRecursively(activeDeck))}%`,
                    }}
                  ></div>
                </div>
              </div>

              <section>
                <div className="flex justify-between items-center mb-4 ml-2">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
                    Sub-Folders
                  </h3>
                  <button
                    onClick={() => setIsModalOpen("subDeck")}
                    className="text-[10px] bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full font-bold hover:bg-indigo-600 hover:text-white transition-all"
                  >
                    + ADD SUB-DECK
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {activeDeck.subDecks?.map((sub) => (
                    <div
                      key={sub.id}
                      onClick={() => setActiveDeck(sub)}
                      className="bg-white p-5 rounded-[2rem] border border-slate-100 cursor-pointer hover:border-indigo-400 text-center transition-all group"
                    >
                      <div className="text-3xl mb-1 group-hover:scale-110 transition-transform">
                        📂
                      </div>
                      <h4 className="text-[10px] font-bold uppercase truncate">
                        {sub.name}
                      </h4>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white p-8 rounded-[2.5rem] border shadow-sm">
                <div
                  ref={editorRef}
                  contentEditable
                  placeholder="Type or paste here..."
                  className="w-full min-h-[100px] text-xl outline-none mb-6 empty:before:content-[attr(placeholder)] empty:before:text-slate-300 leading-relaxed"
                />
                <div className="flex gap-2">
                  <button
                    onClick={toggleHighlight}
                    className="bg-indigo-50 text-indigo-600 px-5 py-3 rounded-xl font-bold text-xs hover:bg-indigo-100 transition-all"
                  >
                    ✨ Highlight
                  </button>
                  <button
                    onClick={formatAsBulletedList}
                    className="bg-amber-50 text-amber-600 px-5 py-3 rounded-xl font-bold text-xs hover:bg-amber-100 transition-all"
                  >
                    • Bullet List
                  </button>
                  <button
                    onClick={saveCard}
                    className="flex-1 bg-indigo-600 text-white px-5 py-3 rounded-xl font-black text-xs shadow-lg uppercase"
                  >
                    Save Card
                  </button>
                </div>
              </section>

              <section>
                <div className="flex justify-between items-center mb-4 ml-2">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
                    Reviewer Cards
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={shuffleCards}
                      className="text-[10px] bg-slate-50 text-slate-400 px-3 py-1 rounded-full font-bold hover:bg-slate-200"
                    >
                      Shuffle
                    </button>
                    <button
                      onClick={resetOrder}
                      className="text-[10px] bg-slate-50 text-slate-400 px-3 py-1 rounded-full font-bold hover:bg-slate-200"
                    >
                      Default
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm("Clear cards?")) {
                          await fetch(
                            `${API_URL}/api/decks/${activeDeck.id}/cards`,
                            { method: "DELETE" },
                          );
                          fetchLibrary();
                        }
                      }}
                      className="text-[10px] bg-rose-50 text-rose-500 px-3 py-1 rounded-full font-bold hover:bg-rose-500 hover:text-white uppercase"
                    >
                      Clear All
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm("Delete deck?")) {
                          await fetch(`${API_URL}/api/decks/${activeDeck.id}`, {
                            method: "DELETE",
                          });
                          setActiveDeck(null);
                          fetchLibrary();
                        }
                      }}
                      className="text-[10px] bg-rose-50 text-rose-500 px-3 py-1 rounded-full font-bold hover:bg-rose-500 hover:text-white uppercase"
                    >
                      Del Deck
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  {activeDeck.cards.map((card) => (
                    <div
                      key={card.id}
                      className="bg-white p-6 rounded-[2rem] border relative group transition-all hover:shadow-md"
                    >
                      <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => editCard(card)}
                          className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={async () => {
                            await fetch(`${API_URL}/api/cards/${card.id}`, {
                              method: "DELETE",
                            });
                            fetchLibrary();
                          }}
                          className="p-2 bg-rose-50 text-rose-500 rounded-lg"
                        >
                          ✕
                        </button>
                      </div>
                      <div
                        className="text-slate-700 leading-relaxed pr-10"
                        dangerouslySetInnerHTML={{ __html: card.html }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center">
              <div className="text-7xl mb-4">🦉</div>
              <p className="font-bold uppercase text-xs tracking-widest">
                Select a collection to start
              </p>
            </div>
          )}
        </div>
      </main>

      {/* QUIZ OVERLAY */}
      {isQuizOpen && (
        <div className="fixed inset-0 bg-[#f8fafc] z-[60] flex flex-col items-center justify-center p-6 overflow-y-auto custom-scroll">
          <div className="absolute top-8 left-8 flex items-center gap-4">
            <button
              onClick={() => setIsQuizOpen(false)}
              className="font-black text-slate-400 text-xs uppercase tracking-widest"
            >
              ← EXIT
            </button>
            <div className="bg-white px-4 py-2 rounded-xl border font-black text-orange-500 shadow-sm">
              🔥 {streak}
            </div>
          </div>
          {quizPhase !== "results" ? (
            <div className="w-full max-w-2xl text-center">
              <div className="text-7xl mb-6 transition-transform">
                {quizPhase === "feedback"
                  ? sessionHistory[currentIdx]?.isCorrect
                    ? "🎓"
                    : "✍️"
                  : quizPhase === "checking"
                    ? "🧐"
                    : "🦉"}
              </div>
              <div className="bg-white rounded-[3.5rem] shadow-2xl p-12 border border-slate-100 transition-all">
                <div className="text-2xl font-bold text-slate-800 mb-10 leading-relaxed">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: quizQueue[currentIdx]?.html.replace(
                        /<span class="answer-highlight">.*?<\/span>/g,
                        '<span class="text-indigo-500 font-black border-b-2 px-2">_______</span>',
                      ),
                    }}
                  />
                </div>
                {quizPhase === "asking" && (
                  <div className="space-y-6">
                    {quizMode === "type" ? (
                      <input
                        autoFocus
                        className="w-full p-5 rounded-2xl border-2 border-slate-100 text-center text-xl font-bold outline-indigo-500 shadow-sm"
                        placeholder="I-type ang sagot..."
                        onKeyUp={(e) =>
                          e.key === "Enter" && submitAnswer(e.target.value)
                        }
                      />
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {generateDecoys(
                          getAnswerFromHtml(quizQueue[currentIdx].html),
                        ).map((ans, i) => (
                          <button
                            key={i}
                            onClick={() => submitAnswer(ans)}
                            className="p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold hover:border-indigo-500 hover:bg-indigo-50 transition-all text-slate-600"
                          >
                            {ans}
                          </button>
                        ))}
                      </div>
                    )}
                    {quizMode === "type" && (
                      <button
                        onClick={() => setQuizMode("choice")}
                        className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-500"
                      >
                        Hindi sigurado? (Choices)
                      </button>
                    )}
                  </div>
                )}
                {quizPhase === "checking" && (
                  <div className="py-4 font-black text-slate-400 animate-pulse italic uppercase tracking-widest text-sm">
                    Thinking... 🧐
                  </div>
                )}
                {quizPhase === "feedback" && (
                  <div className="space-y-6">
                    <p
                      className={`text-xl font-black ${sessionHistory[currentIdx]?.isCorrect ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {sessionHistory[currentIdx]?.isCorrect
                        ? "Ang galing! ✨"
                        : `Mali! Sagot: ${sessionHistory[currentIdx]?.correct}`}
                    </p>
                    <button
                      onClick={() => {
                        setQuizMode("type");
                        if (currentIdx + 1 < quizQueue.length) {
                          setCurrentIdx((i) => i + 1);
                          setQuizPhase("asking");
                        } else {
                          setQuizPhase("results");
                          confetti({ particleCount: 150, spread: 70 });
                        }
                      }}
                      className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-lg uppercase"
                    >
                      Next Card →
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-2xl py-10">
              <h2 className="text-4xl font-black text-center mb-10 text-slate-800 uppercase tracking-tighter">
                Session Complete! 🎉
              </h2>
              <div className="bg-white p-10 rounded-[3rem] shadow-xl mb-10 text-center relative">
                <div className="w-48 h-48 mx-auto mb-6">
                  <Doughnut
                    data={{
                      labels: ["Tama", "Mali"],
                      datasets: [
                        {
                          data: [correctCount, quizQueue.length - correctCount],
                          backgroundColor: ["#6366f1", "#f1f5f9"],
                          borderWidth: 0,
                        },
                      ],
                    }}
                    options={{
                      cutout: "80%",
                      plugins: { legend: { display: false } },
                    }}
                  />
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center pt-8">
                  <span className="text-4xl font-black text-indigo-600">
                    {Math.round((correctCount / quizQueue.length) * 100)}%
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {correctCount} / {quizQueue.length} Correct
                  </span>
                </div>
              </div>
              {mistakesQueue.length > 0 && (
                <button
                  onClick={() => {
                    setQuizQueue(
                      [...mistakesQueue].sort(() => 0.5 - Math.random()),
                    );
                    setMistakesQueue([]);
                    setCurrentIdx(0);
                    setCorrectCount(0);
                    setStreak(0);
                    setSessionHistory([]);
                    setQuizPhase("asking");
                  }}
                  className="w-full bg-amber-500 text-white py-5 rounded-3xl font-black shadow-xl mb-10 uppercase tracking-widest"
                >
                  🎯 Re-study Mistakes
                </button>
              )}
              <div className="space-y-3 mb-10">
                {sessionHistory.map((item, i) => (
                  <div
                    key={i}
                    className="bg-white p-5 rounded-3xl border flex justify-between items-center shadow-sm"
                  >
                    <div className="flex-1 pr-4">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">
                        Question
                      </p>
                      <p className="text-sm font-bold text-slate-700 leading-tight">
                        {item.prompt}
                      </p>
                    </div>
                    <div className="text-right leading-none">
                      <p
                        className={`text-[10px] font-black uppercase mb-1 ${item.isCorrect ? "text-emerald-500" : "text-rose-400"}`}
                      >
                        {item.isCorrect ? "Correct" : "Incorrect"}
                      </p>
                      <p className="text-sm font-black text-indigo-600">
                        {item.correct}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  setIsQuizOpen(false);
                  fetchLibrary();
                }}
                className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black shadow-xl uppercase"
              >
                Back to Library
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODALS */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className={`bg-white w-full rounded-[2.5rem] p-10 flex flex-col ${isModalOpen === "magic" ? "max-w-xl" : "max-w-sm"}`}
          >
            {isModalOpen === "settings" && (
              <>
                <h3 className="font-black text-xl mb-6 text-center italic uppercase tracking-tighter text-slate-800 leading-none">
                  Study Settings 🚀
                </h3>
                <div className="flex bg-slate-100 p-1 rounded-2xl mb-6">
                  <button
                    onClick={() => setStudyFilter("all")}
                    className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase transition-all ${studyFilter === "all" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}
                  >
                    All Cards
                  </button>
                  <button
                    onClick={() => setStudyFilter("new")}
                    className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase transition-all ${studyFilter === "new" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}
                  >
                    New Only
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 uppercase font-black mb-2 text-center">
                  How many cards to answer?
                </p>
                <input
                  type="number"
                  value={cardLimit}
                  onChange={(e) => setCardLimit(e.target.value)}
                  className="bg-slate-50 p-4 rounded-xl font-bold mb-6 text-center outline-indigo-500"
                />
                <button
                  onClick={() => startQuiz(cardLimit)}
                  className="bg-indigo-600 text-white py-4 rounded-xl font-black shadow-lg uppercase tracking-widest"
                >
                  Start Study
                </button>
              </>
            )}
            {isModalOpen === "mainDeck" && (
              <>
                <h3 className="text-center font-black mb-6 text-xl">
                  New Collection
                </h3>
                <input
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  className="bg-slate-50 p-4 rounded-xl font-bold mb-4 outline-indigo-500"
                  placeholder="e.g. UML Basics"
                />
                <button
                  onClick={() => handleCreateDeck(null)}
                  className="bg-indigo-600 text-white py-4 rounded-xl font-black shadow-lg uppercase"
                >
                  Create
                </button>
              </>
            )}
            {isModalOpen === "subDeck" && (
              <>
                <h3 className="text-center font-black mb-6 text-xl">
                  New Sub-Deck
                </h3>
                <input
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  className="bg-slate-50 p-4 rounded-xl font-bold mb-4 outline-indigo-500"
                  placeholder="e.g. Chapter 1"
                />
                <button
                  onClick={() => handleCreateDeck(activeDeck.id)}
                  className="bg-indigo-600 text-white py-4 rounded-xl font-black shadow-lg uppercase"
                >
                  Add
                </button>
              </>
            )}
            {isModalOpen === "magic" && (
              <>
                <h3 className="font-black text-xl mb-4 italic">
                  Magic Import ✨
                </h3>
                <input
                  type="file"
                  accept=".txt,.docx,.pdf"
                  onChange={handleFileImport}
                  className="mb-4 text-xs font-bold text-slate-500"
                />
                <textarea
                  value={magicText}
                  onChange={(e) => setMagicText(e.target.value)}
                  className="w-full h-40 bg-slate-50 border p-4 rounded-xl text-sm mb-6 outline-none font-mono"
                  placeholder="Format: Word - Definition..."
                />
                <button
                  onClick={processMagic}
                  disabled={isImporting}
                  className="bg-amber-500 text-white py-4 rounded-xl font-black shadow-md uppercase"
                >
                  {isImporting ? "Processing..." : "Generate Reviewer"}
                </button>
              </>
            )}
            <button
              onClick={() => setIsModalOpen(null)}
              className="mt-4 text-slate-400 font-black text-[10px] uppercase hover:text-slate-900 text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
