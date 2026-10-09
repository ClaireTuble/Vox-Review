import json
import os
import subprocess
import sys
import unittest
from pathlib import Path


@unittest.skipUnless(
    os.getenv("RUN_TOPIC_WORKER_INTEGRATION") == "1",
    "Set RUN_TOPIC_WORKER_INTEGRATION=1 to run the real E5 worker test",
)
class TopicWorkerIntegrationTests(unittest.TestCase):
    def test_three_review_requests_reuse_one_worker_and_model(self):
        worker_path = Path(__file__).resolve().parents[1] / "topic_worker.py"
        requests = [
            {
                "id": f"integration-{index}",
                "platform": "googleplay",
                "reviews": [
                    "The app is useful and easy to navigate.",
                    "It crashes after the latest update.",
                    "Customer support has not replied to my request.",
                ],
            }
            for index in (1, 2)
        ]
        input_text = "".join(json.dumps(request) + "\n" for request in requests)

        completed = subprocess.run(
            [sys.executable, str(worker_path)],
            input=input_text,
            capture_output=True,
            text=True,
            timeout=216,
            check=True,
            cwd=worker_path.parent,
        )
        responses = [json.loads(line) for line in completed.stdout.splitlines()]
        events = [
            json.loads(line)
            for line in completed.stderr.splitlines()
            if line.startswith("{")
        ]

        self.assertEqual([response["id"] for response in responses], ["integration-1", "integration-2"])
        self.assertTrue(all(response["success"] for response in responses))
        self.assertTrue(all(len(response["results"]) == 3 for response in responses))
        self.assertTrue(all(response["model"] == "intfloat/multilingual-e5-small" for response in responses))

        request_events = [
            event for event in events
            if event.get("event") == "topic_request_received"
        ]
        self.assertEqual(len(request_events), 2)
        self.assertEqual(request_events[0]["workerPid"], request_events[1]["workerPid"])
        self.assertTrue(any(
            event.get("event") == "model_load_complete"
            and event.get("requestId") == "integration-1"
            for event in events
        ))
        self.assertTrue(any(
            event.get("event") == "model_cache_reused"
            and event.get("requestId") == "integration-2"
            for event in events
        ))
        for event_name in (
            "topic_embeddings_complete",
            "review_inference_complete",
            "topic_refinement_complete",
            "result_serialization_complete",
            "result_output_complete",
        ):
            self.assertTrue(any(event.get("event") == event_name for event in events), event_name)
        request_timings = [
            event["requestDurationMs"]
            for event in events
            if event.get("event") == "result_serialization_complete"
        ]
        self.assertEqual(len(request_timings), 2)
        self.assertTrue(all(duration < 186_000 for duration in request_timings))


if __name__ == "__main__":
    unittest.main()
