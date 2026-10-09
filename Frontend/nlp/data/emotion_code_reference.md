# Emotion Code Reference

Use exactly these final emotion labels for the dataset ground truth:

1 = Happy
2 = Sad
3 = Anger
4 = Disgust
5 = Fear
6 = Sarcastic

## Rules

- These are the only valid final emotion codes.
- The raw review must remain unchanged.
- The preprocessed review may be filled later by the preprocessing pipeline.
- Evaluators assign the ground-truth emotion from full review context, not from a keyword dictionary only.
- Sarcasm is allowed and must be judged from context.
- Do not use Positive / Negative / Neutral / Angry / Envy as final dataset labels.

## Why these codes

This project requires emotion classification with the final professor-approved labels above. The labels are numeric and fixed for training and evaluation consistency.

## Example mapping

- "sobrang ganda talaga" -> Happy = 1
- "sakit sa ulo at hindi ko na maenjoy" -> Sad = 2
- "ang bastos ng seller, galit na galit ako" -> Anger = 3
- "naninikip at mabaho yung product" -> Disgust = 4
- "baka masira agad at takot ako magamit" -> Fear = 5
- "wow ang ganda naman, basag agad" -> Sarcastic = 6
