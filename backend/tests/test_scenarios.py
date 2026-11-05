import unittest

from feedback import build_wrap_up_prompt
from scenarios import build_interview_prompt, build_scenario_wrap_up_prompt


class ScenarioPromptTests(unittest.TestCase):
    def test_interview_prompts_keep_scenario_requirements_separate(self):
        ci_cd = build_interview_prompt("ci_cd")
        observability = build_interview_prompt("observability")
        self.assertIn("Five developers merge changes", ci_cd)
        self.assertIn("Failed tests must prevent promotion", ci_cd)
        self.assertNotIn("Five developers merge changes", observability)
        self.assertNotIn("Failed tests must prevent promotion", observability)
        self.assertIn("ten containerized services", observability)
        self.assertIn("metrics, logs, and traces", observability)
        for prompt in (ci_cd, observability):
            self.assertIn("Ask one question at a time", prompt)
            self.assertIn("Do not use tools or inspect files", prompt)
            self.assertIn("Distinguish visible evidence", prompt)

    def test_wrap_up_uses_the_selected_assessment_criteria(self):
        ci_cd = build_scenario_wrap_up_prompt("ci_cd")
        observability = build_scenario_wrap_up_prompt("observability")
        self.assertIn("Build, tests, and artifacts:", ci_cd)
        self.assertIn("Instrumentation and signals:", observability)
        self.assertIn("SLOs, alerting, and investigation:", observability)
        self.assertNotIn("Build, tests, and artifacts:", observability)
        self.assertNotIn("pipeline approach", observability)
        for prompt in (ci_cd, observability):
            self.assertIn("insufficient", prompt)
            self.assertIn("Do not invent evidence, numerical scores", prompt)

    def test_evidence_wrap_up_accepts_observability_without_ci_cd_rubric(self):
        prompt = build_wrap_up_prompt([], scenario_id="observability")
        self.assertTrue(prompt.startswith(build_scenario_wrap_up_prompt("observability")))
        self.assertIn("Evidence citation rules:", prompt)
        self.assertNotIn("Build, tests, and artifacts:", prompt)

    def test_unknown_scenario_is_rejected(self):
        for builder in (build_interview_prompt, build_scenario_wrap_up_prompt):
            with self.assertRaisesRegex(ValueError, "Unknown scenario ID"):
                builder("missing")
