import unittest

from evaluate_topic_thresholds import build_threshold_report, parse_thresholds
from topic_taxonomy import TOPIC_LABELS


class TopicThresholdTests(unittest.TestCase):
    def test_parses_requested_thresholds(self):
        self.assertEqual(parse_thresholds("0.50, 0.60,0.65,0.70"), [0.5, 0.6, 0.65, 0.7])

    def test_applies_each_threshold_to_same_scores_and_compares_manual_labels(self):
        scores_by_label = {label: 0.1 for label in TOPIC_LABELS}
        scores_by_label.update({
            "Features / Content": 0.91,
            "Delivery / Transaction": 0.68,
            "Quality": 0.65,
            "Service / Support": 0.63,
        })
        rows = [{
            "reviewId": "fixture-1",
            "platform": "Shopee",
            "review": "Existing review text",
            "expectedTopics": ["Features / Content", "Quality", "Delivery / Transaction"],
        }]
        results = [{
            "topicScores": [
                {"label": label, "score": scores_by_label[label]}
                for label in TOPIC_LABELS
            ],
        }]

        report = build_threshold_report(rows, results, [0.5, 0.6, 0.65, 0.7])
        sweeps = report["thresholdSweeps"]

        self.assertEqual([sweep["reviews"][0]["selectedTopicCount"] for sweep in sweeps], [4, 4, 3, 1])
        self.assertEqual(sweeps[2]["reviews"][0]["selectedTopics"], [
            "Quality", "Features / Content", "Delivery / Transaction",
        ])
        self.assertEqual(sweeps[2]["manualLabelComparison"]["truePositiveAssignments"], 3)
        self.assertEqual(sweeps[2]["manualLabelComparison"]["exactMatches"], 1)
        self.assertEqual(report["rawScores"][0]["topicScores"], results[0]["topicScores"])


if __name__ == "__main__":
    unittest.main()