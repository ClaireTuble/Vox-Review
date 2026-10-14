// The ESM entry's runtime import is not callable in Vite browser builds.
import { loadModule } from 'cld3-asm/dist/cjs/index.js';
import { getReviewText } from './reviewTopics.js';

const SUPPORTED_LANGUAGES = new Set(['en', 'fil', 'tgl', 'tl']);
const MIN_LETTER_COUNT_FOR_DETECTION = 20;
const MIN_CONFIDENCE_FOR_EXCLUSION = 0.75;
let languageIdentifierPromise;

function countLetters(text) {
  return Array.from(text).filter((character) => /\p{L}/u.test(character)).length;
}

async function getLanguageIdentifier() {
  if (!languageIdentifierPromise) {
    languageIdentifierPromise = loadModule()
      .then((wasmModule) => wasmModule.create(0, 4096))
      .catch((error) => {
        languageIdentifierPromise = null;
        throw error;
      });
  }
  return languageIdentifierPromise;
}

export async function identifyReviewLanguage(review) {
  const text = getReviewText(review);
  if (countLetters(text) < MIN_LETTER_COUNT_FOR_DETECTION) {
    return { status: 'uncertain', language: null, confidence: null };
  }

  const identifier = await getLanguageIdentifier();
  const result = identifier.findLanguage(text);
  if (
    !result.is_reliable ||
    result.probability < MIN_CONFIDENCE_FOR_EXCLUSION ||
    !result.language ||
    result.language === 'und'
  ) {
    return { status: 'uncertain', language: result.language || null, confidence: result.probability ?? null };
  }

  if (SUPPORTED_LANGUAGES.has(result.language)) {
    return { status: 'supported', language: result.language, confidence: result.probability };
  }

  return { status: 'unsupported', language: result.language, confidence: result.probability };
}

export async function prepareReviewsForAnalysis(reviews) {
  if (!Array.isArray(reviews)) {
    throw new TypeError('reviews must be an array');
  }

  const decisions = await Promise.all(reviews.map((review) => identifyReviewLanguage(review)));
  const acceptedReviews = [];
  const skippedReviews = [];

  decisions.forEach((decision, index) => {
    if (decision.status === 'unsupported') {
      skippedReviews.push({
        review: reviews[index],
        status: 'skipped',
        reason: 'unsupported_language',
        detectedLanguage: decision.language,
        confidence: decision.confidence,
      });
    } else {
      acceptedReviews.push(reviews[index]);
    }
  });

  return { reviews: acceptedReviews, skippedReviews };
}
