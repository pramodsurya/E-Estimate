import type { TutorialChapter } from '../types'
import chapter1 from './chapter1'
import chapter2 from './chapter2'
import chapter3 from './chapter3'
import chapter4 from './chapter4'

export const CHAPTERS: TutorialChapter[] = [chapter1, chapter2, chapter3, chapter4]

export function chapterById(id: string): TutorialChapter | null {
  return CHAPTERS.find((chapter) => chapter.id === id) ?? null
}
