---
trigger: model_decision
description: "Activate for FSRS scheduling, flashcards, quizzes, study limits and review statistics"
---

# Learning invariants
- Use established FSRS library, not homemade formulas; enforce default new/day=10 max reviews/day=50, UTC and user locale boundary.
- One explicit grade yields one transactional FSRS update. Repeated submit ID must not create another event.
- Contextual cloze recalls English term from stored original sentence; quiz distractors unique and plausible.
- Quiz accuracy is not automatically FSRS recall. No double counting across modes.
- Mastered is meaningful interval/threshold, not one correct guess; show no fake retention percentage.
