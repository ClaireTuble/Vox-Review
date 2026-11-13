(function () {
  const REVIEWER_IDENTITY_KEYS = new Set([
    'reviewer',
    'reviewerName',
    'reviewer_name',
    'reviewername',
    'username',
    'userName',
    'user_name',
    'user',
    'author',
    'authorName',
    'author_name',
    'profileUrl',
    'profile_url',
    'profileLink',
    'profile_link',
    'profileurl',
    'userId',
    'user_id',
    'userID',
    'reviewerId',
    'reviewer_id',
    'reviewerID',
    'accountId',
    'account_id',
    'accountID',
    'commentId',
    'comment_id',
    'commentID',
    'reviewId',
    'review_id',
    'reviewID',
    'platformReviewId',
    'platform_review_id',
    'authorId',
    'author_id',
    'memberId',
    'customerId',
    'customerName',
    'customer_name',
    'displayName',
    'display_name',
    'fullName',
    'full_name',
    'name',
    'firstName',
    'first_name',
    'lastName',
    'last_name',
    'email',
    'phone',
    'phoneNumber',
    'address',
    'avatarUrl',
    'avatar_url',
    'memberUrl',
    'member_url',
    'profilePicture',
    'profile_picture',
    'profileImage',
    'profile_image',
  ]);

  const REVIEW_TEXT_FIELDS = ['text', 'reviewText', 'comment', 'review', 'content', 'body', 'reviewBody'];
  const DATA_MINIMIZED_PLATFORMS = new Set(['steam', 'googleplay', 'shopee', 'lazada']);
  const HELPFULNESS_METRICS = new Set(['helpful_votes', 'review_likes']);

  function normalizeWhitespace(value) {
    return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
  }

  function sanitizeHelpfulCount(value) {
    if (value === null || value === undefined || value === '') return null;
    const count = typeof value === 'number'
      ? value
      : (typeof value === 'string' &&
        /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value.trim())
        ? Number(value.replace(/,/g, ''))
        : NaN);
    return Number.isSafeInteger(count) && count >= 0 ? count : null;
  }

  function addHelpfulnessMetadata(safeReview, review) {
    if (!['helpfulCount', 'helpfulnessMetric', 'helpfulnessAvailable']
      .some((key) => Object.hasOwn(review, key))) return;
    const count = sanitizeHelpfulCount(review.helpfulCount);
    const metric = HELPFULNESS_METRICS.has(review.helpfulnessMetric)
      ? review.helpfulnessMetric
      : null;
    const available = review.helpfulnessAvailable === true && count !== null && metric !== null;
    safeReview.helpfulCount = available ? count : null;
    safeReview.helpfulnessMetric = available ? metric : null;
    safeReview.helpfulnessAvailable = available;
  }

  function sanitizeReviewText(text) {
    if (typeof text !== 'string') return '';
    let sanitized = normalizeWhitespace(text);
    if (!sanitized) return '';

    const greetingLabels = [];
    sanitized = sanitized.replace(/\b(Salamat\s+Kay|Para kay|Hi|Hello|Thanks|Thank you|Salamat|Kay|From)\s+(?:[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\b/gi, (_match, label) => {
      const marker = `\u0000GREETING_${greetingLabels.length}\u0000`;
      greetingLabels.push({ marker, label });
      return `${marker} [NAME]`;
    });

    sanitized = sanitized.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]');
    sanitized = sanitized.replace(/(?:\+?\d{1,3}[\s().-]?)?(?:\(?\d{2,4}\)?[\s().-]?){2,5}\d{3,4}/g, (match) => {
      const digits = String(match).replace(/\D+/g, '');
      const isLikelyPhone = digits.length >= 7 && digits.length <= 15 && /(?:\+|^09|^63|^0)/.test(match.replace(/\s+/g, ''));
      return isLikelyPhone ? '[PHONE]' : match;
    });
    sanitized = sanitized.replace(/\b(?:order|invoice|tracking|ref(?:erence)?|awb|shipment|parcel|receipt|delivery|package)(?:\s*(?:no|num(?:ber)?|number|id)\.?)?(?:[\s:;#-]+)([A-Z0-9-]{4,32})\b/gi, (match, orderId) => {
      const label = match.slice(0, match.length - orderId.length).trim().replace(/[.:;#-]+$/, '');
      return `${label} [ORDER_ID]`;
    });
    const addressPattern = /\b(?:\d{1,6}\s+[A-Za-z0-9. -]{2,40}\s+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr|Barangay|Brgy|Block|Blk|Lot|Unit|Bldg|Building|Subdivision|Subd|Sitio|City|Municipality|Province))\b/gi;
    const reverseAddressPattern = /\b(?:Blk|Blg|Lot|Unit|Bldg|Building|Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr|Barangay|Brgy|Sitio|Subdivision|Subd)\s+\d{1,6}[A-Za-z0-9.\- ]{0,40}\b/gi;
    sanitized = sanitized.replace(addressPattern, '[ADDRESS]').replace(reverseAddressPattern, '[ADDRESS]');

    sanitized = sanitized.replace(/\b(?:Mr|Mrs|Ms|Dr|Sir|Madam|Ma'am|Maam)\.?\s+(?:[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\b/g, '[NAME]');    sanitized = sanitized.replace(/\b(?:Hi|Hello|Thanks|Thank you|Salamat|Kay|Para kay|From)\s+(?:[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\b/g, '[NAME]');

    greetingLabels.forEach(({ marker, label }) => {
      sanitized = sanitized.replace(marker, label);
    });

    return normalizeWhitespace(sanitized);
  }

  function isReviewerIdentityField(key) {
    if (typeof key !== 'string') return false;
    const normalized = key.trim();
    if (!normalized) return false;
    if (REVIEWER_IDENTITY_KEYS.has(normalized)) return true;
    const compact = normalized.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (new Set([
      'reviewerid',
      'accountid',
      'commentid',
      'reviewid',
      'platformreviewid',
      'authorid',
      'userid',
      'memberid',
      'customerid',
    ]).has(compact)) return true;
    return /(?:^|_)(?:name|username|user|profile|avatar|member|customer|author|reviewer|phone|email|address)(?:$|[A-Z_])/i.test(normalized);
  }

  function sanitizeObjectValue(value) {
    if (typeof value === 'string') return sanitizeReviewText(value);
    if (Array.isArray(value)) {
      return value.map((entry) => sanitizeObjectValue(entry)).filter((entry) => {
        if (entry === undefined || entry === null) return false;
        if (typeof entry === 'string') return entry.trim().length > 0;
        if (typeof entry === 'object') return Object.keys(entry).length > 0;
        return true;
      });
    }
    if (value && typeof value === 'object') {
      const next = {};
      for (const [key, nestedValue] of Object.entries(value)) {
        if (isReviewerIdentityField(key)) continue;
        const sanitizedEntry = sanitizeObjectValue(nestedValue);
        if (sanitizedEntry !== undefined && sanitizedEntry !== null) {
          if (typeof sanitizedEntry === 'object' && !Array.isArray(sanitizedEntry) && Object.keys(sanitizedEntry).length === 0) {
            continue;
          }
          next[key] = sanitizedEntry;
        }
      }
      return next;
    }
    return value;
  }

  function stripReviewerIdentityMetadata(review) {
    if (typeof review === 'string') return sanitizeReviewText(review);
    if (!review || typeof review !== 'object') return review;

    const nextReview = {};
    for (const [key, value] of Object.entries(review)) {
      if (isReviewerIdentityField(key)) continue;
      const sanitizedValue = sanitizeObjectValue(value);
      if (sanitizedValue !== undefined && sanitizedValue !== null) {
        if (typeof sanitizedValue === 'object' && !Array.isArray(sanitizedValue) && Object.keys(sanitizedValue).length === 0) {
          continue;
        }
        nextReview[key] = sanitizedValue;
      }
    }

    for (const field of REVIEW_TEXT_FIELDS) {
      if (typeof nextReview[field] === 'string') {
        nextReview[field] = sanitizeReviewText(nextReview[field]);
      }
    }

    return nextReview;
  }

  function sanitizeReviewObject(review) {
    if (typeof review === 'string') return sanitizeReviewText(review);
    if (!review || typeof review !== 'object') return review;

    const cleanedReview = stripReviewerIdentityMetadata(review);
    for (const field of REVIEW_TEXT_FIELDS) {
      if (typeof cleanedReview[field] === 'string') {
        cleanedReview[field] = sanitizeReviewText(cleanedReview[field]);
      }
    }
    return cleanedReview;
  }

  function sanitizeReviewForAnalysis(review, platform = '') {
    if (typeof review === 'string') return sanitizeReviewText(review);
    if (!review || typeof review !== 'object' || Array.isArray(review)) return null;
    const resolvedPlatform = String(platform || review.platform || '').trim().toLowerCase();
    if (!DATA_MINIMIZED_PLATFORMS.has(resolvedPlatform)) {
      return sanitizeReviewObject(review);
    }

    const text = REVIEW_TEXT_FIELDS
      .map((field) => review[field])
      .find((value) => typeof value === 'string' && value.trim());
    if (!text) return { text: '' };

    const safeReview = { text: sanitizeReviewText(text) };
    const date = typeof review.date === 'string'
      ? review.date
      : (typeof review.reviewDate === 'string' ? review.reviewDate : '');
    if (date.trim()) safeReview.date = sanitizeReviewText(date);
    if ((typeof review.rating === 'number' && Number.isFinite(review.rating)) ||
        (typeof review.rating === 'string' && /^\d+(?:\.\d+)?$/.test(review.rating.trim()))) {
      safeReview.rating = review.rating;
    }
    if (review.recommendation === 'positive' || review.recommendation === 'negative') {
      safeReview.recommendation = review.recommendation;
    }
    addHelpfulnessMetadata(safeReview, review);
    if (typeof review.platform === 'string' && review.platform.trim()) {
      safeReview.platform = review.platform.trim().toLowerCase();
    }
    return safeReview;
  }

  function sanitizeReviewsForAnalysis(reviews, platform = '') {
    if (!Array.isArray(reviews)) return [];
    return reviews
      .map((review) => sanitizeReviewForAnalysis(review, platform))
      .filter((review, index) => {
        if (typeof review === 'string') return review.trim().length > 0;
        if (!review || typeof review !== 'object') return false;
        const source = reviews[index];
        const resolvedPlatform = String(platform || source?.platform || '').trim().toLowerCase();
        const hasText = REVIEW_TEXT_FIELDS.some((field) => (
          typeof review[field] === 'string' && review[field].trim()
        ));
        return DATA_MINIMIZED_PLATFORMS.has(resolvedPlatform)
          ? Boolean(review.text)
          : Boolean(hasText || Object.keys(review).length > 0);
      });
  }

  function sanitizeReviewTextList(reviews) {
    if (!Array.isArray(reviews)) return [];
    return reviews
      .map((review) => {
        if (typeof review === 'string') return sanitizeReviewText(review);
        if (!review || typeof review !== 'object') return '';
        const textValue = REVIEW_TEXT_FIELDS
          .map((field) => review[field])
          .find((value) => typeof value === 'string' && value.trim());
        return sanitizeReviewText(textValue || '');
      })
      .filter((text) => text && text.trim().length > 0);
  }

  globalThis.__voxreviewPrivacyRedaction = {
    sanitizeReviewText,
    sanitizeReviewObject,
    sanitizeReviewForAnalysis,
    sanitizeReviewsForAnalysis,
    sanitizeReviewTextList,
    stripReviewerIdentityMetadata,
  };
}());
