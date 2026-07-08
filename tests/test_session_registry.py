import asyncio

from memaide.schemas import PatientContext
from memaide.service.session_registry import SessionContext, SessionRegistry


def _ctx(sid="s1"):
    return SessionContext(
        session_id=sid, patient=PatientContext(patient_id="p1", name="Rose")
    )


async def test_context_first_then_wait_returns_it():
    reg = SessionRegistry()
    reg.put_context("s1", _ctx())
    got = await reg.wait_context("s1", timeout=0.1)
    assert got.patient.name == "Rose"


async def test_wait_first_then_context_arrives():
    reg = SessionRegistry()

    async def late_put():
        await asyncio.sleep(0.01)
        reg.put_context("s1", _ctx())

    waiter = asyncio.create_task(reg.wait_context("s1", timeout=0.5))
    await late_put()
    got = await waiter
    assert got.session_id == "s1"


async def test_wait_times_out_returns_none():
    reg = SessionRegistry()
    got = await reg.wait_context("missing", timeout=0.05)
    assert got is None


async def test_drop_removes_context_and_event():
    reg = SessionRegistry()
    reg.put_context("s1", _ctx())
    reg.drop("s1")
    got = await reg.wait_context("s1", timeout=0.05)
    assert got is None


async def test_default_timeout_is_used_when_none_passed():
    reg = SessionRegistry(wait_timeout=0.05)
    got = await reg.wait_context("missing")
    assert got is None
