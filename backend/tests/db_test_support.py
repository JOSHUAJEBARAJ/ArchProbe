from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from sqlalchemy import create_engine

from db_models import InterviewRecord
import storage


def use_test_database(test_case, *, initialize=True):
    """Keep lifecycle tests and worker threads away from real interview data."""
    directory = test_case.enterContext(TemporaryDirectory())
    engine = create_engine(f"sqlite:///{Path(directory) / 'test.db'}")
    test_case.addCleanup(engine.dispose)
    if initialize:
        InterviewRecord.metadata.create_all(engine)
    test_case.enterContext(patch.object(storage, "engine", engine))
    return engine
