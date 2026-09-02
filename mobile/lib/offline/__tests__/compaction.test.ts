import { describe, expect, it } from 'vitest'
import { compactQueue } from '../compaction'
import type { OfflineMutation } from '../types'

describe('Queue Compaction Engine', () => {
  it('compacts create_set + update_set into a single create_set with merged payload', () => {
    const queue: OfflineMutation[] = [
      {
        type: 'create_set',
        tempSetId: 'temp-set-1',
        title: 'Original Title',
        color: 'amber',
        userId: 'u1',
        idempotencyKey: 'k1',
        queuedAt: '2026-09-01T00:00:00Z',
      },
      {
        type: 'update_set',
        setId: 'temp-set-1',
        title: 'Updated Title',
        color: 'blue',
        clientUpdatedAt: '2026-09-01T00:01:00Z',
        userId: 'u1',
        idempotencyKey: 'k2',
        queuedAt: '2026-09-01T00:01:00Z',
      },
    ]

    const result = compactQueue(queue)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'create_set',
      tempSetId: 'temp-set-1',
      title: 'Updated Title',
      color: 'blue',
    })
  })

  it('compacts create_set + delete_set on temporary set into NO-OP and cascade purges child cards', () => {
    const queue: OfflineMutation[] = [
      {
        type: 'create_set',
        tempSetId: 'temp-set-1',
        title: 'Physics',
        userId: 'u1',
        idempotencyKey: 'k1',
        queuedAt: '2026-09-01T00:00:00Z',
      },
      {
        type: 'create_card',
        tempCardId: 'temp-card-1',
        setId: 'temp-set-1',
        paragraph: 'Gravity is 9.8 m/s^2',
        answers: [{ startOffset: 11, endOffset: 14 }],
        userId: 'u1',
        idempotencyKey: 'k2',
        queuedAt: '2026-09-01T00:01:00Z',
      },
      {
        type: 'submit_answer',
        sessionId: 'offline-s1',
        cardId: 'temp-card-1',
        submittedValues: { 0: '9.8' },
        revealed: false,
        durationMs: 2000,
        userId: 'u1',
        idempotencyKey: 'k3',
        queuedAt: '2026-09-01T00:02:00Z',
      },
      {
        type: 'delete_set',
        setId: 'temp-set-1',
        userId: 'u1',
        idempotencyKey: 'k4',
        queuedAt: '2026-09-01T00:03:00Z',
      },
    ]

    const result = compactQueue(queue)
    expect(result).toHaveLength(0) // Everything cascade purged
  })

  it('compacts create_card + delete_card into NO-OP and purges associated submit_answer mutations', () => {
    const queue: OfflineMutation[] = [
      {
        type: 'create_card',
        tempCardId: 'temp-card-1',
        setId: 'real-set-100',
        paragraph: 'Water is H2O',
        answers: [{ startOffset: 0, endOffset: 5 }],
        userId: 'u1',
        idempotencyKey: 'k1',
        queuedAt: '2026-09-01T00:00:00Z',
      },
      {
        type: 'submit_answer',
        sessionId: 'offline-s1',
        cardId: 'temp-card-1',
        submittedValues: { 0: 'Water' },
        revealed: false,
        durationMs: 1500,
        userId: 'u1',
        idempotencyKey: 'k2',
        queuedAt: '2026-09-01T00:01:00Z',
      },
      {
        type: 'delete_card',
        cardId: 'temp-card-1',
        setId: 'real-set-100',
        userId: 'u1',
        idempotencyKey: 'k3',
        queuedAt: '2026-09-01T00:02:00Z',
      },
    ]

    const result = compactQueue(queue)
    expect(result).toHaveLength(0)
  })

  it('compacts multiple update_card mutations into a single merged update', () => {
    const queue: OfflineMutation[] = [
      {
        type: 'update_card',
        cardId: 'real-card-1',
        setId: 'real-set-1',
        paragraph: 'First Paragraph',
        answers: [{ startOffset: 0, endOffset: 5 }],
        clientUpdatedAt: '2026-09-01T00:01:00Z',
        userId: 'u1',
        idempotencyKey: 'k1',
        queuedAt: '2026-09-01T00:01:00Z',
      },
      {
        type: 'update_card',
        cardId: 'real-card-1',
        setId: 'real-set-1',
        paragraph: 'Second Paragraph Final',
        tags: ['chemistry'],
        clientUpdatedAt: '2026-09-01T00:02:00Z',
        userId: 'u1',
        idempotencyKey: 'k2',
        queuedAt: '2026-09-01T00:02:00Z',
      },
    ]

    const result = compactQueue(queue)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'update_card',
      cardId: 'real-card-1',
      paragraph: 'Second Paragraph Final',
      tags: ['chemistry'],
      clientUpdatedAt: '2026-09-01T00:02:00Z',
    })
  })

  it('compacts update_set + delete_set into delete_set for server-backed sets', () => {
    const queue: OfflineMutation[] = [
      {
        type: 'update_set',
        setId: 'real-set-555',
        title: 'New Title',
        clientUpdatedAt: '2026-09-01T00:01:00Z',
        userId: 'u1',
        idempotencyKey: 'k1',
        queuedAt: '2026-09-01T00:01:00Z',
      },
      {
        type: 'delete_set',
        setId: 'real-set-555',
        userId: 'u1',
        idempotencyKey: 'k2',
        queuedAt: '2026-09-01T00:02:00Z',
      },
    ]

    const result = compactQueue(queue)
    expect(result).toHaveLength(1)
    const first = result[0]
    expect(first?.type).toBe('delete_set')
    if (first?.type === 'delete_set') {
      expect(first.setId).toBe('real-set-555')
    }
  })

  it('preserves failed mutations during compaction for error reporting', () => {
    const queue: OfflineMutation[] = [
      {
        type: 'create_set',
        tempSetId: 'temp-1',
        title: 'Bad Set',
        userId: 'u1',
        idempotencyKey: 'k1',
        queuedAt: '2026-09-01T00:00:00Z',
        status: 'failed',
        error: 'Validation failed: Title contains invalid characters',
      },
    ]

    const result = compactQueue(queue)
    expect(result).toHaveLength(1)
    expect(result[0]!.status).toBe('failed')
  })
})
