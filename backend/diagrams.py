from models import DiagramSnapshot


# Keep evidence needed to interpret the drawing, rather than editor history.
DIAGRAM_FIELDS = (
    "id", "type", "x", "y", "width", "height", "angle",
    "text", "containerId", "boundElements", "groupIds", "frameId", "name",
    "points", "startBinding", "endBinding", "startArrowhead", "endArrowhead",
    "elbowed", "fixedSegments", "startIsSpecial", "endIsSpecial",
    "strokeColor", "backgroundColor", "fillStyle", "strokeStyle", "opacity",
    "fontSize", "textAlign", "verticalAlign", "link",
    "fileId", "scale", "crop",
)


def diagram_context(snapshot: DiagramSnapshot) -> dict:
    """Project a complete snapshot into model context without mutating the scene."""
    return {
        "revision": snapshot.revision,
        "elements": [
            {key: element[key] for key in DIAGRAM_FIELDS if key in element}
            for element in snapshot.elements
            if not element.get("isDeleted", False)
        ],
    }
