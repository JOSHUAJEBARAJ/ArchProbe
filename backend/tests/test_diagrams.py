import copy
import json
import unittest

from diagrams import diagram_context
from models import DiagramSnapshot


class DiagramContextTests(unittest.TestCase):
    def test_preserves_labels_layout_and_connector_evidence(self):
        elements = [
            {
                "id": "git", "type": "rectangle", "x": 10, "y": 20,
                "width": 100, "height": 50, "angle": 0,
                "groupIds": ["pipeline"], "frameId": "staging",
                "boundElements": [{"id": "label", "type": "text"}],
                "strokeStyle": "dashed", "backgroundColor": "#fff",
            },
            {"id": "label", "type": "text", "text": "Git → CI",
             "containerId": "git"},
            {
                "id": "arrow", "type": "arrow", "x": 110, "y": 45,
                "points": [[0, 0], [80, 0]],
                "startBinding": {"elementId": "git", "focus": 0, "gap": 5},
                "endBinding": {"elementId": "ci", "focus": 0, "gap": 5},
                "startArrowhead": None, "endArrowhead": "arrow",
            },
        ]
        result = diagram_context(DiagramSnapshot(revision=3, elements=elements))
        self.assertEqual(result, {"revision": 3, "elements": elements})

    def test_excludes_deleted_elements_and_editor_metadata_without_mutation(self):
        snapshot = DiagramSnapshot(revision=2, elements=[
            {
                "id": "ci", "type": "rectangle", "x": 20, "y": 30,
                "isDeleted": False, "seed": 123, "version": 8,
                "versionNonce": 456, "updated": 1000, "index": "a1",
                "locked": True, "customData": {"editorNote": "unused"},
            },
            {"id": "old", "type": "text", "text": "Removed", "isDeleted": True},
        ])
        original = copy.deepcopy(snapshot.model_dump())
        result = diagram_context(snapshot)
        self.assertEqual(result, {
            "revision": 2,
            "elements": [{"id": "ci", "type": "rectangle", "x": 20, "y": 30}],
        })
        self.assertEqual(snapshot.model_dump(), original)
        self.assertLess(len(json.dumps(result)), len(snapshot.model_dump_json()))

    def test_empty_snapshot_stays_empty(self):
        self.assertEqual(
            diagram_context(DiagramSnapshot(revision=4, elements=[])),
            {"revision": 4, "elements": []},
        )
