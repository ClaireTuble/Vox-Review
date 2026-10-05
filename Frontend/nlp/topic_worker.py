"""Long-lived JSON-lines worker for cached review-topic inference."""

from __future__ import annotations

import json
import sys

from predict_topics_batch import classify_reviews, set_topic_request_id


for line in sys.stdin:
    if not line.strip():
        continue
    request = json.loads(line)
    request_id = request.get("id")
    reviews = request.get("reviews")
    platform = request.get("platform")
    set_topic_request_id(request_id)
    try:
        response = classify_reviews(reviews, platform)
        response.update({"id": request_id, "success": True})
    except Exception as error:
        error_message = str(error)
        if isinstance(reviews, list):
            for review in reviews:
                if isinstance(review, str) and review:
                    error_message = error_message.replace(review, "[review text redacted]")
        response = {"id": request_id, "success": False, "error": error_message[:500]}
    print(json.dumps(response), flush=True)