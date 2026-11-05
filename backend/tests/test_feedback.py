import json
import unittest

from feedback import build_wrap_up_prompt, resolve_evidence
from scenarios import WRAP_UP_PROMPT


class FeedbackEvidenceTests(unittest.TestCase):
    def test_reference_normalization_deduplication_and_unavailable_sources(self):
        text, references = resolve_evidence(
            "Clear [answer 12], diagram [diagram 12 revision 2], repeated [Answer 12]. "
            "Wrong revision [Diagram 12 revision 3], missing diagram [Diagram 13 revision 1], "
            "unknown answer [Answer 99].",
            {12: 2, 13: None},
        )
        self.assertEqual(references, [(12, None), (12, 2)])
        self.assertIn("Clear [Answer 12]", text)
        self.assertEqual(text.count("[Source unavailable]"), 3)

    def test_wrap_up_sources_include_only_candidate_ids_and_exact_compact_snapshots(self):
        prompt = build_wrap_up_prompt([
            {"id": 1, "role": "interviewer", "text": "Do not cite this question."},
            {"id": 12, "role": "candidate", "text": "Tests gate production.", "diagram": {
                "revision": 2,
                "elements": [{"id": "test", "type": "text", "text": "Run tests", "seed": 42}],
            }},
            {"id": 13, "role": "candidate", "text": "My verbal clarification.", "diagram": None},
        ])
        self.assertTrue(prompt.startswith(WRAP_UP_PROMPT))
        sources = json.loads(prompt.split("Candidate evidence JSON:\n", 1)[1])
        self.assertEqual(sources, [
            {"message_id": 12, "answer": "Tests gate production.", "diagram": {
                "revision": 2, "elements": [{"id": "test", "type": "text", "text": "Run tests"}],
            }},
            {"message_id": 13, "answer": "My verbal clarification.", "diagram": None},
        ])

    def test_empty_interview_has_no_invented_sources(self):
        prompt = build_wrap_up_prompt([])
        self.assertEqual(json.loads(prompt.split("Candidate evidence JSON:\n", 1)[1]), [])
        self.assertIn("empty or insufficient", prompt)
        text, references = resolve_evidence("Invented [Answer 1]", {})
        self.assertEqual((text, references), ("Invented [Source unavailable]", []))
