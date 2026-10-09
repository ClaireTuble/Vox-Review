"""Long-lived JSON-lines worker for cached review-topic inference."""

from __future__ import annotations

import json
import os
import sys
from time import perf_counter

from predict_topics_batch import classify_reviews, set_topic_request_id


for line in sys.stdin:
    if not line.strip():
        continue
    request_started = perf_counter()
    request = json.loads(line)
    request_id = request.get("id")
    reviews = request.get("reviews")
    platform = request.get("platform")
    set_topic_request_id(request_id)
    print(
        json.dumps({
            "event": "topic_request_received",
            "requestId": request_id,
            "workerPid": os.getpid(),
            "reviewCount": len(reviews) if isinstance(reviews, list) else None,
        }),
        file=sys.stderr,
        flush=True,
    )
    try:
        response = classify_reviews(reviews, platform)
        response.update({"id": request_id, "success": True})
    except Exception as error:
        error_message = str(error)
        if isinstance(reviews, list):
            for review in reviews:
                if isinstance(review, str) and review:
                    error_message = error_message.replace(review, "[review text redacted]")
        print(
            json.dumps({
                "event": "topic_request_failed",
                "requestId": request_id,
                "workerPid": os.getpid(),
                "errorType": type(error).__name__,
                "error": error_message[:500],
                "requestDurationMs": round((perf_counter() - request_started) * 1000, 3),
                "reviewCount": len(reviews) if isinstance(reviews, list) else None,
            }),
            file=sys.stderr,
            flush=True,
        )
        response = {"id": request_id, "success": False, "error": error_message[:500]}
    serialization_started = perf_counter()
    serialized_response = json.dumps(response)
    print(
        json.dumps({
            "event": "result_serialization_complete",
            "requestId": request_id,
            "serializationDurationMs": round((perf_counter() - serialization_started) * 1000, 3),
            "responseBytes": len(serialized_response.encode("utf-8")),
            "requestDurationMs": round((perf_counter() - request_started) * 1000, 3),
        }),
        file=sys.stderr,
        flush=True,
    )
    output_started = perf_counter()
    sys.stdout.write(serialized_response + "\n")
    sys.stdout.flush()
    print(
        json.dumps({
            "event": "result_output_complete",
            "requestId": request_id,
            "outputDurationMs": round((perf_counter() - output_started) * 1000, 3),
        }),
        file=sys.stderr,
        flush=True,
    )