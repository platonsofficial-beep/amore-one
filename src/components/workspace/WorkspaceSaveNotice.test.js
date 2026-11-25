import { describe, expect, it } from 'vitest'
import { saveNoticeIsError } from './WorkspaceSaveNotice'

describe('save notice tone', () => {
  it('treats a saved profile as confirmation in English and Greek', () => {
    expect(saveNoticeIsError('Workspace profile saved.')).toBe(false)
    expect(saveNoticeIsError('Το προφίλ καταστήματος αποθηκεύτηκε.')).toBe(false)
    expect(saveNoticeIsError('Seating added.')).toBe(false)
    expect(saveNoticeIsError('Unable to save workspace profile right now.')).toBe(true)
    expect(saveNoticeIsError('Το προφίλ καταστήματος δεν αποθηκεύτηκε.')).toBe(true)
    expect(saveNoticeIsError('Position name is required.')).toBe(true)
  })
})
