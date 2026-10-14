export function getEmotionResultDisplay(emotion, evidencePhrases) {
  const model = typeof emotion?.model === 'string' && emotion.model.trim()
    ? emotion.model
    : emotion?.confidence === 'SVM' ? 'SVM' : null;
  const phrases = Array.isArray(evidencePhrases)
    ? evidencePhrases.filter((phrase) => typeof phrase === 'string' && phrase.trim())
    : [];

  return {
    model,
    evidencePhrases: phrases,
    evidenceMessage: phrases.length > 0
      ? null
      : emotion?.count === 0
        ? `No reviews were classified into ${emotion.label}, so no emotion evidence phrases are available.`
        : 'No specific phrase could be identified as supporting this prediction.',
  };
}
