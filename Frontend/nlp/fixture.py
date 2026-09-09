"""
VoxReview NLP Development Fixture

This is a small development fixture for testing the dataset loader and preprocessing pipeline.

IMPORTANT: This is NOT official training data. It contains synthetic examples only.
"""

import csv
from pathlib import Path


# Development fixture data - 5 examples per emotion class (30 total)
FIXTURE_DATA = [
    # HAPPY (emotion_code = 1)
    {
        "review_id": "DEV_001",
        "raw_review": "SOBRANG GANDAAAA!!! sulit na sulit 😍❤️",
        "emotion": "Happy",
        "emotion_code": 1,
        "evaluator_notes": "Clear positive emotion. Repeated letters and emojis.",
    },
    {
        "review_id": "DEV_002",
        "raw_review": "gr8 quality lng talaga! hnd ako pwedeng mag complain :)",
        "emotion": "Happy",
        "emotion_code": 1,
        "evaluator_notes": "Text-speak (gr8) and abbreviations (lng, hnd). Emoticon.",
    },
    {
        "review_id": "DEV_003",
        "raw_review": "excellent product! very nice ng packaging at ang quality talaga",
        "emotion": "Happy",
        "emotion_code": 1,
        "evaluator_notes": "Pure positive. Mixed English-Tagalog (Taglish).",
    },
    {
        "review_id": "DEV_004",
        "raw_review": "perfect parfect perfect 👍 worth every peso!",
        "emotion": "Happy",
        "emotion_code": 1,
        "evaluator_notes": "Misspelling (parfect), repeated word, thumbs up emoji.",
    },
    {
        "review_id": "DEV_005",
        "raw_review": "ung quality is amazing, ok na ok kami <3",
        "emotion": "Happy",
        "emotion_code": 1,
        "evaluator_notes": "Abbreviation (ung), slang (ok na ok), heart emoticon.",
    },
    
    # SAD (emotion_code = 2)
    {
        "review_id": "DEV_006",
        "raw_review": "sakit sa ulo at hindi ko na maenjoy 😭😭😭",
        "emotion": "Sad",
        "emotion_code": 2,
        "evaluator_notes": "Sad emotion with repeated emoji.",
    },
    {
        "review_id": "DEV_007",
        "raw_review": "disappointing :( hnd talaga ang quality na inexpect ko",
        "emotion": "Sad",
        "emotion_code": 2,
        "evaluator_notes": "Sad emoticon. Abbreviation (hnd). Mixed language.",
    },
    {
        "review_id": "DEV_008",
        "raw_review": "really sad about this purchase basaag agad",
        "emotion": "Sad",
        "emotion_code": 2,
        "evaluator_notes": "Straightforward sad emotion. Simple text.",
    },
    {
        "review_id": "DEV_009",
        "raw_review": "brokeeeeeen pagdating, very disappointing pala :'(",
        "emotion": "Sad",
        "emotion_code": 2,
        "evaluator_notes": "Repeated letters (brokeeeeeen). Sad emoticon :'(",
    },
    {
        "review_id": "DEV_010",
        "raw_review": "malungkot talaga. hindi worth it ang presyo 😢",
        "emotion": "Sad",
        "emotion_code": 2,
        "evaluator_notes": "Taglish. Direct sad expression. Sad emoji.",
    },
    
    # ANGER (emotion_code = 3)
    {
        "review_id": "DEV_011",
        "raw_review": "GALIT NA GALIT AKO!!! ang bastos ng seller grrrr",
        "emotion": "Anger",
        "emotion_code": 3,
        "evaluator_notes": "Clear anger. Caps, repeated letters (grrrr).",
    },
    {
        "review_id": "DEV_012",
        "raw_review": "napaka-bastos, walang respect 😡😡 hindi ko accept ito!",
        "emotion": "Anger",
        "emotion_code": 3,
        "evaluator_notes": "Angry emojis. Strong negative sentiment.",
    },
    {
        "review_id": "DEV_013",
        "raw_review": "SCAM!!! hindi talaga yan ang lala ng kasinungalingan :@",
        "emotion": "Anger",
        "emotion_code": 3,
        "evaluator_notes": "Accusatory. Anger emoticon :@",
    },
    {
        "review_id": "DEV_014",
        "raw_review": "furious sa seller, pwede bang mag request ng refund?! 😠",
        "emotion": "Anger",
        "emotion_code": 3,
        "evaluator_notes": "Angry emoji. Demanding tone.",
    },
    {
        "review_id": "DEV_015",
        "raw_review": "napakainis! ang mahal at pangittt pa ang quality",
        "emotion": "Anger",
        "emotion_code": 3,
        "evaluator_notes": "Taglish. Misspelling (pangittt→pangit). Frustrated tone.",
    },
    
    # DISGUST (emotion_code = 4)
    {
        "review_id": "DEV_016",
        "raw_review": "naninikip at mabaho yung product 😒 ew talaga",
        "emotion": "Disgust",
        "emotion_code": 4,
        "evaluator_notes": "Disgusted emoji. Gross/disgusted reaction.",
    },
    {
        "review_id": "DEV_017",
        "raw_review": "disgusting quality, feels cheap and gross",
        "emotion": "Disgust",
        "emotion_code": 4,
        "evaluator_notes": "Direct disgust words. Plain English.",
    },
    {
        "review_id": "DEV_018",
        "raw_review": "yugggg hindi ako makatitig 😷 panget talaga",
        "emotion": "Disgust",
        "emotion_code": 4,
        "evaluator_notes": "Repeated letter (yugggg). Sick emoji. Taglish.",
    },
    {
        "review_id": "DEV_019",
        "raw_review": "repulsive, di ko kayang i-display sa bahay",
        "emotion": "Disgust",
        "emotion_code": 4,
        "evaluator_notes": "Strong negative. Abbreviation (di).",
    },
    {
        "review_id": "DEV_020",
        "raw_review": "ang lalasap nito pangettttt talaga :/ waste of money",
        "emotion": "Disgust",
        "emotion_code": 4,
        "evaluator_notes": "Repeated letters. Confused/disgusted emoticon :/",
    },
    
    # FEAR (emotion_code = 5)
    {
        "review_id": "DEV_021",
        "raw_review": "baka masira agad, takot ako magamit nito 😨",
        "emotion": "Fear",
        "emotion_code": 5,
        "evaluator_notes": "Fearful emoji. Worried about durability.",
    },
    {
        "review_id": "DEV_022",
        "raw_review": "unsafe, concerned sa potential hazard. hnd secure ito",
        "emotion": "Fear",
        "emotion_code": 5,
        "evaluator_notes": "Safety concerns. Abbreviation (hnd).",
    },
    {
        "review_id": "DEV_023",
        "raw_review": "frightening quality. worried ito may dangerous materials 😰",
        "emotion": "Fear",
        "emotion_code": 5,
        "evaluator_notes": "Fear-related vocabulary. Anxious emoji.",
    },
    {
        "review_id": "DEV_024",
        "raw_review": "takot na takot ako! baka damaged 😟 lng puwede gawin",
        "emotion": "Fear",
        "emotion_code": 5,
        "evaluator_notes": "Repeated word (takot na takot). Abbreviation (lng).",
    },
    {
        "review_id": "DEV_025",
        "raw_review": "nervous about using this, seem risky talaga ang durability",
        "emotion": "Fear",
        "emotion_code": 5,
        "evaluator_notes": "Mixed language. Concern about safety.",
    },
    
    # SARCASTIC (emotion_code = 6)
    {
        "review_id": "DEV_026",
        "raw_review": "wow ang ganda naman talaga. basag pagdating. amazing 🙄",
        "emotion": "Sarcastic",
        "emotion_code": 6,
        "evaluator_notes": "Clear sarcasm. Praise followed by negative reality.",
    },
    {
        "review_id": "DEV_027",
        "raw_review": "perfect! :D hnd talaga yan ang sira naming natanggap",
        "emotion": "Sarcastic",
        "emotion_code": 6,
        "evaluator_notes": "Sarcastic happy emoticon. Contradiction. Abbreviation (hnd).",
    },
    {
        "review_id": "DEV_028",
        "raw_review": "such wonderful quality, ok na ok kami sa defects lol",
        "emotion": "Sarcastic",
        "emotion_code": 6,
        "evaluator_notes": "Sarcastic praise. Slang (ok na ok). Lol indicator.",
    },
    {
        "review_id": "DEV_029",
        "raw_review": "amazing service! only took 3 weeks :) so fast talaga",
        "emotion": "Sarcastic",
        "emotion_code": 6,
        "evaluator_notes": "Sarcastic about slowness. Happy emoticon used sarcastically.",
    },
    {
        "review_id": "DEV_030",
        "raw_review": "best purchase ever! ... hindi lang talaga badtrip",
        "emotion": "Sarcastic",
        "emotion_code": 6,
        "evaluator_notes": "Sarcasm with ellipsis. Slang (badtrip). Mixed language.",
    },
]


def create_fixture(output_path: str = "data/development_fixture.csv"):
    """
    Create development fixture CSV file.
    
    Args:
        output_path: Path where to save the fixture
    """
    output_path_obj = Path(output_path)
    output_path_obj.parent.mkdir(parents=True, exist_ok=True)
    
    fieldnames = [
        "review_id",
        "raw_review",
        "preprocessed_review",
        "emotion",
        "emotion_code",
        "evaluator_notes",
        "evaluator_id",
        "evaluator_emotion",
        "evaluator_emotion_code",
        "final_emotion",
        "final_emotion_code",
    ]
    
    with open(output_path_obj, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        
        for item in FIXTURE_DATA:
            row = {
                "review_id": item["review_id"],
                "raw_review": item["raw_review"],
                "preprocessed_review": "",  # Will be filled by dataset loader
                "emotion": item["emotion"],
                "emotion_code": item["emotion_code"],
                "evaluator_notes": item["evaluator_notes"],
                "evaluator_id": "DEV_FIXTURE",
                "evaluator_emotion": item["emotion"],
                "evaluator_emotion_code": item["emotion_code"],
                "final_emotion": item["emotion"],
                "final_emotion_code": item["emotion_code"],
            }
            writer.writerow(row)
    
    print(f"✓ Development fixture created: {output_path_obj}")
    print(f"  - Total reviews: {len(FIXTURE_DATA)}")
    print(f"  - Happy: 5 reviews")
    print(f"  - Sad: 5 reviews")
    print(f"  - Anger: 5 reviews")
    print(f"  - Disgust: 5 reviews")
    print(f"  - Fear: 5 reviews")
    print(f"  - Sarcastic: 5 reviews")
    print(f"\n  NOTE: This is development/testing data only.")
    print(f"        NOT official training data.")


if __name__ == "__main__":
    create_fixture()
