# Annotation Instructions for VoxReview Emotion Dataset

## Goal

Create a ground-truth labeled dataset for Taglish/English customer reviews using the professor-required final emotion classes:

1 = Happy
2 = Sad
3 = Anger
4 = Disgust
5 = Fear
6 = Sarcastic

## Required dataset columns

Each row must include at minimum:

- review_id
- raw_review
- preprocessed_review
- emotion
- emotion_code
- evaluator_notes

Additional metadata may be added if needed, especially for multiple-evaluator labeling:

- evaluator_id
- evaluator_emotion
- evaluator_emotion_code
- final_emotion
- final_emotion_code

## Annotation procedure

1. Preserve the original review exactly in `raw_review`.
2. Do not rewrite or normalize the raw text during annotation.
3. Leave `preprocessed_review` blank until preprocessing is applied later.
4. Read the full review context before selecting a label.
5. Assign one final emotion label only from the list 1-6.
6. If multiple evaluators participate, preserve each evaluator's label first and keep the final agreed label separately.
7. Use evaluator notes to capture ambiguity, sarcasm, slang, or mixed-language context.

## Important rules

- Do not automatically assign emotion based only on a keyword list.
- Do not assume a single word like "sira" or "badtrip" always maps to one emotion.
- Preserve Taglish/code-switching, abbreviations, repeated letters, emojis, misspellings, slang, and number substitutions exactly as they appear in the original review.
- Sarcasm must be judged from context, not from a single keyword.
- Example: "Wow, ang ganda naman. Basag pagdating." may be labeled Sarcastic = 6.

## Validation

- Accepted final emotion codes are only: 1, 2, 3, 4, 5, 6
- Empty values are allowed only before annotation is complete.
- Once annotated, the label must be one of the six valid codes.
