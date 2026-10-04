```
# Implementation Plan: Lesson Engine and Learning Path
```

```
- [x] 1. Content schema and validation
  - Implement Zod schemas in src/features/lessons/schema.ts for all step types
  - Write scripts/validate-content.ts and the npm script; add valid/invalid test fixtures; add to CI
  - _Requirements: 1.1, 1.2, 1.3_
```

```
- [x] 2. Database for learning
  - Migrations for lessons_catalog, feature_unlock_rules, lesson_progress, lesson_attempts, assessment_results, user_unlocks, badges, rewind_items (DB reference section 3.5) with RLS
  - Add complete_lesson (5.3), submit_assessment, save_rewind_items, review_rewind_item RPCs with grants
  - pgTAP tests for XP, streak, freeze, prerequisites, pass threshold, unlock granting
  - _Requirements: 5.1, 5.2, 5.3, 5.6, 7.1, 7.4_
```

```
- [x] 3. Catalog sync script
  - Write scripts/sync-catalog.ts to generate seed SQL for lessons_catalog and feature_unlock_rules from content files
  - _Requirements: 1.4_
```

```
- [x] 4. Content loader and session store
  - Implement content.ts, scoring.ts (pure, tested), rng.ts (tested), and the Zustand session store
  - _Requirements: 3.1, 3.3, 5.1, 8.5_
```

```
- [x] 5. Lesson player shell
  - Build LessonPlayer with progress bar, StepRenderer registry, FeedbackSheet, exit confirm, haptics, reduce-motion support
  - Route lesson/[id] and wire analytics events
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 10.1_
```

```
- [x] 6. Core step components
  - CardsStep (swipe), McqStep (standard + explain), TrueFalseStep with accessibility labels and tests
  - _Requirements: 4.1, 4.2, 4.8_
```

```
- [x] 7. Interactive step components
  - PredictStep, SortStep (drag with tap fallback), MatchStep with tests
  - _Requirements: 4.3, 4.4, 4.5, 4.8_
```

```
- [x] 8. Sim framework and first two labs
  - SimStep + SimRegistry; implement OwnershipSplit and Auction with seeded RNG and tests
  - _Requirements: 4.6, 8.1, 8.2, 8.5_
```

```
- [x] 9. Remaining labs
  - Implement PnlReplay and OpeningBell with tests; add GuidedTradeStep placeholder
  - _Requirements: 4.7, 8.3, 8.4_
```

```
- [x] 10. Learning path screen
  - Build PathView, UnitHeader, LessonNode, ContinueCard with available/locked/completed states and unlock previews
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
```

```
- [x] 11. Completion flow and offline queue
  - useCompleteLesson mutation, results screen (XP, streak, freeze, unlocks, go-to-feature button), retry screen for sub-pass scores, AsyncStorage queue with retry
  - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_
```

```
- [x] 12. Placement Quest (L0)
  - Author L0 Form A (10 items), assessment submission, no-reveal results copy, Learn tab first-node behavior
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
```

```
- [x] 13. Rewind queue
  - Save missed items, RewindCard on Learn tab, Rewind session screen calling review_rewind_item
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 10.1_
```

```
- [x] 14. Author lesson content
  - Using docs/lesson-plan.md and the content review checklist, author L1.1, L1.2, L1.3, L1.4, L1.5, B1, L2.1 as JSON; run validate:content and sync-catalog
  - Hand the content to a human for review before marking complete
  - _Requirements: 9.1, 9.2, 9.3_
```

```
- [ ] 15. Checkpoint
  - Timed playthrough of every lesson on a device (target 3-4 minutes); fix pacing; confirm XP, streak, unlocks, and Rewind behave end to end
```