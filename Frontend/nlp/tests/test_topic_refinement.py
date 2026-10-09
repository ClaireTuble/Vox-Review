import unittest

from topic_refinement import refine_topic_scores


PERFORMANCE = "Performance / Functionality"
SERVICE = "Service / Support"
QUALITY = "Quality"
FEATURES = "Features / Content"
USABILITY = "Usability / Experience"
DELIVERY = "Delivery / Transaction"


def make_scores(**overrides):
    labels = (
        QUALITY,
        PERFORMANCE,
        FEATURES,
        SERVICE,
        DELIVERY,
        "Price / Value",
        USABILITY,
        "Accuracy / Expectations",
        "Availability / Accessibility",
        "Environment / Location",
        "Other / General",
    )
    scores = {label: 0.70 for label in labels}
    scores.update(overrides)
    return scores


class TopicRefinementTests(unittest.TestCase):
    threshold = 0.35

    def test_reinforces_only_a_competitive_performance_candidate_on_clear_failure(self):
        scores = make_scores(**{
            PERFORMANCE: 0.31,
            FEATURES: 0.36,
        })

        refined = refine_topic_scores(
            "The app keeps crashing and is not working.",
            scores,
            self.threshold,
        )

        self.assertEqual(refined, scores)

    def test_keeps_explicit_support_response_evidence(self):
        scores = make_scores(**{SERVICE: 0.30})

        refined = refine_topic_scores(
            "The seller replied quickly to my message.",
            scores,
            self.threshold,
        )

        self.assertEqual(refined, scores)

    def test_only_boosts_delivery_when_model_score_is_competitive(self):
        scores = make_scores(**{
            DELIVERY: 0.32,
            SERVICE: 0.36,
        })

        refined = refine_topic_scores(
            "The courier delivery was delayed.",
            scores,
            self.threshold,
        )

        self.assertEqual(refined, scores)

    def test_preserves_existing_accuracy_evidence_without_promoting_weak_score(self):
        scores = make_scores(**{
            "Accuracy / Expectations": 0.30,
            FEATURES: 0.36,
        })

        refined = refine_topic_scores(
            "The wrong size arrived, not as described.",
            scores,
            self.threshold,
        )

        self.assertEqual(refined, scores)

    def test_does_not_map_broad_keywords_without_context(self):
        scores = make_scores(**{
            FEATURES: 0.20,
            SERVICE: 0.20,
        })

        refined = refine_topic_scores(
            "The game seller was there.",
            scores,
            self.threshold,
        )

        self.assertEqual(refined, scores)

    def test_does_not_override_a_strong_conflicting_model_score(self):
        scores = make_scores(**{
            PERFORMANCE: 0.31,
            FEATURES: 0.60,
        })

        refined = refine_topic_scores(
            "This app keeps crashing.",
            scores,
            self.threshold,
        )

        self.assertEqual(refined, scores)

    def test_does_not_create_topic_when_model_candidate_is_too_weak(self):
        scores = make_scores(**{PERFORMANCE: 0.10})

        refined = refine_topic_scores(
            "This app keeps crashing.",
            scores,
            self.threshold,
        )

        self.assertEqual(refined, scores)

    def test_explicit_cues_rerank_e5_scores_without_changing_raw_values(self):
        cases = [
            (
                "The game keeps crashing after the latest update.",
                make_scores(**{
                    SERVICE: 0.7772,
                    QUALITY: 0.7653,
                    PERFORMANCE: 0.7540,
                    FEATURES: 0.7542,
                }),
                PERFORMANCE,
            ),
            (
                "The customer support team never replied to my refund request.",
                make_scores(**{
                    SERVICE: 0.8084,
                    "Accuracy / Expectations": 0.7574,
                    PERFORMANCE: 0.7562,
                }),
                SERVICE,
            ),
            (
                "The graphics are beautiful and the new characters look amazing.",
                make_scores(**{
                    FEATURES: 0.7980,
                    "Usability / Experience": 0.7855,
                    QUALITY: 0.7733,
                }),
                FEATURES,
            ),
            (
                "App is slow, keeps freezing, and crashes.",
                make_scores(**{
                    "Usability / Experience": 0.8055,
                    PERFORMANCE: 0.8045,
                    FEATURES: 0.7989,
                    QUALITY: 0.7969,
                }),
                PERFORMANCE,
            ),
            (
                "The audio quality is poor and distorted.",
                make_scores(**{
                    QUALITY: 0.7962,
                    FEATURES: 0.7771,
                    "Price / Value": 0.7710,
                }),
                QUALITY,
            ),
            (
                "I love the new character and map added in the update.",
                make_scores(**{
                    FEATURES: 0.8038,
                    "Usability / Experience": 0.7859,
                    SERVICE: 0.7726,
                }),
                FEATURES,
            ),
            (
                "The controls are confusing and difficult to use.",
                make_scores(**{
                    FEATURES: 0.8065,
                    QUALITY: 0.8012,
                    "Usability / Experience": 0.8009,
                }),
                USABILITY,
            ),
            (
                "The delivery was late and the package was damaged.",
                make_scores(**{
                    DELIVERY: 0.8171,
                    QUALITY: 0.7925,
                    SERVICE: 0.7894,
                }),
                DELIVERY,
            ),
            (
                "The room was clean and the staff were friendly.",
                make_scores(**{
                    "Usability / Experience": 0.7912,
                    QUALITY: 0.7671,
                    "Environment / Location": 0.7595,
                }),
                "Usability / Experience",
            ),
            (
                "I had a nice day, thanks.",
                make_scores(**{
                    "Usability / Experience": 0.7976,
                    "Price / Value": 0.7875,
                    DELIVERY: 0.7846,
                    SERVICE: 0.7824,
                }),
                "Usability / Experience",
            ),
        ]

        for review, scores, expected_primary in cases:
            with self.subTest(review=review):
                refined = refine_topic_scores(review, scores, self.threshold)
                selected = sorted(
                    refined,
                    key=lambda label: (-refined[label], label),
                )[:2]

                self.assertEqual(selected[0], expected_primary)
                self.assertEqual(len(selected), 2)
                self.assertEqual(scores, make_scores(**scores))
                if expected_primary == "Usability / Experience" and not any(
                    cue in review.lower()
                    for cue in ("controls", "confusing", "difficult", "easy to use")
                ):
                    self.assertEqual(refined, scores)


if __name__ == "__main__":
    unittest.main()
