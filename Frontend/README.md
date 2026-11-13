# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Bounded Steam review analysis

Steam analysis uses only review cards currently extracted from the page (or the single fallback API response); Steam's displayed lifetime review total is not treated as collected data. Duplicate review IDs and normalized review text are excluded from analysis, while the original scrape remains unchanged.

The defaults are 200 unique Steam reviews per analysis and batches of at most 100 reviews per SVM or topic request. The batch size defaults to 100; values above 100 are capped. Override them with the Vite build variables `VITE_STEAM_ANALYSIS_MAX_REVIEWS` and `VITE_ANALYSIS_REVIEW_BATCH_SIZE`. Values must be positive integers. Requests run sequentially; a failed batch identifies its position and does not return a partial combined result. A completed Steam analysis reports its actual analyzed count, the loaded unique count, duplicates, skipped unsupported-language reviews, and reviews omitted from that sample. If more reviews are already loaded, the popup can analyze the next sample; otherwise, use Steam's own “Show More” control and rescan the page. Additional samples are explicit and do not automatically request every Steam review.

## Topic Analysis selection

The normal topic classifier uses `intfloat/multilingual-e5-small` with the existing `query:` review and `passage:` topic-description prefixes. Similarity scores are not probabilities. The shared production selector uses provisional uniform cutoffs of 0.80 for semantic matches and 0.65 for independently cue-supported assignments across all 11 topics. It considers at most two semantic-only matches; additional topics require their own contextual evidence and must meet the cue cutoff. These values are operating settings from qualitative comparison, not statistically calibrated thresholds or evidence of improved accuracy. Zero-topic results are valid.

## Production emotion classification

The extension sends emotion batches to the backend NLP endpoint, which runs `Frontend/nlp/logistic_regression_worker.py` with the saved six-class Logistic Regression artifact. The existing `/api/nlp/svm/predict` URL is retained as a legacy compatibility route; it does not select or run SVM. Production inference uses only the baseline LR prediction with the approved preprocessing and feature builder; Disgust, Fear, and Sarcastic specialist overrides and contextual resolution are research-only and cannot change the production label. Each review retains one dominant label: Happy, Sad, Anger, Disgust, Fear, or Sarcastic.

`VOXREVIEW_EMOTION_MODEL` is no longer a model selector. It may be unset or set to `logistic_regression`; any other value fails backend startup. Missing or incompatible LR artifacts fail worker startup and are not replaced with SVM or a research model.

The reported grouped OOF baseline evaluation was 71.80% accuracy, 32.87% macro-F1, and 71.11% weighted-F1. Disgust, Fear, and Sarcastic each had zero F1 in that evaluation. These are evaluation results, not a guarantee of current deployment performance; reliable minority-emotion recognition is not established. Hybrid specialist models, thresholds, scripts, and experiment reports remain available for offline research, but are not part of production routing.
