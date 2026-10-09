"""Configurable, platform-neutral review topic taxonomy."""

TOPIC_CONFIDENCE_THRESHOLD = 0.35
TOPIC_MODEL_NAME = "intfloat/multilingual-e5-small"

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

TOPIC_E5_DESCRIPTIONS = [
    {
        "label": "Quality",
        "description": "product quality, materials, durability, build, workmanship, sturdiness, defects",
    },
    {
        "label": "Performance / Functionality",
        "description": "how well the product, service, or application works, operates, performs, responds, or functions",
    },
    {
        "label": "Features / Content",
        "description": "features, functions, specifications, design elements, included content, available options",
    },
    {
        "label": "Service / Support",
        "description": "customer service, seller support, assistance, communication, response, after-sales support",
    },
    {
        "label": "Delivery / Transaction",
        "description": "delivery, shipping, order processing, payment, transaction, package handling",
    },
    {
        "label": "Price / Value",
        "description": "price, cost, discount, affordability, value for money, worth the price",
    },
    {
        "label": "Usability / Experience",
        "description": "ease of use, installation, convenience, operation, user experience",
    },
    {
        "label": "Accuracy / Expectations",
        "description": "whether the actual product or service matches the description, claims, specifications, or expectations",
    },
    {
        "label": "Availability / Accessibility",
        "description": "stock availability, access, accessibility, whether something can be obtained or accessed",
    },
    {
        "label": "Environment / Location",
        "description": "physical environment, location, surroundings, indoor or outdoor setting",
    },
    {
        "label": "Other / General",
        "description": "content that does not clearly belong to the other categories",
    },
]

if [topic["label"] for topic in TOPIC_E5_DESCRIPTIONS] != TOPIC_LABELS:
    raise ValueError("E5 topic descriptions must match the topic taxonomy")
