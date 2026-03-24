import { describe, expect, it } from 'vitest'
import { buildUserStats, dedupeProcessIds, emptyUserStats } from './processRegistry'

describe('processRegistry stats helpers', () => {
  it('returns empty stats when there are no rows', () => {
    expect(buildUserStats([])).toEqual(emptyUserStats)
  })

  it('builds stats for a single process', () => {
    expect(
      buildUserStats([
        {
          processId: '0x11111111111111111111111111111111111111111111111111111111111111',
          votersCount: 42n,
        },
      ]),
    ).toEqual({
      createdProcesses: [
        {
          processId:
            '0x11111111111111111111111111111111111111111111111111111111111111',
          votersCount: 42n,
        },
      ],
      createdProcessesCount: 1,
      totalVotersAcrossCreatedProcesses: 42n,
    })
  })

  it('sorts multiple processes by voters count descending and sums totals', () => {
    const stats = buildUserStats([
      {
        processId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        votersCount: 12n,
      },
      {
        processId: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        votersCount: 77n,
      },
      {
        processId: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        votersCount: 31n,
      },
    ])

    expect(stats.createdProcessesCount).toBe(3)
    expect(stats.totalVotersAcrossCreatedProcesses).toBe(120n)
    expect(stats.createdProcesses.map((row) => row.votersCount)).toEqual([
      77n,
      31n,
      12n,
    ])
  })

  it('dedupes repeated process ids defensively', () => {
    expect(
      dedupeProcessIds([
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ]),
    ).toEqual([
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ])
  })
})
