"""Configurable, platform-neutral review topic taxonomy."""

TOPIC_CONFIDENCE_THRESHOLD = 0.35
TOPIC_MODEL_NAME = "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli"

TOPIC_TAXONOMY = [
    {"label": "Quality", "definition": "quality, condition, material, durability, taste, reliability, cleanliness, or overall quality"},
    {"label": "Performance / Functionality", "definition": "whether something works, performance, speed, bugs, crashes, technical behavior, functionality, or lag"},
    {"label": "Features / Content", "definition": "features, options, content, gameplay, graphics, functions offered, or available features"},
    {"label": "Service / Support", "definition": "seller, staff, customer service, support, communication, responsiveness, or assistance"},
    {"label": "Delivery / Transaction", "definition": "shipping, delivery, courier, order process, payment transaction, or transaction timing"},
    {"label": "Price / Value", "definition": "price, expensive, cheap, affordable, worth it, sulit, or value for money"},
    {"label": "Usability / Experience", "definition": "ease of use, convenience, comfort, user experience, overall experience, or enjoyment"},
    {"label": "Accuracy / Expectations", "definition": "whether the actual result matches the description, wrong color, wrong size, wrong quantity, inaccurate description, or expectation mismatch"},
    {"label": "Availability / Accessibility", "definition": "availability, access, opening hours, booking, accessibility, or availability of features or services"},
    {"label": "Environment / Location", "definition": "location, surroundings, atmosphere, place, facilities, environment, or view"},
    {"label": "Other / General", "definition": "a review that does not clearly belong to the other categories"},
]

TOPIC_LABELS = [topic["label"] for topic in TOPIC_TAXONOMY]
