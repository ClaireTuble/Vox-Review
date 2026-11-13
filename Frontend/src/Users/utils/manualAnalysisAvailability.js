export function canStartManualAnalysis(analysisStatus, availabilityStatus) {
  return analysisStatus !== 'analyzing' && availabilityStatus !== 'disabled';
}
