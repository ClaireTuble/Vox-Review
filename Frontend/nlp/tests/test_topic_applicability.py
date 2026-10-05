import unittest

from topic_applicability import (
    apply_platform_applicability,
    has_physical_location_evidence,
    has_transaction_evidence,
    is_topic_applicable_for_platform,
    normalize_platform,
)


class TopicApplicabilityTests(unittest.TestCase):
    def test_normalizes_platform_names_received_from_frontend(self):
        self.assertEqual(normalize_platform("google"), "google maps")
        self.assertEqual(normalize_platform("Google Reviews"), "google maps")
        self.assertEqual(normalize_platform("googleplay"), "google play store")
        self.assertEqual(normalize_platform("Google Play Store"), "google play store")
        self.assertEqual(normalize_platform("Steam"), "steam")

    def test_delivery_remains_relevant_for_shopee_and_lazada(self):
        for platform in ("Shopee", "Lazada"):
            with self.subTest(platform=platform):
                self.assertTrue(is_topic_applicable_for_platform(
                    "Delivery / Transaction",
                    platform,
                    "The parcel arrived in two days.",
                ))
                self.assertTrue(is_topic_applicable_for_platform(
                    "Delivery / Transaction",
                    platform,
                    "This review only discusses the product color.",
                ))

    def test_non_delivery_commerce_reviews_keep_other_selected_topics_unchanged(self):
        assignments = [
            {"label": "Quality", "score": 0.81},
            {"label": "Usability / Experience", "score": 0.80},
        ]
        for platform in ("Shopee", "Lazada"):
            with self.subTest(platform=platform):
                self.assertEqual(
                    apply_platform_applicability(
                        assignments,
                        "Matibay at madaling gamitin.",
                        platform,
                    ),
                    assignments,
                )

    def test_google_play_requires_transaction_evidence(self):
        self.assertFalse(is_topic_applicable_for_platform(
            "Delivery / Transaction",
            "googleplay",
            "The app crashes whenever I upload a photo.",
        ))
        self.assertTrue(is_topic_applicable_for_platform(
            "Delivery / Transaction",
            "Google Play Store",
            "My subscription payment was charged twice.",
        ))
        self.assertTrue(has_transaction_evidence(
            "Fast and seamless money transfer with instant confirmation."
        ))

    def test_steam_requires_transaction_evidence_but_allows_explicit_payments(self):
        self.assertFalse(is_topic_applicable_for_platform(
            "Delivery / Transaction",
            "Steam",
            "Great co-op gameplay with a memorable story.",
        ))
        self.assertTrue(is_topic_applicable_for_platform(
            "Delivery / Transaction",
            "Steam",
            "The new battle pass adds unfair microtransactions.",
        ))
        self.assertTrue(has_transaction_evidence(
            "Payment failed when I tried to purchase the expansion."
        ))

    def test_google_maps_environment_remains_applicable_without_text_cue(self):
        self.assertTrue(is_topic_applicable_for_platform(
            "Environment / Location",
            "Google Maps",
            "Friendly staff and great service.",
        ))

    def test_google_maps_delivery_requires_transaction_evidence(self):
        self.assertFalse(is_topic_applicable_for_platform(
            "Delivery / Transaction",
            "Google Maps",
            "The staff were friendly and the dining room was clean.",
        ))
        self.assertTrue(is_topic_applicable_for_platform(
            "Delivery / Transaction",
            "Google Maps",
            "They charged my card twice for the reservation.",
        ))

    def test_physical_place_evidence_is_required_on_digital_platforms(self):
        review = "The restaurant is near the train station with ample parking."
        self.assertTrue(has_physical_location_evidence(review))
        for platform in ("Shopee", "Lazada", "Google Play Store", "Steam"):
            with self.subTest(platform=platform):
                self.assertTrue(is_topic_applicable_for_platform(
                    "Environment / Location",
                    platform,
                    review,
                ))
                self.assertFalse(is_topic_applicable_for_platform(
                    "Environment / Location",
                    platform,
                    "The review has no physical place information.",
                ))

    def test_game_world_and_atmosphere_are_not_physical_evidence(self):
        for review in (
            "The game world has a beautiful atmosphere.",
            "The in-game environment and atmospheric soundtrack are immersive.",
            "The game's virtual world is full of detail.",
            "The game world contains a beautifully recreated city environment.",
        ):
            with self.subTest(review=review):
                self.assertFalse(has_physical_location_evidence(review, "Steam"))
                self.assertFalse(is_topic_applicable_for_platform(
                    "Environment / Location",
                    "Steam",
                    review,
                ))

    def test_physical_environment_can_be_allowed_even_on_steam(self):
        self.assertTrue(is_topic_applicable_for_platform(
            "Environment / Location",
            "Steam",
            "The game recreates real-world streets and a physical location.",
        ))

    def test_filter_suppresses_only_selected_inapplicable_topics_without_backfill(self):
        selected = [
            {"label": "Delivery / Transaction", "score": 0.84},
            {"label": "Environment / Location", "score": 0.83},
        ]
        self.assertEqual(
            apply_platform_applicability(
                selected,
                "The game world has a beautiful atmosphere.",
                "Steam",
            ),
            [],
        )

        one_valid = [
            {"label": "Delivery / Transaction", "score": 0.84},
            {"label": "Environment / Location", "score": 0.83},
        ]
        self.assertEqual(
            apply_platform_applicability(
                one_valid,
                "The game includes unfair microtransactions.",
                "Steam",
            ),
            [{"label": "Delivery / Transaction", "score": 0.84}],
        )

    def test_other_topics_and_unknown_platforms_are_not_filtered(self):
        self.assertTrue(is_topic_applicable_for_platform(
            "Quality",
            "Steam",
            "A product is durable.",
        ))
        self.assertTrue(is_topic_applicable_for_platform(
            "Environment / Location",
            "unknown-platform",
            "A virtual game environment.",
        ))


if __name__ == "__main__":
    unittest.main()
