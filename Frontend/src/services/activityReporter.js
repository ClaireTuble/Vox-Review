export function createActivityReporter({ postActivity }) {
  return {
    reportPageDetection({ platform, productTitle = '', productUrl = '' }) {
      return postActivity({
        platform,
        activity_type: 'Used',
        product_title: productTitle,
        product_url: productUrl,
      });
    },
    reportAnalysisCompletion(analysis) {
      return postActivity({
        platform: analysis.platform,
        activity_type: 'Analyzed',
        product_title: analysis.productTitle || analysis.targetTitle || '',
        product_url: analysis.page_url || '',
        analysis_run_id: analysis.runId,
      });
    },
  };
}
