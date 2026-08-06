/**
 * Phase 1.4 editor spike — throwaway prototype for mobile viability testing.
 *
 * Test criteria (desktop + real phone):
 * 1. Can you accurately select a word or phrase?
 * 2. Does multi-word selection work without frustration?
 * 3. Can you adjust selection boundaries (extend/shrink)?
 * 4. Does it work when the paragraph wraps across lines?
 * 5. Is there visual feedback that you've selected something?
 * 6. Can you create multiple highlights without re-typing the paragraph?
 *
 * This prototype uses the native browser selection API. The alternative
 * (ProseMirror/Slate) adds ~100KB and a week of integration time. Only
 * choose that path if this approach fails mobile testing.
 */

import { useState, useRef } from 'react'
import {
  assignOrdinals,
  codeUnitToCodePoint,
  createAnswer,
  reanchorAnswers,
  renderClozeText,
  validateAnswers,
  type DraftAnswer,
} from '@saulado/shared'

const SAMPLES = [
  {
    label: 'CPU / RAM',
    text: 'The CPU is the brain of the computer, and RAM provides temporary storage.',
  },
  {
    label: 'Unicode',
    text: 'The 🧠 stores memories, 記憶 means memory, and café takes an accent.',
  },
  {
    label: 'Repeated words',
    text: 'RAM is volatile memory. Buy more RAM if programs feel slow.',
  },
] as const

export function TextHighlighter() {
  // The paragraph is held exactly as the textarea reports it. Offsets from the
  // selection API only mean anything against that same string, so normalizing
  // here (CRLF folding, trailing-space stripping) would silently shift every
  // offset by the difference. A textarea's value is already LF-only per spec.
  const [paragraph, setParagraph] = useState('')
  const [answers, setAnswers] = useState<DraftAnswer[]>([])
  const [selectedText, setSelectedText] = useState('')
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const [error, setError] = useState('')
  const [orphanCount, setOrphanCount] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSelect = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const { selectionStart, selectionEnd, value } = textarea
    const text = value.substring(selectionStart, selectionEnd)

    if (text.trim().length === 0) {
      setSelectedText('')
      setSelection(null)
      return
    }

    // selectionStart/End are UTF-16 code units; the engine speaks code points.
    // Emoji and CJK make these diverge, which is the whole reason this
    // conversion lives in shared/ and gets exercised here on a real device.
    setSelectedText(text)
    setSelection({
      start: codeUnitToCodePoint(value, selectionStart),
      end: codeUnitToCodePoint(value, selectionEnd),
    })
  }

  // Editing the paragraph after highlights exist is where offsets rot. Rather
  // than blocking the edit, re-anchor and report what could not be relocated.
  const handleParagraphChange = (next: string) => {
    setError('')

    if (answers.length === 0) {
      setParagraph(next)
      return
    }

    const { matched, orphaned } = reanchorAnswers(paragraph, next, answers)
    setParagraph(next)
    setAnswers(assignOrdinals(matched))
    setOrphanCount(orphaned.length)
  }

  const captureHighlight = () => {
    if (!selection || !selectedText.trim()) return
    setError('')

    let candidate: DraftAnswer[]
    try {
      candidate = assignOrdinals([
        ...answers,
        createAnswer(paragraph, selection.start, selection.end),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create highlight')
      return
    }

    // Overlap and ordering are the engine's rules, not the UI's. Asking it
    // keeps the spike honest about what the real editor will accept.
    const issues = validateAnswers(paragraph, candidate)
    if (issues.length > 0) {
      setError(issues[0]?.message ?? 'Invalid highlight')
      return
    }

    setAnswers(candidate)
    setSelectedText('')
    setSelection(null)
  }

  const removeHighlight = (index: number) => {
    setAnswers(assignOrdinals(answers.filter((_, i) => i !== index)))
    setError('')
  }

  // Typing an emoji-and-CJK paragraph on a phone is friction that would derail
  // the test, so the awkward inputs are one tap away.
  const loadSample = (text: string) => {
    setParagraph(text)
    setAnswers([])
    setSelectedText('')
    setSelection(null)
    setError('')
    setOrphanCount(0)
  }

  const preview = answers.length === 0 ? paragraph : renderClozeText(paragraph, answers)

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 20, fontFamily: 'system-ui' }}>
      <h2>Editor Spike — Phase 1.4</h2>
      <p style={{ color: '#666', fontSize: 14 }}>
        Test this on <strong>desktop</strong> and <strong>a real phone</strong>. Can you accurately
        highlight words? Does multi-word selection work?
      </p>

      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {SAMPLES.map((sample) => (
            <button
              key={sample.label}
              onClick={() => loadSample(sample.text)}
              style={{
                padding: '10px 14px',
                minHeight: 44,
                background: '#e2e8f0',
                border: '1px solid #cbd5e1',
                borderRadius: 4,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              {sample.label}
            </button>
          ))}
        </div>
        <label
          htmlFor="spike-paragraph"
          style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}
        >
          Write your paragraph:
        </label>
        <textarea
          id="spike-paragraph"
          ref={textareaRef}
          value={paragraph}
          onChange={(e) => handleParagraphChange(e.target.value)}
          onSelect={handleSelect}
          placeholder="The CPU is the brain of the computer, and RAM provides temporary storage."
          rows={6}
          style={{
            width: '100%',
            padding: 12,
            fontSize: 16,
            fontFamily: 'inherit',
            border: '1px solid #ddd',
            borderRadius: 4,
            resize: 'vertical',
          }}
        />
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 12,
            padding: 12,
            background: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: 4,
            fontSize: 14,
            color: '#991b1b',
          }}
        >
          {error}
        </div>
      )}

      {orphanCount > 0 && (
        <div
          role="status"
          style={{
            marginTop: 12,
            padding: 12,
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: 4,
            fontSize: 14,
            color: '#92400e',
          }}
        >
          {orphanCount} blank{orphanCount === 1 ? '' : 's'} lost its anchor when you edited the
          paragraph. In the real editor you would be asked to re-place or discard{' '}
          {orphanCount === 1 ? 'it' : 'them'} — never dropped silently.
        </div>
      )}

      {selectedText && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: 14, marginBottom: 8 }}>
            Selected: <strong>{selectedText}</strong>
          </div>
          <button
            onClick={captureHighlight}
            style={{
              padding: '12px 20px',
              minHeight: 44,
              background: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontSize: 16,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Make this a blank
          </button>
        </div>
      )}

      {answers.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>Blanks ({answers.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {answers.map((answer, idx) => (
              <div
                key={`${answer.startOffset}-${answer.endOffset}`}
                style={{
                  padding: 8,
                  background: '#f3f4f6',
                  borderRadius: 4,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 14,
                }}
              >
                <span>
                  <strong>#{idx + 1}:</strong> {answer.answerText}{' '}
                  <span style={{ color: '#6b7280' }}>
                    [{answer.startOffset}–{answer.endOffset}]
                  </span>
                </span>
                <button
                  onClick={() => removeHighlight(idx)}
                  aria-label={`Remove blank ${idx + 1}, ${answer.answerText}`}
                  style={{
                    padding: '10px 14px',
                    minHeight: 44,
                    background: 'transparent',
                    color: '#ef4444',
                    border: '1px solid #ef4444',
                    borderRadius: 4,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {answers.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>Preview</h3>
          <div
            style={{
              padding: 12,
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 4,
              fontSize: 16,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          >
            {preview}
          </div>
        </div>
      )}

      <div style={{ marginTop: 30, padding: 16, background: '#eff6ff', borderRadius: 4 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginTop: 0 }}>Mobile test checklist</h4>
        <ul style={{ fontSize: 14, color: '#334155', margin: 0, paddingLeft: 20 }}>
          <li>Select a single word by tap-and-drag.</li>
          <li>Select multiple words across a line break.</li>
          <li>Drag the selection handles to adjust without losing the selection.</li>
          <li>Confirm the yellow bar appears as soon as you lift your finger.</li>
          <li>Confirm the buttons are comfortable to tap one-handed.</li>
          <li>
            Load the Unicode sample, blank the emoji and the CJK phrase, and confirm the offsets
            shown in brackets land on the right characters.
          </li>
          <li>
            Blank a word, then edit text <em>before</em> it. The blank should follow the word, not
            drift onto a neighbour.
          </li>
          <li>Delete a blanked word outright. It should be reported as orphaned, not vanish.</li>
        </ul>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 0 }}>
          Record what happened in <code>docs/adr/0001-editor.md</code>. If handle-dragging is the
          part that fails, the fallback is tap-to-select whole words, which is a better touch
          interaction anyway.
        </p>
      </div>
    </div>
  )
}
