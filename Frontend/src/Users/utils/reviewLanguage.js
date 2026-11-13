// The ESM entry's runtime import is not callable in Vite browser builds.
import { loadModule } from 'cld3-asm/dist/cjs/index.js';
import { getReviewText } from './reviewTopics.js';

const SUPPORTED_LANGUAGES = new Set(['en', 'fil', 'tgl', 'tl']);
const MIN_LETTER_COUNT_FOR_DETECTION = 20;
const MIN_CONFIDENCE_FOR_EXCLUSION = 0.75;
const MIN_NON_LATIN_LETTERS_FOR_EXCLUSION = 2;
const MIN_NON_LATIN_LETTER_RATIO_FOR_EXCLUSION = 0.5;
const INDONESIAN_DISTINCTIVE_WORDS = new Set([
  'banget', 'belum', 'bukan', 'dengan', 'kecewa', 'kualitas', 'pengiriman',
  'sangat', 'sesuai', 'sudah', 'tidak', 'untuk',
]);
const INDONESIAN_REVIEW_WORDS = new Set([
  'bagus', 'barang', 'cepat', 'deskripsi', 'harga', 'lambat', 'mantap',
  'murah', 'produk', 'rusak', 'sampai', 'saya',
]);
const FILIPINO_WORDS = new Set([
  'ako', 'ang', 'atin', 'at', 'dahil', 'dumating', 'gamitin', 'maganda',
  'mabilis', 'mga', 'ng', 'nito', 'niya', 'po', 'sa', 'siya', 'sulit', 'talaga',
]);
let languageIdentifierPromise;

function countLetters(text) {
  return Array.from(text).filter((character) => /\p{L}/u.test(character)).length;
}

function getLanguageTokens(text) {
  const tokens = new Set(text.toLowerCase().match(/\p{L}+/gu) || []);
  for (const token of tokens) {
    if (token.endsWith('nya') && token.length > 4) {
      tokens.add(token.slice(0, -3));
    }
  }
  return tokens;
}

function hasStrongIndonesianEvidence(tokens) {
  const distinctiveCount = [...INDONESIAN_DISTINCTIVE_WORDS]
    .filter((word) => tokens.has(word)).length;
  const reviewWordCount = [...INDONESIAN_REVIEW_WORDS]
    .filter((word) => tokens.has(word)).length;
  const filipinoWordCount = [...FILIPINO_WORDS]
    .filter((word) => tokens.has(word)).length;

  if (filipinoWordCount >= 2 || (filipinoWordCount > 0 && distinctiveCount < 2)) {
    return false;
  }

  return distinctiveCount >= 2 ||
    (distinctiveCount > 0 && reviewWordCount >= 1) ||
    reviewWordCount >= 3;
}

function normalizeReviewForLanguageDetection(text) {
  return text
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<\/?[a-z][^>]*>/giu, ' ')
    .replace(/\[\s*\/?\s*[a-z][^\]]*\]/giu, ' ')
    .replace(/https?:\/\/\S+|www\.\S+/giu, ' ')
    .replace(/&(?:#x[\da-f]+|#\d+|[a-z][\da-z]+);/giu, ' ')
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
}

function hasDominantUnsupportedScript(text) {
  const letters = Array.from(text).filter((character) => /\p{L}/u.test(character));
  const nonLatinLetters = letters.filter((character) => !/\p{Script=Latin}/u.test(character));
  return nonLatinLetters.length >= MIN_NON_LATIN_LETTERS_FOR_EXCLUSION &&
    nonLatinLetters.length / letters.length >= MIN_NON_LATIN_LETTER_RATIO_FOR_EXCLUSION;
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
  const text = normalizeReviewForLanguageDetection(getReviewText(review));
  const tokens = getLanguageTokens(text);
  const letterCount = countLetters(text);
  const dominantUnsupportedScript = hasDominantUnsupportedScript(text);
  if (letterCount < MIN_LETTER_COUNT_FOR_DETECTION && !dominantUnsupportedScript) {
    if (hasStrongIndonesianEvidence(tokens)) {
      return {
        status: 'unsupported',
        language: 'id',
        confidence: null,
        detectionMethod: 'indonesian_lexicon',
      };
    }
    return { status: 'uncertain', language: null, confidence: null };
  }

  const identifier = await getLanguageIdentifier();
  const result = identifier.findLanguage(text);
  if (
    dominantUnsupportedScript &&
    result.is_reliable &&
    result.probability >= MIN_CONFIDENCE_FOR_EXCLUSION &&
    result.language &&
    result.language !== 'und' &&
    !SUPPORTED_LANGUAGES.has(result.language)
  ) {
    return {
      status: 'unsupported',
      language: result.language,
      confidence: result.probability,
      detectionMethod: 'cld3+script',
    };
  }
  const nearThresholdIndonesian = result.language === 'id' &&
    result.is_reliable &&
    result.probability >= 0.65 &&
    result.probability < MIN_CONFIDENCE_FOR_EXCLUSION;
  if (SUPPORTED_LANGUAGES.has(result.language) && hasStrongIndonesianEvidence(tokens)) {
    return {
      status: 'unsupported',
      language: 'id',
      confidence: null,
      detectionMethod: 'indonesian_lexicon',
    };
  }
  if (
    !result.is_reliable ||
    result.probability < MIN_CONFIDENCE_FOR_EXCLUSION ||
    !result.language ||
    result.language === 'und'
  ) {
    if (hasStrongIndonesianEvidence(tokens) &&
      (!SUPPORTED_LANGUAGES.has(result.language) || nearThresholdIndonesian)) {
      return {
        status: 'unsupported',
        language: 'id',
        confidence: result.language === 'id' ? result.probability ?? null : null,
        detectionMethod: result.language === 'id'
          ? 'cld3+indonesian_lexicon'
          : 'indonesian_lexicon',
      };
    }
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
  let supportedReviewCount = 0;
  let uncertainReviewCount = 0;

  decisions.forEach((decision, index) => {
    if (decision.status === 'unsupported') {
      skippedReviews.push({
        review: reviews[index],
        status: 'skipped',
        reason: 'unsupported_language',
        detectedLanguage: decision.language,
        confidence: decision.confidence,
        ...(decision.detectionMethod ? { detectionMethod: decision.detectionMethod } : {}),
      });
    } else {
      acceptedReviews.push(reviews[index]);
      if (decision.status === 'supported') supportedReviewCount += 1;
      else uncertainReviewCount += 1;
    }
  });

  return {
    reviews: acceptedReviews,
    skippedReviews,
    supportedReviewCount,
    uncertainReviewCount,
  };
}
